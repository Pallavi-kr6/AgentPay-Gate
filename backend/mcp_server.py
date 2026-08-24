"""
MCP server for AgentPay Gate.

This exposes the exact same bounded/gated purchase flow from
backend/service.py as MCP tools, so any real MCP client - Claude Desktop,
Cursor, or a custom shopping agent - can browse this merchant's catalog and
buy from it, the same way ACP describes being "Compatible with REST API and
MCP". The REST API in backend/main.py and this server are two doors into the
one policy-checked, audited service layer; nobody can buy anything by
skipping backend/service.py.

Run directly:
    python -m backend.mcp_server

Point a client at it (e.g. Claude Desktop's claude_desktop_config.json):
    {
      "mcpServers": {
        "agentpay-gate": {
          "command": "python",
          "args": ["-m", "backend.mcp_server"],
          "cwd": "/absolute/path/to/agentpay-gate"
        }
      }
    }
"""
from __future__ import annotations
import json
try:
    from mcp.server.fastmcp import FastMCP  # mcp SDK < 2.0
except ImportError:
    from mcp.server.mcpserver import MCPServer as FastMCP  # mcp SDK >= 2.0 (renamed)
from backend import service

mcp = FastMCP("agentpay-gate")


@mcp.tool()
def search_products(query: str = "", category: str = "", max_price: float | None = None) -> str:
    """Search the merchant's agent-readable product catalog. Returns JSON list
    of products with id, name, category, price, currency, stock, tags."""
    results = service.search_products(
        query=query or None, category=category or None, max_price=max_price
    )
    return json.dumps([p.model_dump() for p in results], indent=2)


@mcp.tool()
def get_product(product_id: str) -> str:
    """Fetch full details for one product by id."""
    p = service.get_product(product_id)
    if p is None:
        return json.dumps({"error": f"Unknown product_id '{product_id}'"})
    return p.model_dump_json(indent=2)


@mcp.tool()
def check_purchase_policy(product_id: str, quantity: int = 1) -> str:
    """Check the merchant's spending policy for a potential purchase WITHOUT
    creating an order or moving any money. Returns decision: ALLOW,
    REQUIRE_APPROVAL, or BLOCK, plus a human-readable reason and the current
    caps. Always call this (or just call execute_purchase, which calls it
    internally) before telling a user you're about to buy something."""
    decision = service.check_policy(product_id, quantity)
    if decision is None:
        return json.dumps({"error": f"Unknown product_id '{product_id}'"})
    return decision.model_dump_json(indent=2)


@mcp.tool()
def execute_purchase(product_id: str, quantity: int = 1, buyer_ref: str = "mcp-agent") -> str:
    """Attempt to purchase a product. Always policy-checked first.
    Possible outcomes (see `status` in the response):
      PAID              - captured immediately, below the approval threshold.
      AWAITING_APPROVAL - amount/category needs a human to click payment_link
                           before anything is charged. Tell the user this
                           explicitly and share the link; do not imply you
                           already bought it.
      AWAITING_PAYMENT  - real Razorpay mode only: order created, a human
                           still needs to complete payment_link.
      BLOCKED           - a hard rule stopped this; no order was created.
      FAILED            - payment was attempted and declined (after bounded
                           retries); nothing further will be retried
                           automatically.
    Every call is written to the audit trail; use get_audit_trail(trace_id)
    to show your reasoning to the user."""
    result = service.execute_purchase(product_id=product_id, quantity=quantity, buyer_ref=buyer_ref)
    return result.model_dump_json(indent=2)


@mcp.tool()
def get_audit_trail(trace_id: str) -> str:
    """Return the full, ordered, explainable audit trail for one purchase
    attempt: every policy check, order, payment attempt, retry and outcome."""
    trail = service.get_audit_trail(trace_id)
    return json.dumps([e.model_dump() for e in trail], indent=2, default=str)


if __name__ == "__main__":
    mcp.run(transport="stdio")
