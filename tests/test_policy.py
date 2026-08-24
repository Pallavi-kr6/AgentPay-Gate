from backend.policy import evaluate, Policy
from backend.models import Product

POLICY = Policy(
    currency="INR",
    per_transaction_cap=5000,
    daily_cap=8000,
    requires_approval_above=1500,
    blocked_categories=["electronics_high_value"],
    max_retries_on_failure=1,
    approval_link_expiry_minutes=15,
)


def make_product(**overrides):
    base = dict(id="sku_test", name="Test Product", category="apparel",
                price=1000, currency="INR", stock=10, tags=[], description="")
    base.update(overrides)
    return Product(**base)


def test_allow_when_within_all_bounds():
    p = make_product(price=500)
    d = evaluate(p, 1, daily_spent_so_far=0, policy=POLICY)
    assert d.decision == "ALLOW"


def test_require_approval_above_threshold():
    p = make_product(price=2000)
    d = evaluate(p, 1, daily_spent_so_far=0, policy=POLICY)
    assert d.decision == "REQUIRE_APPROVAL"
    assert "threshold" in d.reason


def test_block_above_per_transaction_cap():
    p = make_product(price=6000)
    d = evaluate(p, 1, daily_spent_so_far=0, policy=POLICY)
    assert d.decision == "BLOCK"
    assert "per-transaction cap" in d.reason


def test_block_blocked_category_even_if_cheap():
    p = make_product(price=100, category="electronics_high_value")
    d = evaluate(p, 1, daily_spent_so_far=0, policy=POLICY)
    assert d.decision == "BLOCK"
    assert "blocked list" in d.reason


def test_block_insufficient_stock():
    p = make_product(price=100, stock=1)
    d = evaluate(p, 5, daily_spent_so_far=0, policy=POLICY)
    assert d.decision == "BLOCK"
    assert "stock" in d.reason


def test_block_when_daily_cap_would_be_exceeded():
    p = make_product(price=1000)
    d = evaluate(p, 1, daily_spent_so_far=7500, policy=POLICY)
    assert d.decision == "BLOCK"
    assert "daily cap" in d.reason


def test_quantity_multiplies_amount_for_threshold_check():
    p = make_product(price=800)  # single unit is ALLOW
    d1 = evaluate(p, 1, daily_spent_so_far=0, policy=POLICY)
    assert d1.decision == "ALLOW"
    d2 = evaluate(p, 3, daily_spent_so_far=0, policy=POLICY)  # 2400 -> REQUIRE_APPROVAL
    assert d2.decision == "REQUIRE_APPROVAL"


def test_decision_always_carries_a_human_readable_reason():
    for price, category in [(100, "apparel"), (2000, "apparel"), (100, "electronics_high_value")]:
        p = make_product(price=price, category=category)
        d = evaluate(p, 1, daily_spent_so_far=0, policy=POLICY)
        assert isinstance(d.reason, str) and len(d.reason) > 10
