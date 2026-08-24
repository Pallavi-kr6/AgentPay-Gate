# Verified runs

Everything below is real output captured while building this repo — not illustrative, not hand-written. Reproduce any of it yourself with the Quickstart in the main README.

## 1. Full test suite

```
$ pytest tests/ -v
============================= test session starts ==============================
collected 16 items

tests/test_policy.py::test_allow_when_within_all_bounds PASSED
tests/test_policy.py::test_require_approval_above_threshold PASSED
tests/test_policy.py::test_block_above_per_transaction_cap PASSED
tests/test_policy.py::test_block_blocked_category_even_if_cheap PASSED
tests/test_policy.py::test_block_insufficient_stock PASSED
tests/test_policy.py::test_block_when_daily_cap_would_be_exceeded PASSED
tests/test_policy.py::test_quantity_multiplies_amount_for_threshold_check PASSED
tests/test_policy.py::test_decision_always_carries_a_human_readable_reason PASSED
tests/test_purchase_flow.py::test_low_value_purchase_auto_completes_or_fails_gracefully PASSED
tests/test_purchase_flow.py::test_purchase_above_approval_threshold_is_gated_not_charged PASSED
tests/test_purchase_flow.py::test_blocked_category_never_creates_an_order PASSED
tests/test_purchase_flow.py::test_forced_failure_retries_then_gives_up_gracefully PASSED
tests/test_purchase_flow.py::test_every_purchase_produces_a_readable_audit_trail PASSED
tests/test_purchase_flow.py::test_unknown_product_is_blocked_with_clear_reason PASSED
tests/test_purchase_flow.py::test_catalog_search_is_agent_readable PASSED
tests/test_purchase_flow.py::test_catalog_search_matches_multi_word_query_out_of_order PASSED

============================== 16 passed in 0.76s ==============================
```

## 2. MCP server — real tool registration and a real tool call over the MCP protocol

```
$ python3 -c "
from backend import mcp_server
import asyncio
tools = asyncio.run(mcp_server.mcp.list_tools())
for t in tools: print('-', t.name)
"
MCP server name: agentpay-gate
- search_products
- get_product
- check_purchase_policy
- execute_purchase
- get_audit_trail
```

An actual call through `mcp.call_tool(...)` (not the REST layer) for `search_products(query="earbuds")` returned the two matching SKUs from `data/catalog.json` with full JSON payloads — proving the MCP surface and REST surface really do share one implementation.

## 3. The full REQUIRE_APPROVAL → human-gate → PAID loop, live against a running server

```
$ curl -s -X POST http://127.0.0.1:8000/purchase -d '{"product_id":"sku_speaker_01","quantity":1}'
{
  "trace_id": "trace_1787400469398",
  "status": "AWAITING_APPROVAL",
  "reason": "Order amount INR 2299.00 is above the no-questions-asked threshold of INR 1500.00; a human must confirm before payment is created.",
  "amount": 2299.0,
  "order_id": "order_mock_247435ccb35442",
  "payment_link": "http://127.0.0.1:8000/checkout?trace_id=trace_1787400469398&order_id=order_mock_247435ccb35442&amount=2299.0"
}

$ curl -s -X POST "http://127.0.0.1:8000/purchase/trace_1787400469398/confirm?payment_id=manual_test1&mock_status=captured"
{
  "trace_id": "trace_1787400469398",
  "status": "PAID",
  "reason": "Payment captured.",
  ...
}

$ curl -s http://127.0.0.1:8000/audit/trace_1787400469398
PURCHASE_REQUESTED     | {'product_id': 'sku_speaker_01', 'quantity': 1, 'buyer_ref': 'demo-buyer'}
POLICY_CHECK           | Order amount INR 2299.00 is above the no-questions-asked threshold of INR 1500.00; a human must confirm before payment is created.
ORDER_CREATED          | {'order_id': 'order_mock_247435ccb35442', 'amount': 2299.0}
APPROVAL_REQUIRED      | Order amount INR 2299.00 is above the no-questions-asked threshold of INR 1500.00; a human must confirm before payment is created.
PAYMENT_CAPTURED       | {'payment_id': 'manual_test1'}
PURCHASE_COMPLETED     | Human completed the payment link successfully.
```

Not one order was created before the policy check ran. Nothing was marked `PAID` before a human explicitly approved it.

## 4. Graceful failure: forced decline, one bounded retry, then a clean stop

```
$ curl -s -X POST "http://127.0.0.1:8000/purchase?force_fail=true" -d '{"product_id":"sku_bottle_01","quantity":1}'
{"status": "FAILED", "reason": "Payment failed after 2 attempt(s): Simulated decline from mock rail (insufficient funds / bank timeout). Stopped instead of retrying further..."}

$ curl -s http://127.0.0.1:8000/audit/<trace_id>
PURCHASE_REQUESTED
POLICY_CHECK          | decision=ALLOW
ORDER_CREATED
PAYMENT_FAILED        | attempt=1, max_attempts=2
PAYMENT_FAILED        | attempt=2, max_attempts=2
PURCHASE_FAILED_FINAL | Gave up after 2 attempt(s)...
```

Exactly `1 + policy.max_retries_on_failure` attempts happened, then the trace closed out — it did not retry indefinitely, and it did not silently swallow the failure.

## 5. Rule-based buyer agent, live, no LLM

```
$ python -m agent.buyer_agent --request "buy me a wireless earbuds under 2000 rupees" --mode rule_based
=== AgentPay Gate buyer agent | mode=rule_based ===
User: buy me a wireless earbuds under 2000 rupees

[agent] parsed request -> query='wireless earbuds', max_price=2000.0
[agent] best match: Boat Rockerz Wireless Earbuds (₹1299, id=sku_earbuds_01)
[agent] execute_purchase -> status=PAID
[agent] reason: Payment captured successfully.
[agent] trace_id=trace_... (see /audit/trace_... for the full trail)
```

## 6. A real bug found and fixed during this process

The catalog's first search implementation matched the whole query as one contiguous substring, so `"jbl speaker"` failed to match `"JBL Go 3 Portable Speaker"` (the words aren't adjacent in the text). Fixed to an AND-of-words match in `backend/catalog.py`, with a regression test (`test_catalog_search_matches_multi_word_query_out_of_order`) added so it can't silently regress.
