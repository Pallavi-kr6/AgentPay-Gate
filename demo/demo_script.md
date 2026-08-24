# 5-minute pitch script

**Goal:** show, don't tell. Every claim below is something the judge can click or curl themselves.

### 0:00–0:40 — The gap (say this over the README's protocol table on screen)
"In 2026, OpenAI shipped ACP, Google shipped AP2 and UCP, Coinbase shipped x402 — four different
answers to 'how does an AI agent pay a merchant.' NPCI is reportedly building its own version for
UPI, called UAP — a layer that lets a *trusted* agent transact inside limits a human sets. It
hasn't launched. Razorpay ships an MCP server for merchants managing their *own* account — but not
the buyer side: a storefront an AI agent can browse and check out with, safely. That's what I
built: a small, real, bounded implementation of that idea running on Razorpay."

### 0:40–1:30 — Open the dashboard (`/dashboard`)
- Point at the spend gauge: "this is the bound — a hard daily cap and an approval threshold, not a
  suggestion."
- Click **"Buy earbuds — auto ALLOW"**. Watch the ledger update live. Expand the row: show the
  full audit trail (policy check → order → payment captured), each with a plain-English reason.

### 1:30–2:30 — The gate
- Click **"Buy JBL speaker — REQUIRE_APPROVAL"**. Show the status pill turn amber, `AWAITING_APPROVAL`.
- Open the generated payment link in a new tab (`/checkout?...`) — this is the human gate. Read the
  reason box out loud: it's the exact same string from the policy engine, not a rephrasing.
- Click **Approve**. Switch back to the dashboard, watch it flip to `PAID`.
- (Optional) Repeat and click **Decline** instead — show `FAILED`, no money moved, audit trail says why.

### 2:30–3:15 — Graceful failure
- Click **"Force a decline"**. Watch the ledger show `PAYMENT_FAILED` twice, then `PURCHASE_FAILED_FINAL`.
- Say: "one retry, then it stops and tells you why — it does not hammer the payment rail forever."

### 3:15–4:00 — The AI agent itself
- Terminal: `python -m agent.buyer_agent --request "buy me a laptop under 50000 rupees" --mode groq`
- Show the LLM calling `search_products` → `execute_purchase` → getting `BLOCKED` → explaining to
  the user in plain language *why*, without ever claiming it bought something it didn't.

### 4:00–4:40 — It's real infrastructure, not a demo trick
- Show `backend/mcp_server.py` running, and (if set up) Claude Desktop calling the same tools.
- Mention: same policy/audit code powers both REST and MCP — one purchase function, two doors in.
- Flip `PAYMENT_PROVIDER=razorpay`, show a real Razorpay Test Mode order created via `/docs`.

### 4:40–5:00 — Close
"Every number on this dashboard is really enforced server-side, every purchase has a full paper
trail, and it's built to be the buyer-side complement to what Razorpay already ships. I want to
build the real version of this."
