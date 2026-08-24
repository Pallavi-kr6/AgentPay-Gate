import os
import tempfile
import importlib
import pytest


@pytest.fixture()
def client(monkeypatch):
    tmpdir = tempfile.mkdtemp()
    monkeypatch.setenv("DB_PATH", os.path.join(tmpdir, "audit.db"))
    monkeypatch.setenv("JSONL_AUDIT_PATH", os.path.join(tmpdir, "audit.jsonl"))
    monkeypatch.setenv("PAYMENT_PROVIDER", "mock")
    # isolate policy.json per test too, since update_policy_config() writes to disk
    policy_copy = os.path.join(tmpdir, "policy.json")
    import shutil
    shutil.copy("data/policy.json", policy_copy)
    monkeypatch.setenv("POLICY_PATH", policy_copy)

    import backend.config as config
    importlib.reload(config)
    for mod in ["backend.audit", "backend.policy", "backend.payment_provider",
                "backend.catalog", "backend.service", "backend.views", "backend.main"]:
        importlib.reload(importlib.import_module(mod))
    import backend.main as main
    importlib.reload(main)

    from fastapi.testclient import TestClient
    return TestClient(main.app)


def test_dashboard_summary_reflects_activity(client):
    client.post("/purchase", json={"product_id": "sku_tshirt_01", "quantity": 1})
    client.post("/purchase", json={"product_id": "sku_laptop_01", "quantity": 1})  # blocked
    r = client.get("/dashboard/summary")
    assert r.status_code == 200
    body = r.json()
    assert body["transactions_today"] >= 2
    assert body["policy_blocks_today"] >= 1
    assert body["daily_cap"] > 0


def test_transactions_list_groups_by_trace(client):
    r1 = client.post("/purchase", json={"product_id": "sku_bottle_01", "quantity": 1})
    trace_id = r1.json()["trace_id"]
    listing = client.get("/transactions").json()
    assert any(t["trace_id"] == trace_id for t in listing)
    match = next(t for t in listing if t["trace_id"] == trace_id)
    assert match["product_name"] == "Milton Thermosteel Bottle 1L"
    assert match["status"] in ("PAID", "FAILED")


def test_transaction_detail_includes_human_readable_checks(client):
    r1 = client.post("/purchase", json={"product_id": "sku_speaker_01", "quantity": 1})
    trace_id = r1.json()["trace_id"]
    detail = client.get(f"/transactions/{trace_id}").json()
    assert detail["status"] == "AWAITING_APPROVAL"
    labels = [c["label"] for c in detail["checks"]]
    assert "Approval threshold" in labels
    assert "Within daily limit" in labels
    # every check must have a human-readable detail string, not a bare bool
    for c in detail["checks"]:
        assert isinstance(c["detail"], str) and len(c["detail"]) > 5


def test_transaction_detail_404_for_unknown_trace(client):
    r = client.get("/transactions/does-not-exist")
    assert r.status_code == 404


def test_approvals_list_only_shows_pending(client):
    r1 = client.post("/purchase", json={"product_id": "sku_speaker_01", "quantity": 1})
    trace_id = r1.json()["trace_id"]
    approvals = client.get("/approvals").json()
    assert any(a["trace_id"] == trace_id for a in approvals)

    client.post(f"/transactions/{trace_id}/approve")
    approvals_after = client.get("/approvals").json()
    assert not any(a["trace_id"] == trace_id for a in approvals_after)


def test_reject_transaction_closes_it_without_a_payment_attempt(client):
    r1 = client.post("/purchase", json={"product_id": "sku_speaker_01", "quantity": 1})
    trace_id = r1.json()["trace_id"]
    r2 = client.post(f"/transactions/{trace_id}/reject", params={"reason": "Too expensive today"})
    assert r2.status_code == 200
    body = r2.json()
    assert body["status"] == "FAILED"
    event_types = [e["event_type"] for e in body["timeline"]]
    assert "APPROVAL_REJECTED" in event_types
    assert "PAYMENT_FAILED" not in event_types  # rejected, never attempted


def test_policy_get_and_update_round_trip(client):
    original = client.get("/policy").json()
    assert original["version"] == 1

    updated = client.put("/policy", json={
        "per_transaction_cap": 9999,
        "daily_cap": 20000,
        "requires_approval_above": 2500,
        "blocked_categories": ["electronics_high_value"],
        "max_retries_on_failure": 2,
        "approval_link_expiry_minutes": 30,
    }).json()
    assert updated["version"] == 2
    assert updated["per_transaction_cap"] == 9999

    reloaded = client.get("/policy").json()
    assert reloaded["per_transaction_cap"] == 9999
    assert reloaded["version"] == 2


def test_catalog_list_marks_blocked_and_gated_items(client):
    items = client.get("/catalog").json()
    laptop = next(i for i in items if i["id"] == "sku_laptop_01")
    speaker = next(i for i in items if i["id"] == "sku_speaker_01")
    tshirt = next(i for i in items if i["id"] == "sku_tshirt_01")
    assert laptop["policy_state"] == "blocked"
    assert speaker["policy_state"] == "approval_required"
    assert tshirt["policy_state"] == "eligible"


def test_approve_endpoint_rejects_in_real_razorpay_mode(client, monkeypatch):
    r1 = client.post("/purchase", json={"product_id": "sku_speaker_01", "quantity": 1})
    trace_id = r1.json()["trace_id"]

    import backend.config as config
    monkeypatch.setattr(config, "PAYMENT_PROVIDER", "razorpay")
    import backend.views as views
    monkeypatch.setattr(views, "PAYMENT_PROVIDER", "razorpay")

    r2 = client.post(f"/transactions/{trace_id}/approve")
    assert r2.status_code == 400
    assert "Payment Link" in r2.json()["detail"]
