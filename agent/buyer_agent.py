"""
The AI shopping agent that acts as the MCP/REST *client* against AgentPay
Gate. This is the "AI buyer" half of Track 1's "make a merchant transactable
by an AI buyer end to end" brief.

Two modes, controlled by AGENT_MODE (env) or --mode (CLI):

  rule_based (default, no API key needed)
      A small deterministic planner: parse a budget out of the request,
      search the catalog, pick the best match, call execute_purchase, explain
      the result from the audit trail. Zero external dependencies - this is
      what CI and a judge with no Groq key can run.

  groq
      A real LLM (Llama 3.3 70B on Groq, or any Groq tool-calling model) does
      the planning via OpenAI-style tool calling, calling the exact same
      backend endpoints. This is the "conversational in-app checkout" example
      direction from the brief.

Both modes talk to AgentPay Gate over plain REST (see agent/mcp_buyer_agent.py
for the alternative that speaks real MCP over stdio to backend/mcp_server.py).

Usage:
    python -m agent.buyer_agent --request "buy me wireless earbuds under 2000 rupees"
    python -m agent.buyer_agent --request "buy the Dell laptop" --mode groq
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import httpx

from backend.config import BACKEND_URL, GROQ_API_KEY, GROQ_MODEL, AGENT_MODE as DEFAULT_MODE
from agent.tools import TOOLS, SYSTEM_PROMPT


class BackendClient:
    def __init__(self, base_url: str = BACKEND_URL):
        self.base_url = base_url.rstrip("/")
        self.http = httpx.Client(timeout=15.0)

    def search_products(self, query: str | None = None, category: str | None = None, max_price: float | None = None):
        params = {k: v for k, v in dict(q=query, category=category, max_price=max_price).items() if v is not None}
        r = self.http.get(f"{self.base_url}/catalog/search", params=params)
        r.raise_for_status()
        return r.json()

    def check_purchase_policy(self, product_id: str, quantity: int = 1):
        r = self.http.get(f"{self.base_url}/policy/check/{product_id}", params={"quantity": quantity})
        r.raise_for_status()
        return r.json()

    def execute_purchase(self, product_id: str, quantity: int = 1):
        r = self.http.post(f"{self.base_url}/purchase", json={"product_id": product_id, "quantity": quantity})
        r.raise_for_status()
        return r.json()

    def get_audit_trail(self, trace_id: str):
        r = self.http.get(f"{self.base_url}/audit/{trace_id}")
        r.raise_for_status()
        return r.json()


def dispatch_tool(client: BackendClient, name: str, args: dict) -> dict:
    if name == "search_products":
        return {"results": client.search_products(**args)}
    if name == "check_purchase_policy":
        return client.check_purchase_policy(**args)
    if name == "execute_purchase":
        return client.execute_purchase(**args)
    if name == "get_audit_trail":
        return {"trail": client.get_audit_trail(**args)}
    return {"error": f"Unknown tool '{name}'"}


# ------------------------------------------------------------ rule-based ---
_BUDGET_RE = re.compile(r"(?:under|below|less than|within|budget of|max)\s*(?:rs\.?|inr|₹)?\s*(\d+)", re.I)
_STOPWORDS = {
    "buy", "me", "a", "an", "the", "please", "get", "purchase", "order", "some",
    "under", "below", "less", "than", "within", "budget", "of", "max", "rupees",
    "rs", "inr", "for",
}


def _extract_budget(text: str) -> float | None:
    m = _BUDGET_RE.search(text)
    return float(m.group(1)) if m else None


def _extract_query(text: str) -> str:
    words = re.findall(r"[a-zA-Z]+", text.lower())
    words = [w for w in words if w not in _STOPWORDS and not w.isdigit()]
    return " ".join(words)


def run_rule_based(client: BackendClient, request: str) -> str:
    budget = _extract_budget(request)
    query = _extract_query(request)
    log = [f"[agent] parsed request -> query='{query}', max_price={budget}"]

    results = client.search_products(query=query or None, max_price=budget)
    if not results:
        return "\n".join(log + [f"[agent] No products matched '{query}' within budget {budget}. Nothing purchased."])

    results.sort(key=lambda p: p["price"])
    pick = results[0]
    log.append(f"[agent] best match: {pick['name']} (₹{pick['price']}, id={pick['id']})")

    outcome = client.execute_purchase(pick["id"], 1)
    log.append(f"[agent] execute_purchase -> status={outcome['status']}")
    log.append(f"[agent] reason: {outcome['reason']}")
    if outcome.get("payment_link"):
        log.append(f"[agent] >>> human approval needed, payment link: {outcome['payment_link']}")
    log.append(f"[agent] trace_id={outcome['trace_id']} (see /audit/{outcome['trace_id']} for the full trail)")
    return "\n".join(log)


# ----------------------------------------------------------------- groq ---
def run_groq_agent(client: BackendClient, request: str, model: str = GROQ_MODEL, max_turns: int = 8) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError(
            "AGENT_MODE=groq but GROQ_API_KEY is not set. Get a free key at "
            "https://console.groq.com/keys and export GROQ_API_KEY=... "
            "(or run with --mode rule_based, which needs no key at all)."
        )
    from groq import Groq
    groq_client = Groq(api_key=GROQ_API_KEY)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request},
    ]
    transcript = []

    for turn in range(max_turns):
        resp = groq_client.chat.completions.create(
            model=model, messages=messages, tools=TOOLS, tool_choice="auto", temperature=0.2,
        )
        msg = resp.choices[0].message
        messages.append(msg.model_dump(exclude_none=True))

        if not msg.tool_calls:
            transcript.append(f"[assistant] {msg.content}")
            break

        for call in msg.tool_calls:
            args = json.loads(call.function.arguments or "{}")
            transcript.append(f"[tool_call] {call.function.name}({args})")
            result = dispatch_tool(client, call.function.name, args)
            transcript.append(f"[tool_result] {json.dumps(result)[:400]}")
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "name": call.function.name,
                "content": json.dumps(result),
            })
    else:
        transcript.append("[agent] hit max_turns without a final answer - stopping.")

    return "\n".join(transcript)


def main():
    parser = argparse.ArgumentParser(description="AgentPay Gate buyer agent")
    parser.add_argument("--request", required=True, help="Natural-language shopping request")
    parser.add_argument("--mode", choices=["rule_based", "groq"], default=DEFAULT_MODE)
    parser.add_argument("--backend-url", default=BACKEND_URL)
    args = parser.parse_args()

    client = BackendClient(args.backend_url)
    print(f"=== AgentPay Gate buyer agent | mode={args.mode} ===")
    print(f"User: {args.request}\n")

    if args.mode == "groq":
        print(run_groq_agent(client, args.request))
    else:
        print(run_rule_based(client, args.request))


if __name__ == "__main__":
    sys.exit(main())
