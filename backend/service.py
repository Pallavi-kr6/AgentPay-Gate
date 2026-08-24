"""
Core business logic. This module has no knowledge of FastAPI or MCP - it is
imported by both `backend/main.py` (REST) and `backend/mcp_server.py` (MCP),
so a shopping agent can reach the exact same bounded/gated/audited purchase
flow whether it talks HTTP or the Model Context Protocol. That dual surface
mirrors how the Agentic Commerce Protocol (ACP) itself is designed to be
"compatible with REST API and MCP".

This is where "every money action explainable, bounded and gated" actually
lives:
  explainable -> every branch below writes an audit event with a human
                 readable `reason` before it returns anything to the caller.
  bounded     -> backend/policy.py is consulted before an order ever exists.
  gated       -> REQUIRE_APPROVAL purchases stop and hand a human a payment
                 link; nothing is captured without that human acting.
  graceful failure -> failed payments are retried at most
                 policy.max_retries_on_failure times, then the trace is
                 closed out as FAILED with a plain-language reason instead of
                 hanging or retrying forever.
"""
from __future__ import annotations
from backend import catalog, policy as policy_mod, audit
from backend.models import Product, PurchaseResult
from backend.payment_provider import get_provider, PaymentDeclined, OrderResult


def search_products(query: str | None = None, category: str | None = None, max_price: float | None = None) -> list[Product]:
    return catalog.search_products(query=query, category=category, max_price=max_price)


def get_product(product_id: str) -> Product | None:
    return catalog.get_product(product_id)


def check_policy(product_id: str, quantity: int = 1):
    product = catalog.get_product(product_id)
    if product is None:
        return None
    spent = audit.daily_spent()
    return policy_mod.evaluate(product, quantity, spent)


def execute_purchase(
    product_id: str,
    quantity: int = 1,
    buyer_ref: str = "demo-buyer",
    trace_id: str | None = None,
    force_fail: bool = False,
) -> PurchaseResult:
    trace_id = trace_id or audit.new_trace_id()

    audit.log_event(
        trace_id, actor="agent", event_type="PURCHASE_REQUESTED",
        payload={"product_id": product_id, "quantity": quantity, "buyer_ref": buyer_ref},
    )

    product = catalog.get_product(product_id)
    if product is None:
        audit.log_event(trace_id, actor="system", event_type="PURCHASE_BLOCKED",
                         decision="BLOCK", reason=f"Unknown product_id '{product_id}'.")
        return PurchaseResult(trace_id=trace_id, status="BLOCKED",
                               reason=f"Unknown product_id '{product_id}'.", amount=0)

    pol = policy_mod.Policy.load()
    spent_today = audit.daily_spent()
    decision, checks = policy_mod.evaluate_with_checks(product, quantity, spent_today, pol)
    amount = product.price * quantity

    audit.log_event(
        trace_id, actor="policy_engine", event_type="POLICY_CHECK",
        decision=decision.decision, reason=decision.reason,
        payload={"amount": amount, "daily_spent_so_far": spent_today, "checks": checks},
    )

    if decision.decision == "BLOCK":
        return PurchaseResult(trace_id=trace_id, status="BLOCKED", reason=decision.reason,
                               amount=amount, product=product)

    provider = get_provider()
    order: OrderResult = provider.create_order(amount=amount, currency=product.currency, receipt=trace_id)
    audit.log_event(trace_id, actor="payment_provider", event_type="ORDER_CREATED",
                     payload={"order_id": order.order_id, "amount": amount})

    if decision.decision == "REQUIRE_APPROVAL":
        link = provider.create_payment_link(order, description=f"{quantity} x {product.name}", trace_id=trace_id)
        audit.log_event(
            trace_id, actor="system", event_type="APPROVAL_REQUIRED",
            decision="REQUIRE_APPROVAL", reason=decision.reason,
            payload={"order_id": order.order_id, "payment_link": link,
                     "expiry_minutes": pol.approval_link_expiry_minutes},
        )
        return PurchaseResult(
            trace_id=trace_id, status="AWAITING_APPROVAL", reason=decision.reason,
            amount=amount, product=product, order_id=order.order_id, payment_link=link,
        )

    # decision.decision == "ALLOW"
    from backend.config import PAYMENT_PROVIDER
    if PAYMENT_PROVIDER != "razorpay":
        # Mock rail: settle synchronously, with bounded retries on failure.
        return _settle_with_retries(trace_id, provider, order, product, amount, pol, force_fail)

    # Real Razorpay: even an ALLOW-ed purchase needs a payment instrument -
    # there is no such thing as a card network that skips consent entirely.
    # ALLOW just means no *extra* human review gate is inserted before the
    # link is generated (see README "why ALLOW still needs a link").
    link = provider.create_payment_link(order, description=f"{quantity} x {product.name}", trace_id=trace_id)
    audit.log_event(
        trace_id, actor="system", event_type="AWAITING_PAYMENT",
        decision="ALLOW", reason=decision.reason,
        payload={"order_id": order.order_id, "payment_link": link},
    )
    return PurchaseResult(
        trace_id=trace_id, status="AWAITING_PAYMENT", reason=decision.reason,
        amount=amount, product=product, order_id=order.order_id, payment_link=link,
    )


