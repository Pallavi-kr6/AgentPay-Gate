import os
import tempfile
import importlib
import pytest


@pytest.fixture()
def client(monkeypatch):
    """Fresh, isolated SQLite DB per test run so tests don't bleed into each
    other's daily-spend totals."""
    tmpdir = tempfile.mkdtemp()
    monkeypatch.setenv("DB_PATH", os.path.join(tmpdir, "audit.db"))
    monkeypatch.setenv("JSONL_AUDIT_PATH", os.path.join(tmpdir, "audit.jsonl"))
    monkeypatch.setenv("PAYMENT_PROVIDER", "mock")

    # Reload config + every module that cached config values at import time.
    import backend.config as config
    importlib.reload(config)
    import backend.audit as audit
    importlib.reload(audit)
    import backend.payment_provider as payment_provider
    importlib.reload(payment_provider)
    import backend.service as service
    importlib.reload(service)
    import backend.main as main
    importlib.reload(main)

    from fastapi.testclient import TestClient
    return TestClient(main.app)


def test_low_value_purchase_auto_completes_or_fails_gracefully(client):
    r = client.post("/purchase", json={"product_id": "sku_tshirt_01", "quantity": 1})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("PAID", "FAILED")  # mock rail has ~10% failure to prove graceful handling
    assert body["reason"]


def test_purchase_above_approval_threshold_is_gated_not_charged(client):
    r = client.post("/purchase", json={"product_id": "sku_speaker_01", "quantity": 1})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "AWAITING_APPROVAL"
    assert body["payment_link"]
    assert "threshold" in body["reason"]


def test_blocked_category_never_creates_an_order(client):
    r = client.post("/purchase", json={"product_id": "sku_laptop_01", "quantity": 1})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "BLOCKED"
    assert body["order_id"] is None


def test_forced_failure_retries_then_gives_up_gracefully(client):
    r = client.post("/purchase?force_fail=true", json={"product_id": "sku_tshirt_01", "quantity": 1})
    body = r.json()
    assert body["status"] == "FAILED"
    assert "attempt" in body["reason"].lower()

    trail = client.get(f"/audit/{body['trace_id']}").json()
    event_types = [e["event_type"] for e in trail]
    assert "PAYMENT_FAILED" in event_types
    assert "PURCHASE_FAILED_FINAL" in event_types
    # exactly one retry happened (policy: max_retries_on_failure = 1) then it stopped
    assert event_types.count("PAYMENT_FAILED") == 2


def test_every_purchase_produces_a_readable_audit_trail(client):
    r = client.post("/purchase", json={"product_id": "sku_bottle_01", "quantity": 1})
    trace_id = r.json()["trace_id"]
    trail = client.get(f"/audit/{trace_id}").json()
    assert len(trail) >= 3
    assert trail[0]["event_type"] == "PURCHASE_REQUESTED"
    assert any(e["event_type"] == "POLICY_CHECK" for e in trail)
    for event in trail:
        assert event["timestamp"]
        assert event["trace_id"] == trace_id


def test_unknown_product_is_blocked_with_clear_reason(client):
    r = client.post("/purchase", json={"product_id": "sku_does_not_exist", "quantity": 1})
    body = r.json()
    assert body["status"] == "BLOCKED"
    assert "Unknown product_id" in body["reason"]


def test_catalog_search_is_agent_readable(client):
    r = client.get("/catalog/search", params={"q": "earbuds"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert all("earbuds" in (i["name"] + i["description"] + "".join(i["tags"])).lower() for i in items)


def test_catalog_search_matches_multi_word_query_out_of_order(client):
    # "jbl speaker" should match "JBL Go 3 Portable Speaker" even though the
    # words aren't contiguous in the product name/description.
    r = client.get("/catalog/search", params={"q": "jbl speaker"})
    assert r.status_code == 200
    items = r.json()
    assert any(i["id"] == "sku_speaker_01" for i in items)
