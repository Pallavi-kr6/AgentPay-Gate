"""
Read-model / aggregation layer for the dashboard frontend.

Nothing in this file moves money or makes a policy decision. It only reads
what backend/audit.py, backend/catalog.py and backend/policy.py already
produce, and reshapes it into the list/detail/summary views the Next.js
dashboard needs. This module could be deleted entirely and no purchase's
outcome would change - that separation is deliberate, so "what can spend
money" stays a small, auditable surface (backend/service.py) even as the
dashboard grows more screens.

Added for the Next.js frontend rebuild because the existing REST surface
(backend/main.py) only exposed single-trace lookups (`GET /audit/{trace_id}`)
and a raw recent-events feed (`GET /audit/recent`) - there was no list of
"transactions" grouped by trace, no "pending approvals only" view, no
editable policy, and no catalog with computed policy eligibility. Recomputing
any of that logic in the frontend would have meant re-implementing policy
rules in TypeScript, which the project brief explicitly rules out - so it's
implemented once here, in Python, next to the real rules.
"""
from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timezone

from backend import audit, catalog, policy as policy_mod, service
from backend.config import PAYMENT_PROVIDER
from backend.models import (
    TransactionSummary, TransactionDetail, PolicyCheckItem, ApprovalItem,
    DashboardSummary, PolicyConfig, PolicyUpdateRequest, CatalogItem,
)

_TERMINAL_STATUS = {
    "PURCHASE_COMPLETED": "PAID",
    "PURCHASE_FAILED_FINAL": "FAILED",
    "PURCHASE_BLOCKED": "BLOCKED",
}
_PENDING_STATUS = {
    "APPROVAL_REQUIRED": "AWAITING_APPROVAL",
    "AWAITING_PAYMENT": "AWAITING_PAYMENT",
}


def _group_events(limit: int = 2000) -> dict[str, list]:
    events = audit.list_recent(limit=limit)
    groups: dict[str, list] = defaultdict(list)
    for e in events:
        groups[e.trace_id].append(e)
    for trace_id in groups:
        groups[trace_id].sort(key=lambda e: e.id)
    return groups


def _derive_status(events: list) -> str:
    for e in reversed(events):
        if e.event_type in _TERMINAL_STATUS:
            return _TERMINAL_STATUS[e.event_type]
        if e.event_type in _PENDING_STATUS:
            return _PENDING_STATUS[e.event_type]
        # A genuine policy block only logs POLICY_CHECK(decision=BLOCK) and
        # returns - service.execute_purchase() doesn't emit a separate
        # PURCHASE_BLOCKED event for that path (only for the "unknown
        # product_id" case does it). Treat that as terminal too.
        if e.event_type == "POLICY_CHECK" and e.decision == "BLOCK":
            return "BLOCKED"
    return "PENDING"


def _derive_fields(events: list):
    product_id = None
    amount = 0.0
    buyer_ref = "demo-buyer"
    order_id = None
    payment_id = None
    payment_link = None
    decision = None
    reason = ""
    for e in events:
        if e.event_type == "PURCHASE_REQUESTED":
            product_id = e.payload.get("product_id")
            buyer_ref = e.payload.get("buyer_ref", buyer_ref)
        if "amount" in e.payload:
            amount = e.payload["amount"]
        if "order_id" in e.payload:
            order_id = e.payload["order_id"]
        if "payment_id" in e.payload:
            payment_id = e.payload["payment_id"]
        if "payment_link" in e.payload:
            payment_link = e.payload["payment_link"]
        if e.decision:
            decision = e.decision
        if e.reason:
            reason = e.reason
    return product_id, amount, buyer_ref, order_id, payment_id, payment_link, decision, reason


def list_transactions(limit: int = 200) -> list[TransactionSummary]:
    groups = _group_events(limit=max(limit * 6, 500))
    out = []
    for trace_id, events in groups.items():
        status = _derive_status(events)
        product_id, amount, buyer_ref, _, _, _, decision, _ = _derive_fields(events)
        product = catalog.get_product(product_id) if product_id else None
        out.append(TransactionSummary(
            trace_id=trace_id,
            product_id=product_id,
            product_name=product.name if product else (product_id or "Unknown product"),
            agent=buyer_ref,
            amount=amount,
            currency=product.currency if product else "INR",
            decision=decision,
            status=status,
            created_at=events[0].timestamp,
            updated_at=events[-1].timestamp,
        ))
    out.sort(key=lambda t: t.created_at, reverse=True)
    return out[:limit]


def get_transaction_detail(trace_id: str) -> TransactionDetail | None:
    trail = audit.get_trail(trace_id)
    if not trail:
        return None
    status = _derive_status(trail)
    product_id, amount, _, order_id, payment_id, payment_link, decision, reason = _derive_fields(trail)
    product = catalog.get_product(product_id) if product_id else None

    checks_event = next((e for e in trail if e.event_type == "POLICY_CHECK"), None)
    checks = []
    if checks_event and "checks" in checks_event.payload:
        checks = [PolicyCheckItem(**c) for c in checks_event.payload["checks"]]

    return TransactionDetail(
        trace_id=trace_id, product=product, amount=amount,
        currency=product.currency if product else "INR",
        decision=decision, status=status, reason=reason, checks=checks,
        order_id=order_id, payment_id=payment_id, payment_link=payment_link,
        provider=PAYMENT_PROVIDER, created_at=trail[0].timestamp, updated_at=trail[-1].timestamp,
        timeline=trail,
    )


