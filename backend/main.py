from __future__ import annotations
from typing import Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse

from backend import service, views
from backend.config import FRONTEND_URL
from backend.models import (
    PurchaseRequest, PurchaseResult, Product, AuditEvent,
    TransactionSummary, TransactionDetail, ApprovalItem, DashboardSummary,
    PolicyConfig, PolicyUpdateRequest, CatalogItem,
)

app = FastAPI(
    title="AgentPay Gate",
    description="An agent-readable storefront + bounded/gated checkout for Razorpay's AI Buildathon (Track 1: AI Growth & Agentic Commerce).",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": "AgentPay Gate",
        "docs": "/docs",
        "catalog": "/catalog/search",
        "dashboard": FRONTEND_URL,
        "checkout": "/checkout",
    }


# ---------------------------------------------------------------- catalog --
@app.get("/catalog/search", response_model=list[Product])
def catalog_search(q: Optional[str] = None, category: Optional[str] = None, max_price: Optional[float] = None):
    return service.search_products(query=q, category=category, max_price=max_price)


@app.get("/catalog/{product_id}", response_model=Product)
def catalog_get(product_id: str):
    product = service.get_product(product_id)
    if product is None:
        raise HTTPException(404, f"Unknown product_id '{product_id}'")
    return product


@app.get("/catalog", response_model=list[CatalogItem])
def catalog_list():
    """Full catalog with computed policy eligibility per product - powers the
    Catalog page. Read-only aggregation; see backend/views.py."""
    return views.catalog_with_policy_state()


# ----------------------------------------------------------------- policy --
@app.get("/policy/check/{product_id}")
def policy_check(product_id: str, quantity: int = 1):
    decision = service.check_policy(product_id, quantity)
    if decision is None:
        raise HTTPException(404, f"Unknown product_id '{product_id}'")
    return decision


@app.get("/policy/bounds")
def policy_bounds():
    """Merchant-configured caps + how much the agent has already spent today.
    Powers the dashboard's spend gauge - no product_id needed."""
    from backend.policy import Policy
    from backend import audit as audit_mod
    pol = Policy.load()
    return {
        "currency": pol.currency,
        "per_transaction_cap": pol.per_transaction_cap,
        "daily_cap": pol.daily_cap,
        "requires_approval_above": pol.requires_approval_above,
        "blocked_categories": pol.blocked_categories,
        "max_retries_on_failure": pol.max_retries_on_failure,
        "daily_spent_so_far": audit_mod.daily_spent(),
    }


@app.get("/policy", response_model=PolicyConfig)
def policy_get():
    """Full editable policy config (includes version) - powers the Policies
    page. `/policy/bounds` above is left untouched for backward compatibility
    with anything already reading it (e.g. the buyer agent)."""
    return views.get_policy_config()


@app.put("/policy", response_model=PolicyConfig)
def policy_update(update: PolicyUpdateRequest):
    """Lets a merchant change spending bounds from the dashboard instead of
    hand-editing data/policy.json. Persists to disk and bumps the policy
    version; does not change policy *semantics* (backend/policy.py's
    evaluate() is unaware this endpoint exists)."""
    return views.update_policy_config(update)


# --------------------------------------------------------------- purchase --
@app.post("/purchase", response_model=PurchaseResult)
def purchase(req: PurchaseRequest, force_fail: bool = False):
    """The one tool call that matters: policy-checked, provider-agnostic,
    fully audited. `force_fail=true` is a demo knob to deterministically
    trigger the graceful-failure path without needing a flaky network."""
    return service.execute_purchase(
        product_id=req.product_id,
        quantity=req.quantity,
        buyer_ref=req.buyer_ref,
        trace_id=req.trace_id,
        force_fail=force_fail,
    )


@app.post("/purchase/{trace_id}/confirm", response_model=PurchaseResult)
def confirm_payment(trace_id: str, payment_id: str, mock_status: Optional[str] = None):
    """Used by the checkout page's Approve/Decline buttons (mock mode) and by
    real Razorpay flows once you have a payment_id from the redirect/webhook.
    `mock_status` ('captured' | 'failed') only has effect when
    PAYMENT_PROVIDER=mock - it's how the demo simulates a human's decision."""
    return service.confirm_human_payment(trace_id, payment_id, mock_status)


# ------------------------------------------------------------- webhook ---
@app.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    """Optional: point a real Razorpay webhook here (Dashboard > Webhooks) for
    'payment_link.paid' / 'payment.failed' events to auto-close out traces
    instead of relying on manual polling. Verifies the signature when
    RAZORPAY_WEBHOOK_SECRET is set."""
    import hmac
    import hashlib
    from backend.config import RAZORPAY_WEBHOOK_SECRET

    body = await request.body()
    if RAZORPAY_WEBHOOK_SECRET:
        sig = request.headers.get("X-Razorpay-Signature", "")
        expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(400, "Invalid webhook signature")

    payload = await request.json()
    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = entity.get("order_id")
    payment_id = entity.get("id")

    # trace_id was stashed as the order receipt when the order was created
    trace_id = payload.get("payload", {}).get("payment_link", {}).get("entity", {}).get("reference_id") or order_id
    if trace_id and payment_id:
        service.confirm_human_payment(trace_id, payment_id)
    return JSONResponse({"received": True, "event": event})


# --------------------------------------------------------------- audit ---
@app.get("/audit/recent", response_model=list[AuditEvent])
def audit_recent(limit: int = 50):
    return service.get_recent_audit_events(limit)


@app.get("/audit/{trace_id}", response_model=list[AuditEvent])
def audit_trail(trace_id: str):
    trail = service.get_audit_trail(trace_id)
    if not trail:
        raise HTTPException(404, f"No audit trail for trace_id '{trace_id}'")
    return trail


# ---------------------------------------------------------- dashboard ---
@app.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary():
    return views.dashboard_summary()


# ------------------------------------------------------------ transactions
@app.get("/transactions", response_model=list[TransactionSummary])
def transactions_list(limit: int = 100):
    return views.list_transactions(limit=limit)


@app.get("/transactions/{trace_id}", response_model=TransactionDetail)
def transaction_detail(trace_id: str):
    detail = views.get_transaction_detail(trace_id)
    if detail is None:
        raise HTTPException(404, f"No transaction with trace_id '{trace_id}'")
    return detail


@app.post("/transactions/{trace_id}/approve", response_model=PurchaseResult)
def transaction_approve(trace_id: str):
    try:
        return views.approve_pending(trace_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/transactions/{trace_id}/reject", response_model=TransactionDetail)
def transaction_reject(trace_id: str, reason: str = "Rejected by merchant"):
    detail = views.reject_approval(trace_id, reason)
    if detail is None:
        raise HTTPException(404, f"No transaction with trace_id '{trace_id}'")
    return detail


# -------------------------------------------------------------- approvals
@app.get("/approvals", response_model=list[ApprovalItem])
def approvals_list():
    return views.list_approvals()


# ------------------------------------------------------------- frontend ---
# The real dashboard is now the separate Next.js app (see /web). These two
# routes are kept (rather than deleted outright) purely so any link to the
# old static pages still goes somewhere useful instead of 404ing.
@app.get("/checkout")
def checkout_page_redirect(trace_id: str = "", amount: str = "", order_id: str = ""):
    return RedirectResponse(f"{FRONTEND_URL}/checkout?trace_id={trace_id}&order_id={order_id}&amount={amount}")


@app.get("/dashboard")
def dashboard_page_redirect():
    return RedirectResponse(FRONTEND_URL)
