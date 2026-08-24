from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel, Field


class Product(BaseModel):
    id: str
    name: str
    category: str
    price: float
    currency: str = "INR"
    stock: int
    tags: list[str] = []
    description: str = ""


class PolicyDecision(BaseModel):
    decision: Literal["ALLOW", "REQUIRE_APPROVAL", "BLOCK"]
    reason: str
    per_transaction_cap: float
    daily_cap: float
    daily_spent_so_far: float
    requires_approval_above: float


class PurchaseRequest(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1)
    buyer_ref: str = Field(default="demo-buyer", description="Opaque id for the human this agent acts on behalf of")
    trace_id: Optional[str] = Field(default=None, description="Correlates every audit event for this purchase attempt")


class PurchaseResult(BaseModel):
    trace_id: str
    status: Literal[
        "BLOCKED",
        "AWAITING_APPROVAL",
        "AWAITING_PAYMENT",
        "PAID",
        "FAILED",
    ]
    reason: str
    amount: float
    currency: str = "INR"
    product: Optional[Product] = None
    order_id: Optional[str] = None
    payment_link: Optional[str] = None
    payment_id: Optional[str] = None


class AuditEvent(BaseModel):
    id: int
    trace_id: str
    timestamp: str
    actor: str
    event_type: str
    decision: Optional[str] = None
    reason: Optional[str] = None
    payload: dict = {}


# --- Added for the Next.js dashboard frontend --------------------------
# These are pure read-models / aggregations (backend/views.py) built on top
# of the existing audit trail + policy engine. None of them change how a
# purchase is decided or executed - see backend/views.py's module docstring.

class PolicyCheckItem(BaseModel):
    label: str
    passed: bool
    detail: str


class TransactionSummary(BaseModel):
    trace_id: str
    product_id: Optional[str] = None
    product_name: str
    agent: str = "Shopping Agent"
    amount: float
    currency: str = "INR"
    decision: Optional[str] = None
    status: str
    created_at: str
    updated_at: str


class TransactionDetail(BaseModel):
    trace_id: str
    product: Optional[Product] = None
    amount: float
    currency: str = "INR"
    decision: Optional[str] = None
    status: str
    reason: str
    checks: list[PolicyCheckItem] = []
    order_id: Optional[str] = None
    payment_id: Optional[str] = None
    payment_link: Optional[str] = None
    provider: str
    created_at: str
    updated_at: str
    timeline: list[AuditEvent] = []


class ApprovalItem(BaseModel):
    trace_id: str
    product: Optional[Product] = None
    amount: float
    currency: str = "INR"
    reason: str
    payment_link: Optional[str] = None
    requested_at: str
    buyer_ref: str = "demo-buyer"


class DashboardSummary(BaseModel):
    currency: str = "INR"
    daily_spent: float
    daily_cap: float
    per_transaction_cap: float
    requires_approval_above: float
    transactions_today: int
    transactions_total: int
    pending_approvals: int
    policy_blocks_today: int


class PolicyConfig(BaseModel):
    version: int = 1
    currency: str
    per_transaction_cap: float
    daily_cap: float
    requires_approval_above: float
    blocked_categories: list[str]
    max_retries_on_failure: int
    approval_link_expiry_minutes: int
    daily_spent_so_far: float


class PolicyUpdateRequest(BaseModel):
    per_transaction_cap: float
    daily_cap: float
    requires_approval_above: float
    blocked_categories: list[str] = []
    max_retries_on_failure: int = Field(default=1, ge=0)
    approval_link_expiry_minutes: int = Field(default=15, ge=1)


class CatalogItem(Product):
    policy_state: Literal["eligible", "approval_required", "blocked"]
    policy_reason: str
