"""
Append-only audit trail.

Every policy decision, every payment-provider call, every retry and every
final outcome is written here BEFORE the function that triggered it returns.
This is what turns "the agent bought something" into "here is exactly why,
in what order, and under which rule, the agent bought something" - the
explainability requirement from the track brief.

Storage is deliberately boring: SQLite (queryable by the dashboard / a human)
plus a JSONL mirror (so you can `tail -f data/audit.jsonl` during a live demo
and literally watch the agent's decisions stream in).
"""
from __future__ import annotations
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from backend.config import DB_PATH, JSONL_AUDIT_PATH
from backend.models import AuditEvent

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL,
    event_type TEXT NOT NULL,
    decision TEXT,
    reason TEXT,
    payload TEXT NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(_SCHEMA)
    conn.commit()
    return conn


def log_event(
    trace_id: str,
    actor: str,
    event_type: str,
    decision: str | None = None,
    reason: str | None = None,
    payload: dict | None = None,
) -> AuditEvent:
    payload = payload or {}
    ts = datetime.now(timezone.utc).isoformat()
    conn = _connect()
    cur = conn.execute(
        "INSERT INTO audit_events (trace_id, timestamp, actor, event_type, decision, reason, payload) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (trace_id, ts, actor, event_type, decision, reason, json.dumps(payload)),
    )
    conn.commit()
    event_id = cur.lastrowid
    conn.close()

    event = AuditEvent(
        id=event_id,
        trace_id=trace_id,
        timestamp=ts,
        actor=actor,
        event_type=event_type,
        decision=decision,
        reason=reason,
        payload=payload,
    )

    Path(JSONL_AUDIT_PATH).parent.mkdir(parents=True, exist_ok=True)
    with open(JSONL_AUDIT_PATH, "a") as f:
        f.write(event.model_dump_json() + "\n")

    return event


def get_trail(trace_id: str) -> list[AuditEvent]:
    conn = _connect()
    rows = conn.execute(
        "SELECT id, trace_id, timestamp, actor, event_type, decision, reason, payload "
        "FROM audit_events WHERE trace_id = ? ORDER BY id ASC",
        (trace_id,),
    ).fetchall()
    conn.close()
    return [
        AuditEvent(
            id=r[0], trace_id=r[1], timestamp=r[2], actor=r[3],
            event_type=r[4], decision=r[5], reason=r[6], payload=json.loads(r[7]),
        )
        for r in rows
    ]


def list_recent(limit: int = 50) -> list[AuditEvent]:
    conn = _connect()
    rows = conn.execute(
        "SELECT id, trace_id, timestamp, actor, event_type, decision, reason, payload "
        "FROM audit_events ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [
        AuditEvent(
            id=r[0], trace_id=r[1], timestamp=r[2], actor=r[3],
            event_type=r[4], decision=r[5], reason=r[6], payload=json.loads(r[7]),
        )
        for r in rows
    ]


def daily_spent(currency_scope: str = "INR") -> float:
    """Sum of PAID purchases (by this scope) since UTC midnight - used by the
    policy engine to enforce the daily cap across purchases, not just per-tx."""
    conn = _connect()
    today = datetime.now(timezone.utc).date().isoformat()
    rows = conn.execute(
        "SELECT payload FROM audit_events WHERE event_type = 'PURCHASE_COMPLETED' AND timestamp >= ?",
        (today,),
    ).fetchall()
    conn.close()
    total = 0.0
    for (payload_json,) in rows:
        payload = json.loads(payload_json)
        total += float(payload.get("amount", 0))
    return total


def new_trace_id() -> str:
    return f"trace_{int(time.time() * 1000)}"
