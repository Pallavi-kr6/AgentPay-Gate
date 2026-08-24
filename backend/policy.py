"""
Policy engine.

This is the module that makes the whole system "bounded and gated" instead of
"an LLM with a credit card". Every purchase attempt is run through here BEFORE
a single rupee moves, and the decision + the reason are always returned
together - never a bare yes/no.

Three outcomes only:
  ALLOW             -> below the human-approval threshold, order proceeds.
  REQUIRE_APPROVAL  -> above the threshold or a flagged category. The agent
                       must stop and get an explicit human decision before an
                       order is even created.
  BLOCK             -> violates a hard bound (per-tx cap, daily cap, blocked
                       category, out of stock). No order is created at all.

Nothing in here calls a payment API - policy has zero knowledge of Razorpay.
That separation is deliberate: you can unit test money *rules* without ever
touching a payment provider, mock or real.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, asdict
from backend.config import POLICY_PATH
from backend.models import Product, PolicyDecision


@dataclass
class Policy:
    currency: str
    per_transaction_cap: float
    daily_cap: float
    requires_approval_above: float
    blocked_categories: list[str]
    max_retries_on_failure: int
    approval_link_expiry_minutes: int
    version: int = 1  # bumped by Policy.save(); absent from older policy.json files, defaults to 1

    @classmethod
    def load(cls) -> "Policy":
        with open(POLICY_PATH, "r") as f:
            raw = json.load(f)
        return cls(**raw)

    @classmethod
    def save(cls, policy: "Policy") -> None:
        """Persist an updated policy to disk. Used by the Policies page in the
        dashboard (`PUT /policy`) so merchants can change caps without editing
        a JSON file by hand. Does not touch policy *semantics* - evaluate()
        below is completely unaware this exists."""
        with open(POLICY_PATH, "w") as f:
            json.dump(asdict(policy), f, indent=2)


def evaluate(product: Product, quantity: int, daily_spent_so_far: float, policy: Policy | None = None) -> PolicyDecision:
    policy = policy or Policy.load()
    amount = product.price * quantity

    if product.category in policy.blocked_categories:
        return PolicyDecision(
            decision="BLOCK",
            reason=f"Category '{product.category}' is on the merchant's blocked list for autonomous agents.",
            per_transaction_cap=policy.per_transaction_cap,
            daily_cap=policy.daily_cap,
            daily_spent_so_far=daily_spent_so_far,
            requires_approval_above=policy.requires_approval_above,
        )

    if product.stock < quantity:
        return PolicyDecision(
            decision="BLOCK",
            reason=f"Requested quantity {quantity} exceeds available stock {product.stock}.",
            per_transaction_cap=policy.per_transaction_cap,
            daily_cap=policy.daily_cap,
            daily_spent_so_far=daily_spent_so_far,
            requires_approval_above=policy.requires_approval_above,
        )

    if amount > policy.per_transaction_cap:
        return PolicyDecision(
            decision="BLOCK",
            reason=f"Order amount {policy.currency} {amount:.2f} exceeds the hard per-transaction cap of {policy.currency} {policy.per_transaction_cap:.2f}.",
            per_transaction_cap=policy.per_transaction_cap,
            daily_cap=policy.daily_cap,
            daily_spent_so_far=daily_spent_so_far,
            requires_approval_above=policy.requires_approval_above,
        )

    if daily_spent_so_far + amount > policy.daily_cap:
        return PolicyDecision(
            decision="BLOCK",
            reason=(
                f"Order amount {policy.currency} {amount:.2f} would push today's agent spend to "
                f"{policy.currency} {daily_spent_so_far + amount:.2f}, above the daily cap of "
                f"{policy.currency} {policy.daily_cap:.2f}."
            ),
            per_transaction_cap=policy.per_transaction_cap,
            daily_cap=policy.daily_cap,
            daily_spent_so_far=daily_spent_so_far,
            requires_approval_above=policy.requires_approval_above,
        )

    if amount > policy.requires_approval_above:
        return PolicyDecision(
            decision="REQUIRE_APPROVAL",
            reason=(
                f"Order amount {policy.currency} {amount:.2f} is above the no-questions-asked "
                f"threshold of {policy.currency} {policy.requires_approval_above:.2f}; a human must "
                f"confirm before payment is created."
            ),
            per_transaction_cap=policy.per_transaction_cap,
            daily_cap=policy.daily_cap,
            daily_spent_so_far=daily_spent_so_far,
            requires_approval_above=policy.requires_approval_above,
        )

    return PolicyDecision(
        decision="ALLOW",
        reason=(
            f"Order amount {policy.currency} {amount:.2f} is within bounds "
            f"(per-tx cap {policy.currency} {policy.per_transaction_cap:.2f}, "
            f"daily cap {policy.currency} {policy.daily_cap:.2f}, "
            f"approval threshold {policy.currency} {policy.requires_approval_above:.2f}) - proceeding without human review."
        ),
        per_transaction_cap=policy.per_transaction_cap,
        daily_cap=policy.daily_cap,
        daily_spent_so_far=daily_spent_so_far,
        requires_approval_above=policy.requires_approval_above,
    )


def evaluate_with_checks(
    product: Product, quantity: int, daily_spent_so_far: float, policy: Policy | None = None
) -> tuple[PolicyDecision, list[dict]]:
    """Same verdict as evaluate() (it's called internally, so the actual
    ALLOW/REQUIRE_APPROVAL/BLOCK logic exists in exactly one place) plus a
    human-readable checklist for the Transaction Detail page's "Policy
    Evaluation" section. Purely additive/explanatory - deleting this function
    would not change what any purchase is allowed to do."""
    policy = policy or Policy.load()
    amount = product.price * quantity
    decision = evaluate(product, quantity, daily_spent_so_far, policy)

    checks = [
        {
            "label": "Category allowed",
            "passed": product.category not in policy.blocked_categories,
            "detail": (
                f"'{product.category}' is not on the merchant's blocked list."
                if product.category not in policy.blocked_categories
                else f"'{product.category}' is on the merchant's blocked list for autonomous agents."
            ),
        },
        {
            "label": "Stock available",
            "passed": product.stock >= quantity,
            "detail": f"{product.stock} in stock, {quantity} requested.",
        },
        {
            "label": "Within per-transaction limit",
            "passed": amount <= policy.per_transaction_cap,
            "detail": f"Order amount {policy.currency} {amount:.2f} vs. limit {policy.currency} {policy.per_transaction_cap:.2f}.",
        },
        {
            "label": "Within daily limit",
            "passed": (daily_spent_so_far + amount) <= policy.daily_cap,
            "detail": (
                f"Today's spend would reach {policy.currency} {daily_spent_so_far + amount:.2f} "
                f"of {policy.currency} {policy.daily_cap:.2f}."
            ),
        },
        {
            "label": "Approval threshold",
            "passed": amount <= policy.requires_approval_above,
            "detail": (
                f"Within the {policy.currency} {policy.requires_approval_above:.2f} auto-approve threshold."
                if amount <= policy.requires_approval_above
                else f"Exceeds the {policy.currency} {policy.requires_approval_above:.2f} auto-approve threshold - human approval required."
            ),
        },
    ]
    return decision, checks