def list_approvals(limit: int = 100) -> list[ApprovalItem]:
    groups = _group_events(limit=max(limit * 6, 500))
    out = []
    for trace_id, events in groups.items():
        if _derive_status(events) != "AWAITING_APPROVAL":
            continue
        product_id, amount, buyer_ref, _, _, payment_link, _, reason = _derive_fields(events)
        product = catalog.get_product(product_id) if product_id else None
        out.append(ApprovalItem(
            trace_id=trace_id, product=product, amount=amount,
            currency=product.currency if product else "INR",
            reason=reason, payment_link=payment_link,
            requested_at=events[-1].timestamp, buyer_ref=buyer_ref,
        ))
    out.sort(key=lambda a: a.requested_at, reverse=True)
    return out[:limit]


def reject_approval(trace_id: str, reason: str = "Rejected by merchant") -> TransactionDetail | None:
    trail = audit.get_trail(trace_id)
    if not trail:
        return None
    if _derive_status(trail) != "AWAITING_APPROVAL":
        return get_transaction_detail(trace_id)  # already resolved - idempotent no-op

    audit.log_event(trace_id, actor="human", event_type="APPROVAL_REJECTED",
                     decision="REJECTED", reason=reason)
    audit.log_event(trace_id, actor="system", event_type="PURCHASE_FAILED_FINAL",
                     decision="FAILED", reason=f"Human rejected the approval request: {reason}")
    return get_transaction_detail(trace_id)


def approve_pending(trace_id: str):
    """Merchant clicking 'Approve' in the dashboard. Only meaningful in mock
    mode - in real Razorpay mode there is no merchant-side approve button,
    because completing the actual Payment Link *is* the approval (see
    README: "why ALLOW still needs a payment link"). Raises ValueError in
    that case so main.py can turn it into a clear 400, not a silent no-op."""
    if PAYMENT_PROVIDER == "razorpay":
        raise ValueError(
            "In real Razorpay mode there is no merchant-side approve action - "
            "the buyer must complete the actual Payment Link. Share the "
            "payment_link instead of clicking Approve here."
        )
    return service.confirm_human_payment(
        trace_id, payment_id=f"dashboard_{trace_id[-12:]}", mock_status="captured"
    )


def dashboard_summary() -> DashboardSummary:
    pol = policy_mod.Policy.load()
    groups = _group_events(limit=2000)
    today = datetime.now(timezone.utc).date().isoformat()

    tx_today = 0
    blocks_today = 0
    pending = 0
    for events in groups.values():
        status = _derive_status(events)
        if events[0].timestamp >= today:
            tx_today += 1
            if status == "BLOCKED":
                blocks_today += 1
        if status == "AWAITING_APPROVAL":
            pending += 1

    return DashboardSummary(
        currency=pol.currency,
        daily_spent=audit.daily_spent(),
        daily_cap=pol.daily_cap,
        per_transaction_cap=pol.per_transaction_cap,
        requires_approval_above=pol.requires_approval_above,
        transactions_today=tx_today,
        transactions_total=len(groups),
        pending_approvals=pending,
        policy_blocks_today=blocks_today,
    )


def get_policy_config() -> PolicyConfig:
    pol = policy_mod.Policy.load()
    return PolicyConfig(
        version=pol.version, currency=pol.currency,
        per_transaction_cap=pol.per_transaction_cap, daily_cap=pol.daily_cap,
        requires_approval_above=pol.requires_approval_above,
        blocked_categories=pol.blocked_categories,
        max_retries_on_failure=pol.max_retries_on_failure,
        approval_link_expiry_minutes=pol.approval_link_expiry_minutes,
        daily_spent_so_far=audit.daily_spent(),
    )


def update_policy_config(update: PolicyUpdateRequest) -> PolicyConfig:
    current = policy_mod.Policy.load()
    new_policy = policy_mod.Policy(
        currency=current.currency,
        per_transaction_cap=update.per_transaction_cap,
        daily_cap=update.daily_cap,
        requires_approval_above=update.requires_approval_above,
        blocked_categories=update.blocked_categories,
        max_retries_on_failure=update.max_retries_on_failure,
        approval_link_expiry_minutes=update.approval_link_expiry_minutes,
        version=current.version + 1,
    )
    policy_mod.Policy.save(new_policy)
    audit.log_event(
        audit.new_trace_id(), actor="merchant", event_type="POLICY_UPDATED",
        reason=f"Spending policy updated to version {new_policy.version}.",
        payload={"per_transaction_cap": new_policy.per_transaction_cap,
                 "daily_cap": new_policy.daily_cap,
                 "requires_approval_above": new_policy.requires_approval_above,
                 "blocked_categories": new_policy.blocked_categories},
    )
    return get_policy_config()


def catalog_with_policy_state() -> list[CatalogItem]:
    pol = policy_mod.Policy.load()
    spent = audit.daily_spent()
    items = []
    for p in catalog.search_products(limit=1000):
        decision = policy_mod.evaluate(p, 1, spent, pol)
        state = {"ALLOW": "eligible", "REQUIRE_APPROVAL": "approval_required", "BLOCK": "blocked"}[decision.decision]
        items.append(CatalogItem(**p.model_dump(), policy_state=state, policy_reason=decision.reason))
    return items
