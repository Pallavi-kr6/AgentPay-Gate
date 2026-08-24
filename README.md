# AgentPay Gate

**A merchant storefront an AI shopping agent can actually transact with — bounded, gated, and fully audited.**

Built for the [Razorpay AI Buildathon](https://razorpay.com/buildathon/) — **Track 1: AI Growth & Agentic Commerce**.

> Live-tested, not just written. Every claim in this README (policy blocks, approval gates, graceful failure, the MCP tool calls) was actually run against a live server while building this — see [`demo/verified_runs.md`](demo/verified_runs.md) for the raw terminal output.

---

## The gap

Every AI-buyer-commerce track brief this year points at the same fact: 2026 is the year four different companies shipped four different protocols for the same problem — an AI agent needing to browse a catalog and pay a merchant:

| Protocol | Owner | Layer it standardizes |
|---|---|---|
| **ACP** (Agentic Commerce Protocol) | OpenAI + Stripe | Checkout flow between an agent and a merchant — powers ChatGPT's Instant Checkout |
| **AP2** (Agent Payments Protocol) | Google (60+ partners) | Authorization/trust — cryptographically signed "mandates" proving a human authorized the agent, within limits. Explicitly designed to be compatible with MCP. |
| **UCP** (Universal Commerce Protocol) | Google + Shopify/Etsy/Target/Walmart | The full merchant journey (catalog discovery → cart → purchase) |
| **x402** | Coinbase | Machine-to-machine settlement over HTTP, stablecoin-native |

And closer to home: NPCI is reportedly building a **Unified Agent Protocol (UAP)** — a verification layer on top of UPI that would let "trusted" AI agents transact within **user-defined spending limits and consent controls**, without changing UPI's underlying rails. It hasn't launched yet (it needs RBI sign-off), which is exactly the point: **the authorization/bounds layer these protocols all put at the center doesn't have a working reference implementation on Razorpay's own rails today.**

Razorpay already ships an [official MCP server](https://github.com/razorpay/razorpay-mcp-server) — but it's the **merchant back-office** half (a human/agent operating *your* Razorpay account: refunds, settlements, disputes). Nobody has shipped the **buyer-facing** half on Razorpay: a small merchant whose catalog an AI agent can browse, and whose checkout an AI agent can complete, inside merchant-defined spending bounds, with a human pulled in exactly when a rule says so.

**That's the gap this fills.** AgentPay Gate is a working, minimal version of "what would a UAP/AP2-style bounded-agent checkout look like, running on Razorpay Test Mode, today" — not a pitch deck, a repo you can run.

---

## How this maps to Track 1's actual bar

> *"Every money action explainable, bounded and gated. Show the audit trail and one failure handled gracefully."*

| Requirement | Where it lives |
|---|---|
| **Bounded** | [`backend/policy.py`](backend/policy.py) — hard per-transaction cap, daily cap, blocked categories, stock checks. Nothing spends outside these, ever. |
| **Gated** | Any purchase above `requires_approval_above` stops and creates a payment link for a human — no order is silently completed. See [`backend/service.py`](backend/service.py) `execute_purchase()`. |
| **Explainable** | Every decision returns a plain-English `reason` string *before* anything happens, not after. Nothing is a bare `true`/`false`. |
| **Audit trail** | [`backend/audit.py`](backend/audit.py) — append-only SQLite + JSONL log of every policy check, order, payment attempt, retry and outcome. Browsable live at `/dashboard`. |
| **One failure handled gracefully** | [`_settle_with_retries()`](backend/service.py) — bounded retry (configurable, default 1), then stops and reports why instead of retrying forever. Verified live in [`demo/verified_runs.md`](demo/verified_runs.md). |

---

## Architecture

```
                        ┌─────────────────────────┐
   AI shopping agent    │   backend/service.py    │      Razorpay
   (Groq / rule-based)  │  (single source of truth)│      Test Mode
        │               │                         │          │
        │  HTTP          catalog.py  policy.py     │          │
        ├──────────────▶│  audit.py  payment_...  │◀─────────┤
        │               └───────────┬─────────────┘
        │  MCP (stdio)               │
        └──────────────▶ mcp_server.py
                                     │
                          ┌──────────┴──────────┐
                          │  SQLite + JSONL      │
                          │  audit trail         │
                          └──────────────────────┘
```

`backend/service.py` is the **only** place a purchase is ever executed. `backend/main.py` (REST) and `backend/mcp_server.py` (real [Model Context Protocol](https://modelcontextprotocol.io) server, works with Claude Desktop / Cursor too) are two thin doors into the same function — mirroring how AP2 explicitly designs for "compatible with REST API and MCP." Nobody can buy anything by going around the policy engine, because there's no code path that does.

`backend/views.py` sits alongside `service.py` as a **read-model layer**: it groups the audit trail into transactions/approvals/dashboard summaries for the Next.js frontend (`web/`) to consume. It never moves money or makes a policy decision — it could be deleted entirely and no purchase's outcome would change. The frontend (`web/`) then consumes both surfaces over plain typed REST calls; it never sees a Razorpay or Groq credential (see `web/src/app/(dashboard)/settings/page.tsx`).

**Three runtime modes, same codebase, one env var:**

| `PAYMENT_PROVIDER` | `AGENT_MODE` | What happens |
|---|---|---|
| `mock` (default) | `rule_based` (default) | Zero credentials. Deterministic. This is what CI runs and what a judge gets with no setup. |
| `mock` | `groq` | Real LLM reasoning (Llama 3.3 70B via Groq), fake payment rail. |
| `razorpay` | `groq` | The real thing: real Razorpay Test Mode Orders + Payment Links, real LLM. |

---

## Quickstart (zero credentials, 2 minutes)

**Backend:**
```bash
git clone <this-repo-url> agentpay-gate && cd agentpay-gate
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```
Or run everything (venv, install, tests, server) in one shot: `./scripts/quickstart.sh`

**Frontend** (separate terminal, Node 20+):
```bash
cd web
npm install
npm run dev       # http://localhost:3000
```

Open **http://localhost:3000** — that's the real dashboard now (Next.js, see [`web/README.md`](web/README.md) for details). Click a demo scenario button, or drive it from the CLI:

```bash
python -m agent.buyer_agent --request "buy me wireless earbuds under 2000 rupees"
python -m agent.buyer_agent --request "buy me a jbl speaker under 3000 rupees"   # gets gated
python -m agent.buyer_agent --request "buy me a laptop under 50000 rupees"       # gets blocked
```

Run the tests (no server needed):
```bash
pytest tests/ -v     # 16 tests, all pure logic + FastAPI TestClient, no network calls
```

---

## Turning on the real thing

### 1. Free Groq API key (for the LLM-powered agent)
1. Sign up free at **https://console.groq.com/keys** (Google/GitHub login, no card).
2. `export GROQ_API_KEY=gsk_...` and `export AGENT_MODE=groq`.
3. Model used: `llama-3.3-70b-versatile` (supports tool calling; see [Groq's tool-use docs](https://console.groq.com/docs/tool-use)). Change via `GROQ_MODEL`.

```bash
python -m agent.buyer_agent --request "buy me a bluetooth speaker under 2500" --mode groq
```

### 2. Free Razorpay Test Mode keys (for the real payment rail)
1. Sign up at **https://dashboard.razorpay.com/signup** — Test Mode needs no KYC/business documents.
2. Toggle **Test Mode** (top-left switch), then **Settings → API Keys → Generate Test Key**.
3. `export PAYMENT_PROVIDER=razorpay RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=...`

No real money moves in Test Mode. To simulate a human paying the generated Payment Link, use Razorpay's documented [test instruments](https://razorpay.com/docs/payments/payments/test-card-upi-details/): UPI id **`success@razorpay`** always succeeds, **`failure@razorpay`** always fails — no real bank login needed.

### 3. Real MCP client (optional, e.g. Claude Desktop)
```json
{
  "mcpServers": {
    "agentpay-gate": {
      "command": "python",
      "args": ["-m", "backend.mcp_server"],
      "cwd": "/absolute/path/to/agentpay-gate"
    }
  }
}
```
Then ask Claude Desktop to "search agentpay-gate for earbuds under ₹2000 and buy one" — it will call the exact same policy-checked, audited tools.

---

## A design decision worth calling out: why "ALLOW" still needs a payment link

It would be easy to make the mock rail auto-charge on `ALLOW` and call it "autonomous commerce." That's not how UPI Autopay, card networks, or NPCI's proposed UAP actually work even for small pre-authorized amounts — there is always *some* instrument or mandate underneath, because a payment rail without any consent primitive isn't safe infrastructure, it's a liability. So in real Razorpay mode, `ALLOW` and `REQUIRE_APPROVAL` differ in **whether an extra human review gate is inserted before the payment link is even generated** — not in whether an instrument is needed at all. The mock rail auto-settles `ALLOW` purely so the happy path is demoable without a browser in the loop; the real-money path is honest about this constraint rather than papering over it.

---

## Project structure

```
agentpay-gate/
├── backend/
│   ├── service.py          # single source of truth: policy → payment → audit
│   ├── policy.py           # bounded/gated decision engine (ALLOW/REQUIRE_APPROVAL/BLOCK)
│   ├── payment_provider.py # MockProvider + RazorpayProvider, same interface
│   ├── audit.py            # SQLite + JSONL append-only audit trail
│   ├── catalog.py           # agent-readable product feed (ACP/UCP-style)
│   ├── main.py             # FastAPI REST surface
│   └── mcp_server.py        # real MCP server, same tools as REST
├── agent/
│   ├── buyer_agent.py       # Groq tool-calling agent + deterministic fallback
│   └── tools.py              # OpenAI-style tool schemas + system prompt
├── frontend/                  # legacy static HTML dashboard/checkout (superseded
│   ├── audit_dashboard.html   # by web/ below; kept only so old bookmarked links
│   └── checkout.html          # don't 404 - backend/main.py redirects to web/ now)
├── web/                       # the real dashboard: Next.js + TypeScript + Tailwind
│   ├── src/app/                (landing, dashboard shell, checkout gate)
│   ├── src/components/         (ui primitives, dashboard/approvals/demo widgets)
│   └── src/lib/                (typed API client, types, hooks)
├── data/
│   ├── catalog.json          # seed product catalog
│   └── policy.json           # merchant-configurable spending bounds
├── tests/                    # 16 tests, pure logic + FastAPI TestClient
└── demo/
    ├── demo_script.md        # suggested 5-minute pitch-video walkthrough
    └── verified_runs.md      # raw terminal output this README's claims are based on
```

---

## What I'd build next

- Real AP2-style signed mandates (a cryptographic proof the human actually set these bounds) instead of a JSON policy file a server admin edits.
- A `/catalog/feed.json` endpoint shaped to match ACP's product-feed schema directly, so ChatGPT-style agents can ingest it with zero translation.
- Multi-merchant support with per-merchant policy, so one agent session can shop across several AgentPay-Gate-enabled stores and the daily cap is enforced across all of them.

## License

MIT — see [LICENSE](LICENSE).
