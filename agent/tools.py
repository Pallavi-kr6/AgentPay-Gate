"""OpenAI-style tool schemas for Groq's function-calling API.
https://console.groq.com/docs/tool-use
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search the merchant's product catalog by free-text query, category and/or max price.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free text search, e.g. 'earbuds'"},
                    "category": {"type": "string", "description": "Exact category filter, optional"},
                    "max_price": {"type": "number", "description": "Maximum price in INR, optional"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_purchase_policy",
            "description": (
                "Check whether buying a product would be ALLOWed, need human "
                "REQUIRE_APPROVAL, or be BLOCKed by the merchant's spending policy. "
                "Does NOT create an order or move money. Always call this before "
                "telling the user you are about to buy something expensive."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string"},
                    "quantity": {"type": "integer", "default": 1},
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_purchase",
            "description": (
                "Attempt to buy a product. Policy-checked and audited automatically. "
                "May return PAID, AWAITING_APPROVAL (share the payment_link with the "
                "user and stop - do not claim the purchase is done), BLOCKED, or FAILED."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string"},
                    "quantity": {"type": "integer", "default": 1},
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_audit_trail",
            "description": "Fetch the full step-by-step audit trail for a purchase trace_id, to explain exactly what happened and why.",
            "parameters": {
                "type": "object",
                "properties": {"trace_id": {"type": "string"}},
                "required": ["trace_id"],
            },
        },
    },
]

SYSTEM_PROMPT = """You are a bounded shopping agent for a Razorpay merchant. You act on \
behalf of a human buyer who has given you a budget and category boundaries that you \
CANNOT see or override directly - they are enforced server-side by a policy engine.

Rules you must follow:
1. Always search before you buy. Never guess a product_id.
2. Always call check_purchase_policy (or just call execute_purchase, which enforces \
policy itself) - never claim something was purchased unless the tool result says PAID.
3. If the result is AWAITING_APPROVAL, tell the user clearly that YOU did not complete \
the purchase, share the payment_link, and explain in plain language why (the reason \
field). Do not say "I bought it".
4. If the result is BLOCKED, explain the specific reason in plain language and suggest \
a cheaper/alternate option from the catalog if one exists.
5. If the result is FAILED, explain that payment was attempted and declined after \
retrying, and that you stopped instead of retrying indefinitely.
6. Be concise, honest, and always cite the actual reason string from the tool result - \
never invent a justification.
"""