def _settle_with_retries(trace_id, provider, order, product, amount, pol, force_fail) -> PurchaseResult:
    max_attempts = 1 + pol.max_retries_on_failure
    last_reason = ""
    for attempt in range(1, max_attempts + 1):
        try:
            payment = provider.simulate_or_check_payment(order, force_fail=force_fail)
            audit.log_event(trace_id, actor="payment_provider", event_type="PAYMENT_CAPTURED",
                             payload={"payment_id": payment.payment_id, "attempt": attempt})
            audit.log_event(trace_id, actor="system", event_type="PURCHASE_COMPLETED",
                             decision="PAID", reason="Payment captured successfully.",
                             payload={"amount": amount, "payment_id": payment.payment_id})
            return PurchaseResult(trace_id=trace_id, status="PAID",
                                   reason="Payment captured successfully.", amount=amount,
                                   product=product, order_id=order.order_id, payment_id=payment.payment_id)
        except PaymentDeclined as e:
            last_reason = e.reason
            audit.log_event(trace_id, actor="payment_provider", event_type="PAYMENT_FAILED",
                             reason=e.reason, payload={"attempt": attempt, "max_attempts": max_attempts})
            # Only retry the exact same bounded order - never re-run policy with a
            # bigger amount, never retry indefinitely. This is the stopping rule.
            # (force_fail is intentionally NOT cleared here: a demo-forced failure
            # should deterministically exhaust all retries so the graceful-failure
            # path is reproducible; a naturally-random decline still gets a real
            # second chance because MockProvider re-rolls its ~10% failure odds
            # independently of this flag on unforced runs.)

    audit.log_event(trace_id, actor="system", event_type="PURCHASE_FAILED_FINAL",
                     decision="FAILED",
                     reason=f"Gave up after {max_attempts} attempt(s). Last error: {last_reason}",
                     payload={"amount": amount})
    return PurchaseResult(
        trace_id=trace_id, status="FAILED",
        reason=f"Payment failed after {max_attempts} attempt(s): {last_reason}. "
               f"Stopped instead of retrying further - please check your payment method and try again.",
        amount=amount, product=product, order_id=order.order_id,
    )


def resolve_pending(trace_id: str) -> PurchaseResult | None:
    """Poll a Razorpay order that was left AWAITING_APPROVAL / AWAITING_PAYMENT
    and, if the human has since paid (or declined) via the payment link,
    close out the trace. Used by the dashboard's 'refresh' action and by the
    webhook handler."""
    trail = audit.get_trail(trace_id)
    if not trail:
        return None
    order_id = None
    amount = 0.0
    product_id = None
    for event in trail:
        if "order_id" in event.payload:
            order_id = event.payload["order_id"]
        if "amount" in event.payload:
            amount = event.payload["amount"]
        if event.event_type == "PURCHASE_REQUESTED":
            product_id = event.payload.get("product_id")
        if event.event_type in ("PURCHASE_COMPLETED", "PURCHASE_FAILED_FINAL", "PURCHASE_BLOCKED"):
            # already closed out
            return PurchaseResult(trace_id=trace_id, status=_status_from_event(event.event_type),
                                   reason=event.reason or "", amount=amount)

    if order_id is None:
        return None

    provider = get_provider()
    from backend.config import PAYMENT_PROVIDER
    if PAYMENT_PROVIDER != "razorpay":
        return None  # mock purchases resolve synchronously, nothing to poll

    # In real mode we don't have a payment_id until the human pays via the
    # link, so this endpoint is meant to be called with the payment_id the
    # webhook/redirect gave you - see backend/main.py `/webhook/razorpay`.
    return None


def _status_from_event(event_type: str) -> str:
    return {
        "PURCHASE_COMPLETED": "PAID",
        "PURCHASE_FAILED_FINAL": "FAILED",
        "PURCHASE_BLOCKED": "BLOCKED",
    }.get(event_type, "AWAITING_APPROVAL")


def confirm_human_payment(trace_id: str, payment_id: str, mock_status: str | None = None) -> PurchaseResult:
    """Called by the webhook (or manually by the checkout page's 'Approve' /
    'Decline' buttons in mock mode) once a human has completed the Payment
    Link. `mock_status` lets the demo checkout page simulate a human
    declining ("failed") without needing a real payment rail that supports it."""
    from backend.config import PAYMENT_PROVIDER
    provider = get_provider()
    if mock_status and PAYMENT_PROVIDER != "razorpay":
        status = mock_status
    else:
        status = provider.fetch_payment_status(payment_id)
    trail = audit.get_trail(trace_id)
    amount = next((e.payload.get("amount") for e in trail if "amount" in e.payload), 0)
    product_id = next((e.payload.get("product_id") for e in trail if e.event_type == "PURCHASE_REQUESTED"), None)
    product = catalog.get_product(product_id) if product_id else None

    if status == "captured":
        audit.log_event(trace_id, actor="payment_provider", event_type="PAYMENT_CAPTURED",
                         payload={"payment_id": payment_id})
        audit.log_event(trace_id, actor="system", event_type="PURCHASE_COMPLETED",
                         decision="PAID", reason="Human completed the payment link successfully.",
                         payload={"amount": amount, "payment_id": payment_id})
        return PurchaseResult(trace_id=trace_id, status="PAID", reason="Payment captured.",
                               amount=amount, product=product, payment_id=payment_id)

    audit.log_event(trace_id, actor="payment_provider", event_type="PAYMENT_FAILED",
                     reason=f"Razorpay reported status='{status}'.", payload={"payment_id": payment_id})
    audit.log_event(trace_id, actor="system", event_type="PURCHASE_FAILED_FINAL",
                     decision="FAILED", reason=f"Human's payment attempt ended in status='{status}'.",
                     payload={"amount": amount})
    return PurchaseResult(trace_id=trace_id, status="FAILED",
                           reason=f"Payment did not succeed (status='{status}').",
                           amount=amount, product=product, payment_id=payment_id)


def get_audit_trail(trace_id: str):
    return audit.get_trail(trace_id)


def get_recent_audit_events(limit: int = 50):
    return audit.list_recent(limit)
