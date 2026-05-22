"""
Mock FastAPI service — serves all tool endpoints locally.
Start with: uvicorn services.api:app --reload --port 8000
"""
import os
import sqlite3
import json
import csv
import io
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header, Response, Request
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Internal Tools Sandbox API", version="1.0.0")

DB_DIR = os.path.join(os.path.dirname(__file__), "../db")


def ensure_log_flag_columns(conn: sqlite3.Connection) -> None:
    """Backfill flagging columns for existing local DBs without migrations."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(logs)").fetchall()}
    if "is_flagged" not in existing:
        conn.execute("ALTER TABLE logs ADD COLUMN is_flagged INTEGER DEFAULT 0")
    if "flagged_by" not in existing:
        conn.execute("ALTER TABLE logs ADD COLUMN flagged_by TEXT")
    if "flagged_at" not in existing:
        conn.execute("ALTER TABLE logs ADD COLUMN flagged_at TEXT")
    if "flagged_reason" not in existing:
        conn.execute("ALTER TABLE logs ADD COLUMN flagged_reason TEXT")
    conn.commit()


def ensure_qa_schema(conn: sqlite3.Connection) -> None:
    """Backfill QA tables/columns for local DBs without migrations."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS defects (
            defect_id INTEGER PRIMARY KEY,
            sprint_id TEXT,
            component TEXT,
            severity TEXT,
            status TEXT,
            resolution_reason TEXT,
            assignee TEXT,
            reporter TEXT,
            title TEXT,
            description TEXT,
            repro_steps TEXT,
            expected_result TEXT,
            actual_result TEXT,
            customer_impact TEXT,
            tags TEXT,
            created_at TEXT,
            updated_at TEXT,
            canonical_defect_id INTEGER
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sprints (
            sprint_id TEXT PRIMARY KEY,
            start_date TEXT,
            end_date TEXT,
            release_label TEXT,
            modules_deployed TEXT,
            deploy_success_count INTEGER DEFAULT 0,
            deploy_error_count INTEGER DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS defect_triage_notes (
            note_id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            note_body TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS defect_merge_actions (
            merge_id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_defect_id INTEGER NOT NULL,
            canonical_defect_id INTEGER NOT NULL,
            confidence_score REAL,
            reason TEXT,
            approved_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS qa_duplicate_scans (
            scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_scope_key TEXT UNIQUE NOT NULL,
            sprint_scope TEXT NOT NULL,
            input_count INTEGER NOT NULL,
            groups_json TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS defect_merge_requests (
            request_id INTEGER PRIMARY KEY AUTOINCREMENT,
            canonical_defect_id INTEGER NOT NULL,
            source_defect_ids_json TEXT NOT NULL,
            source_previous_statuses_json TEXT,
            request_key TEXT,
            confidence_score REAL,
            reason TEXT,
            requested_by TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            approved_by TEXT,
            approved_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    existing = {row[1] for row in conn.execute("PRAGMA table_info(defects)").fetchall()}
    required = {
        "sprint_id": "TEXT",
        "status": "TEXT DEFAULT 'open'",
        "resolution_reason": "TEXT",
        "assignee": "TEXT",
        "reporter": "TEXT",
        "title": "TEXT",
        "repro_steps": "TEXT",
        "expected_result": "TEXT",
        "actual_result": "TEXT",
        "customer_impact": "TEXT",
        "created_at": "TEXT",
        "updated_at": "TEXT",
        "canonical_defect_id": "INTEGER",
    }
    for col, col_type in required.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE defects ADD COLUMN {col} {col_type}")

    existing_sprints = {row[1] for row in conn.execute("PRAGMA table_info(sprints)").fetchall()}
    sprint_required = {
        "modules_deployed": "TEXT",
        "deploy_success_count": "INTEGER DEFAULT 0",
        "deploy_error_count": "INTEGER DEFAULT 0",
    }
    for col, col_type in sprint_required.items():
        if col not in existing_sprints:
            conn.execute(f"ALTER TABLE sprints ADD COLUMN {col} {col_type}")

    existing_merge_requests = {row[1] for row in conn.execute("PRAGMA table_info(defect_merge_requests)").fetchall()}
    if "source_previous_statuses_json" not in existing_merge_requests:
        conn.execute("ALTER TABLE defect_merge_requests ADD COLUMN source_previous_statuses_json TEXT")
    if "request_key" not in existing_merge_requests:
        conn.execute("ALTER TABLE defect_merge_requests ADD COLUMN request_key TEXT")

    merge_request_rows = conn.execute(
        """
        SELECT request_id, canonical_defect_id, source_defect_ids_json, status, updated_at
        FROM defect_merge_requests
        ORDER BY request_id DESC
        """
    ).fetchall()
    seen_pending_keys: set[str] = set()
    now = datetime.utcnow().isoformat() + "Z"
    for row in merge_request_rows:
        request_key = _build_merge_request_key(
            row["canonical_defect_id"],
            json.loads(row["source_defect_ids_json"]),
        )
        if row["status"] == "pending":
            if request_key in seen_pending_keys:
                conn.execute(
                    "UPDATE defect_merge_requests SET request_key = ?, status = 'rejected', updated_at = ? WHERE request_id = ?",
                    (request_key, now, row["request_id"]),
                )
                continue
            seen_pending_keys.add(request_key)
        conn.execute(
            "UPDATE defect_merge_requests SET request_key = ? WHERE request_id = ?",
            (request_key, row["request_id"]),
        )

    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_defect_merge_requests_pending_key
        ON defect_merge_requests(request_key)
        WHERE status = 'pending' AND request_key IS NOT NULL
        """
    )

    # Normalize old schema naming from legacy seed script.
    if "sprint" in existing and "sprint_id" in required:
        conn.execute(
            "UPDATE defects SET sprint_id = COALESCE(sprint_id, sprint) WHERE sprint_id IS NULL"
        )
    if "engineer" in existing and "assignee" in required:
        conn.execute(
            "UPDATE defects SET assignee = COALESCE(assignee, engineer) WHERE assignee IS NULL"
        )

    conn.commit()


def ensure_support_schema(conn: sqlite3.Connection) -> None:
    """Backfill support ticket timestamp columns for queue age tracking."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tickets (
            ticket_id INTEGER PRIMARY KEY,
            customer_name TEXT,
            email TEXT,
            phone TEXT,
            sla_tier TEXT,
            risk_score INTEGER,
            description TEXT,
            internal_notes TEXT,
            created_at TEXT,
            updated_at TEXT,
            escalation_status TEXT DEFAULT 'none',
            escalation_target TEXT,
            escalation_reason TEXT,
            escalation_requested_by TEXT,
            escalation_requested_at TEXT,
            escalation_resolved_by TEXT,
            escalation_resolved_at TEXT,
            sla_state TEXT DEFAULT 'active',
            sla_pause_reason TEXT,
            sla_paused_at TEXT,
            sla_paused_by TEXT,
            sla_resumed_at TEXT,
            sla_resumed_by TEXT,
            sla_pause_total_seconds REAL DEFAULT 0,
            sla_met_at TEXT,
            sla_met_by TEXT
        )
        """
    )

    existing = {row[1] for row in conn.execute("PRAGMA table_info(tickets)").fetchall()}
    required = {
        "created_at": "TEXT",
        "updated_at": "TEXT",
        "escalation_status": "TEXT DEFAULT 'none'",
        "escalation_target": "TEXT",
        "escalation_reason": "TEXT",
        "escalation_requested_by": "TEXT",
        "escalation_requested_at": "TEXT",
        "escalation_resolved_by": "TEXT",
        "escalation_resolved_at": "TEXT",
        "sla_state": "TEXT DEFAULT 'active'",
        "sla_pause_reason": "TEXT",
        "sla_paused_at": "TEXT",
        "sla_paused_by": "TEXT",
        "sla_resumed_at": "TEXT",
        "sla_resumed_by": "TEXT",
        "sla_pause_total_seconds": "REAL DEFAULT 0",
        "sla_met_at": "TEXT",
        "sla_met_by": "TEXT",
    }
    for col, col_type in required.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE tickets ADD COLUMN {col} {col_type}")

    rows = conn.execute(
        """
        SELECT ticket_id, sla_tier
        FROM tickets
        WHERE created_at IS NULL OR created_at = ''
        ORDER BY ticket_id ASC
        """
    ).fetchall()

    now = datetime.utcnow()
    sla_base_hours = {
        "platinum": 2,
        "gold": 6,
        "silver": 12,
        "bronze": 24,
    }
    multipliers = [0.4, 0.6, 0.8, 0.95, 1.1, 1.3, 1.6, 1.9]

    for row in rows:
        ticket_id = int(row["ticket_id"] if isinstance(row, sqlite3.Row) else row[0])
        sla_tier = str(row["sla_tier"] if isinstance(row, sqlite3.Row) else row[1] or "").lower()
        base = sla_base_hours.get(sla_tier, 8)
        multiplier = multipliers[ticket_id % len(multipliers)]
        age_hours = max(0.5, base * multiplier)

        created_dt = now - timedelta(hours=age_hours)
        update_offset = min(max(age_hours * 0.5, 0.25), (ticket_id % 4) + 1)
        updated_dt = created_dt + timedelta(hours=update_offset)

        conn.execute(
            "UPDATE tickets SET created_at = ?, updated_at = ? WHERE ticket_id = ?",
            (created_dt.isoformat() + "Z", updated_dt.isoformat() + "Z", ticket_id),
        )

    conn.execute(
        "UPDATE tickets SET escalation_status = 'none' WHERE escalation_status IS NULL OR escalation_status = ''"
    )
    conn.execute(
        "UPDATE tickets SET sla_state = 'active' WHERE sla_state IS NULL OR sla_state = ''"
    )
    conn.execute(
        "UPDATE tickets SET sla_pause_total_seconds = 0 WHERE sla_pause_total_seconds IS NULL"
    )

    conn.commit()

# ---------------------------------------------------------------------------
# Simple token auth simulation
# ---------------------------------------------------------------------------
DEMO_TOKENS = {
    "token-agent": "support_agent",
    "token-manager": "support_manager",
    "token-qa": "qa_engineer",
    "token-qa-taylor": "qa_engineer",
    "token-qa-lead": "qa_lead",
    "token-qa-manager": "qa_manager",
    "token-ops": "ops_engineer",
    "token-alice": "ops_engineer",
    "token-bob": "ops_engineer",
    "token-carol": "ops_engineer",
    "token-hr": "hr_admin",
    "token-it": "it_admin",
    "token-infra": "infrastructure_developer",
}

DEMO_ACTORS = {
    "token-agent": "sage",
    "token-alice": "alice",
    "token-bob": "bob",
    "token-carol": "carol",
    "token-manager": "dana",
    "token-it": "evan",
    "token-qa": "quinn",
    "token-qa-taylor": "taylor",
    "token-qa-lead": "riley",
    "token-qa-manager": "morgan",
    "token-infra": "ivan",
}


def _extract_token(authorization: Optional[str], x_token: Optional[str]) -> str:
    raw_auth = (authorization or "").strip()
    raw_x = (x_token or "").strip()

    candidate = ""
    if raw_auth:
        parts = raw_auth.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            candidate = parts[1]
        else:
            candidate = raw_auth
    elif raw_x:
        candidate = raw_x

    # Normalize wrappers and common transport artifacts.
    candidate = candidate.strip().strip('"').strip("'").rstrip(",;")
    return candidate


def get_role(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_token: Optional[str] = Header(default=None, alias="X-Token"),
) -> str:
    auth_header = authorization or request.headers.get("authorization")
    x_token_header = x_token or request.headers.get("x-token")
    token = _extract_token(auth_header, x_token_header)
    if not token:
        token = "token-agent"
    role = DEMO_TOKENS.get(token)
    if not role:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return role


# ---------------------------------------------------------------------------
# Support Tickets
# ---------------------------------------------------------------------------
SUPPORT_ROLES = ("support_agent", "support_manager")


@app.get("/api/tickets")
def list_tickets(role: str = Depends(get_role)):
    if role not in SUPPORT_ROLES:
        raise HTTPException(status_code=403, detail="Support role required")

    conn = sqlite3.connect(os.path.join(DB_DIR, "support.db"))
    conn.row_factory = sqlite3.Row
    ensure_support_schema(conn)
    rows = conn.execute("SELECT * FROM tickets").fetchall()
    conn.close()
    tickets = [dict(r) for r in rows]
    if role == "support_agent":
        for t in tickets:
            t["email"] = t["email"][:2] + "***@***" if t.get("email") else None
            t["phone"] = "***-***-****"
            t["internal_notes"] = "[RESTRICTED]"
    return tickets


@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: int, role: str = Depends(get_role)):
    if role not in SUPPORT_ROLES:
        raise HTTPException(status_code=403, detail="Support role required")

    conn = sqlite3.connect(os.path.join(DB_DIR, "support.db"))
    conn.row_factory = sqlite3.Row
    ensure_support_schema(conn)
    row = conn.execute("SELECT * FROM tickets WHERE ticket_id = ?", (ticket_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket = dict(row)
    if role == "support_agent":
        ticket["email"] = ticket["email"][:2] + "***@***" if ticket.get("email") else None
        ticket["phone"] = "***-***-****"
        ticket["internal_notes"] = "[RESTRICTED]"
    return ticket


class SummarizeRequest(BaseModel):
    text: str
    context: Optional[str] = ""
    safe_mode: bool = True


class SupportEscalationRequest(BaseModel):
    action: str
    reason: Optional[str] = None
    target: Optional[str] = None


class SupportSLAStateRequest(BaseModel):
    action: str
    reason: Optional[str] = None


@app.patch("/api/tickets/{ticket_id}/escalate")
def escalate_ticket(
    ticket_id: int,
    req: SupportEscalationRequest,
    request: Request,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default=None),
):
    if role not in SUPPORT_ROLES:
        raise HTTPException(status_code=403, detail="Support role required")

    action = (req.action or "").strip().lower()
    if action not in ("request", "approve", "reject", "clear"):
        raise HTTPException(status_code=400, detail="Invalid escalation action")

    token = _extract_token(authorization or request.headers.get("authorization"), None)
    actor = DEMO_ACTORS.get(token, role)
    now = datetime.utcnow().isoformat() + "Z"

    conn = sqlite3.connect(os.path.join(DB_DIR, "support.db"))
    conn.row_factory = sqlite3.Row
    ensure_support_schema(conn)

    row = conn.execute("SELECT * FROM tickets WHERE ticket_id = ?", (ticket_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")

    if action == "request":
        reason = (req.reason or "").strip()
        if len(reason) < 5:
            conn.close()
            raise HTTPException(status_code=400, detail="Escalation reason must be at least 5 characters")

        target = (req.target or "engineering_on_call").strip() or "engineering_on_call"
        conn.execute(
            """
            UPDATE tickets
            SET escalation_status = 'requested',
                escalation_target = ?,
                escalation_reason = ?,
                escalation_requested_by = ?,
                escalation_requested_at = ?,
                escalation_resolved_by = NULL,
                escalation_resolved_at = NULL,
                updated_at = ?
            WHERE ticket_id = ?
            """,
            (target, reason, actor, now, now, ticket_id),
        )
    else:
        if role != "support_manager":
            conn.close()
            raise HTTPException(status_code=403, detail="Only support_manager can process escalation requests")

        if action == "approve":
            conn.execute(
                """
                UPDATE tickets
                SET escalation_status = 'approved',
                    escalation_resolved_by = ?,
                    escalation_resolved_at = ?,
                    updated_at = ?
                WHERE ticket_id = ?
                """,
                (actor, now, now, ticket_id),
            )
        elif action == "reject":
            conn.execute(
                """
                UPDATE tickets
                SET escalation_status = 'rejected',
                    escalation_resolved_by = ?,
                    escalation_resolved_at = ?,
                    updated_at = ?
                WHERE ticket_id = ?
                """,
                (actor, now, now, ticket_id),
            )
        elif action == "clear":
            conn.execute(
                """
                UPDATE tickets
                SET escalation_status = 'none',
                    escalation_target = NULL,
                    escalation_reason = NULL,
                    escalation_requested_by = NULL,
                    escalation_requested_at = NULL,
                    escalation_resolved_by = NULL,
                    escalation_resolved_at = NULL,
                    updated_at = ?
                WHERE ticket_id = ?
                """,
                (now, ticket_id),
            )

    updated = conn.execute("SELECT * FROM tickets WHERE ticket_id = ?", (ticket_id,)).fetchone()
    conn.commit()
    conn.close()
    return {"success": True, "ticket": dict(updated) if updated else None}


@app.patch("/api/tickets/{ticket_id}/sla-state")
def update_ticket_sla_state(
    ticket_id: int,
    req: SupportSLAStateRequest,
    request: Request,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default=None),
):
    if role not in SUPPORT_ROLES:
        raise HTTPException(status_code=403, detail="Support role required")

    action = (req.action or "").strip().lower()
    if action not in ("pause", "resume", "mark_met", "reset_active"):
        raise HTTPException(status_code=400, detail="Invalid SLA action")

    token = _extract_token(authorization or request.headers.get("authorization"), None)
    actor = DEMO_ACTORS.get(token, role)
    now = datetime.utcnow()
    now_iso = now.isoformat() + "Z"

    conn = sqlite3.connect(os.path.join(DB_DIR, "support.db"))
    conn.row_factory = sqlite3.Row
    ensure_support_schema(conn)

    row = conn.execute("SELECT * FROM tickets WHERE ticket_id = ?", (ticket_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")

    current_state = (row["sla_state"] or "active").lower()
    pause_total_seconds = float(row["sla_pause_total_seconds"] or 0)
    paused_at = row["sla_paused_at"]

    if action == "pause":
        if role != "support_manager":
            conn.close()
            raise HTTPException(status_code=403, detail="Only support_manager can pause SLA")
        reason = (req.reason or "").strip()
        if len(reason) < 5:
            conn.close()
            raise HTTPException(status_code=400, detail="Pause reason must be at least 5 characters")
        if current_state == "paused":
            conn.close()
            raise HTTPException(status_code=400, detail="SLA is already paused")

        conn.execute(
            """
            UPDATE tickets
            SET sla_state = 'paused',
                sla_pause_reason = ?,
                sla_paused_at = ?,
                sla_paused_by = ?,
                updated_at = ?
            WHERE ticket_id = ?
            """,
            (reason, now_iso, actor, now_iso, ticket_id),
        )

    elif action == "resume":
        if role != "support_manager":
            conn.close()
            raise HTTPException(status_code=403, detail="Only support_manager can resume SLA")
        if current_state != "paused" or not paused_at:
            conn.close()
            raise HTTPException(status_code=400, detail="SLA is not paused")

        paused_ts = datetime.fromisoformat(paused_at.replace("Z", "+00:00"))
        pause_delta = max(0.0, (now - paused_ts.replace(tzinfo=None)).total_seconds())

        conn.execute(
            """
            UPDATE tickets
            SET sla_state = 'active',
                sla_pause_total_seconds = ?,
                sla_paused_at = NULL,
                sla_paused_by = NULL,
                sla_resumed_at = ?,
                sla_resumed_by = ?,
                updated_at = ?
            WHERE ticket_id = ?
            """,
            (pause_total_seconds + pause_delta, now_iso, actor, now_iso, ticket_id),
        )

    elif action == "mark_met":
        conn.execute(
            """
            UPDATE tickets
            SET sla_state = 'met',
                sla_met_at = ?,
                sla_met_by = ?,
                updated_at = ?
            WHERE ticket_id = ?
            """,
            (now_iso, actor, now_iso, ticket_id),
        )

    elif action == "reset_active":
        if role != "support_manager":
            conn.close()
            raise HTTPException(status_code=403, detail="Only support_manager can reset SLA state")
        conn.execute(
            """
            UPDATE tickets
            SET sla_state = 'active',
                sla_pause_reason = NULL,
                sla_paused_at = NULL,
                sla_paused_by = NULL,
                sla_resumed_at = NULL,
                sla_resumed_by = NULL,
                sla_pause_total_seconds = 0,
                sla_met_at = NULL,
                sla_met_by = NULL,
                updated_at = ?
            WHERE ticket_id = ?
            """,
            (now_iso, ticket_id),
        )

    updated = conn.execute("SELECT * FROM tickets WHERE ticket_id = ?", (ticket_id,)).fetchone()
    conn.commit()
    conn.close()
    return {"success": True, "ticket": dict(updated) if updated else None}


@app.post("/api/ai/summarize")
def ai_summarize(req: SummarizeRequest, role: str = Depends(get_role)):
    if role not in SUPPORT_ROLES:
        raise HTTPException(status_code=403, detail="Support role required")

    if len(req.text) > 4000:
        raise HTTPException(status_code=400, detail="Text exceeds maximum length of 4000 characters")
    from services.ai_client import get_ai_summary
    from services.pii_scrubber import scrub_pii
    text = scrub_pii(req.text) if req.safe_mode else req.text
    summary = get_ai_summary(text, context=req.context)
    return {"summary": summary, "safe_mode": req.safe_mode}


# ---------------------------------------------------------------------------
# QA Defects
# ---------------------------------------------------------------------------
QA_ROLES = ("qa_engineer", "qa_lead", "qa_manager")
QA_VIEW_ROLES = (*QA_ROLES, "infrastructure_developer")
QA_ANALYSIS_ROLES = ("qa_lead", "qa_manager")


def _get_qa_actor(authorization: Optional[str], fallback_role: str) -> str:
    token = (authorization or "").replace("Bearer ", "").strip()
    return DEMO_ACTORS.get(token, fallback_role)


def _parse_csv_param(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


@app.get("/api/qa/sprints")
def list_qa_sprints(role: str = Depends(get_role)):
    if role not in QA_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    rows = conn.execute(
        """
        SELECT sprint_id, start_date, end_date, release_label, modules_deployed, deploy_success_count, deploy_error_count
        FROM sprints
        ORDER BY sprint_id DESC
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/qa/defects")
def list_qa_defects(
    sprints: Optional[str] = None,
    severity: Optional[str] = None,
    component: Optional[str] = None,
    status: Optional[str] = None,
    assignee: Optional[str] = None,
    role: str = Depends(get_role),
):
    if role not in QA_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    sprint_filters = _parse_csv_param(sprints)
    query = "SELECT * FROM defects WHERE 1=1"
    params: list[str] = []

    if sprint_filters:
        placeholders = ",".join(["?"] * len(sprint_filters))
        query += f" AND sprint_id IN ({placeholders})"
        params.extend(sprint_filters)
    if severity:
        query += " AND severity = ?"
        params.append(severity)
    if component:
        query += " AND component = ?"
        params.append(component)
    if status:
        query += " AND status = ?"
        params.append(status)
    if assignee:
        query += " AND assignee = ?"
        params.append(assignee)

    query += " ORDER BY created_at DESC, defect_id DESC"

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/qa/trends/heatmap")
def get_qa_heatmap(
    sprints: Optional[str] = None,
    role: str = Depends(get_role),
):
    if role not in QA_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    sprint_filters = _parse_csv_param(sprints)
    query = (
        "SELECT sprint_id, component, severity, COUNT(*) as defect_count "
        "FROM defects WHERE 1=1"
    )
    params: list[str] = []
    if sprint_filters:
        placeholders = ",".join(["?"] * len(sprint_filters))
        query += f" AND sprint_id IN ({placeholders})"
        params.extend(sprint_filters)
    query += " GROUP BY sprint_id, component, severity ORDER BY sprint_id DESC"

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


class QANoteRequest(BaseModel):
    note_body: str


@app.get("/api/qa/defects/{defect_id}/notes")
def list_qa_notes(
    defect_id: int,
    role: str = Depends(get_role),
):
    if role not in QA_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    exists = conn.execute("SELECT defect_id FROM defects WHERE defect_id = ?", (defect_id,)).fetchone()
    if not exists:
        conn.close()
        raise HTTPException(status_code=404, detail="Defect not found")

    rows = conn.execute(
        """
        SELECT note_id, defect_id, author, note_body, created_at
        FROM defect_triage_notes
        WHERE defect_id = ?
        ORDER BY created_at DESC, note_id DESC
        """,
        (defect_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/qa/defects/{defect_id}/notes")
def add_qa_note(
    defect_id: int,
    req: QANoteRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in QA_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    note_body = req.note_body.strip()
    if not note_body:
        raise HTTPException(status_code=400, detail="Note body cannot be empty")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    exists = conn.execute("SELECT defect_id FROM defects WHERE defect_id = ?", (defect_id,)).fetchone()
    if not exists:
        conn.close()
        raise HTTPException(status_code=404, detail="Defect not found")

    actor = _get_qa_actor(authorization, role)
    created_at = datetime.utcnow().isoformat() + "Z"
    conn.execute(
        "INSERT INTO defect_triage_notes (defect_id, author, note_body, created_at) VALUES (?, ?, ?, ?)",
        (defect_id, actor, note_body, created_at),
    )
    conn.commit()

    from services.audit_logger import log_action
    log_action(actor=actor, action="qa_note_added", entity_id=defect_id, metadata={"length": len(note_body)})

    note = conn.execute(
        "SELECT * FROM defect_triage_notes WHERE note_id = last_insert_rowid()"
    ).fetchone()
    conn.close()
    return {"success": True, "note": dict(note) if note else None}


class QAStatusRequest(BaseModel):
    status: str
    resolution_reason: Optional[str] = None


@app.patch("/api/qa/defects/{defect_id}/status")
def update_qa_status(
    defect_id: int,
    req: QAStatusRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in QA_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    allowed_statuses = {
        "open",
        "investigating",
        "escalated",
        "resolved",
        "duplicate_pending",
        "duplicate_merged",
    }
    if req.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    if req.status == "duplicate_pending":
        raise HTTPException(
            status_code=400,
            detail="Duplicate Pending is set by the duplicate merge request workflow. Submit a merge request instead of setting it manually.",
        )
    if req.status == "duplicate_merged":
        raise HTTPException(
            status_code=400,
            detail="Duplicate Merged is set by merge request approval. Approve a merge request instead of setting it manually.",
        )
    if req.status == "resolved" and not req.resolution_reason:
        raise HTTPException(status_code=400, detail="Resolution reason is required when resolving")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    current = conn.execute("SELECT defect_id, assignee FROM defects WHERE defect_id = ?", (defect_id,)).fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Defect not found")

    actor = _get_qa_actor(authorization, role)
    current_assignee = (current["assignee"] or "").strip().lower()
    if role == "qa_engineer" and current_assignee and current_assignee != actor:
        conn.close()
        raise HTTPException(status_code=403, detail="QA engineer can only update unassigned or self-assigned defects")

    conn.execute(
        """
        UPDATE defects
        SET status = ?, resolution_reason = ?, updated_at = ?
        WHERE defect_id = ?
        """,
        (
            req.status,
            req.resolution_reason if req.status == "resolved" else None,
            datetime.utcnow().isoformat() + "Z",
            defect_id,
        ),
    )
    conn.commit()

    from services.audit_logger import log_action
    log_action(
        actor=actor,
        action="qa_status_updated",
        entity_id=defect_id,
        metadata={"status": req.status, "resolution_reason": req.resolution_reason},
    )

    row = conn.execute("SELECT * FROM defects WHERE defect_id = ?", (defect_id,)).fetchone()
    conn.close()
    return {"success": True, "defect": dict(row) if row else None}


class QAAssignRequest(BaseModel):
    assignee: Optional[str]


@app.patch("/api/qa/defects/{defect_id}/assign")
def assign_qa_defect(
    defect_id: int,
    req: QAAssignRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in ("qa_lead", "qa_manager"):
        raise HTTPException(status_code=403, detail="Only QA lead or manager can reassign defects")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    current = conn.execute("SELECT defect_id FROM defects WHERE defect_id = ?", (defect_id,)).fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Defect not found")

    conn.execute(
        "UPDATE defects SET assignee = ?, updated_at = ? WHERE defect_id = ?",
        (req.assignee, datetime.utcnow().isoformat() + "Z", defect_id),
    )
    conn.commit()

    actor = _get_qa_actor(authorization, role)
    from services.audit_logger import log_action
    log_action(actor=actor, action="qa_defect_assigned", entity_id=defect_id, metadata={"assignee": req.assignee})

    row = conn.execute("SELECT * FROM defects WHERE defect_id = ?", (defect_id,)).fetchone()
    conn.close()
    return {"success": True, "defect": dict(row) if row else None}


class QAClusterRequest(BaseModel):
    sprints: list[str] = []


@app.post("/api/qa/analysis/cluster")
def run_qa_cluster(
    req: QAClusterRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in QA_ANALYSIS_ROLES:
        raise HTTPException(status_code=403, detail="Only QA lead or manager can run clustering")

    sprint_filters = [s.strip() for s in req.sprints if s.strip()]
    query = "SELECT defect_id, description FROM defects WHERE 1=1"
    params: list[str] = []
    if sprint_filters:
        placeholders = ",".join(["?"] * len(sprint_filters))
        query += f" AND sprint_id IN ({placeholders})"
        params.extend(sprint_filters)
    query += " ORDER BY created_at DESC"

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)
    rows = conn.execute(query, params).fetchall()
    conn.close()

    descriptions = [r["description"] for r in rows]
    from services.ai_client import cluster_defects
    clusters = cluster_defects(descriptions)

    actor = _get_qa_actor(authorization, role)
    from services.audit_logger import log_action
    log_action(actor=actor, action="qa_cluster_run", entity_id="qa", metadata={"input_count": len(descriptions)})

    return {"clusters": clusters, "input_count": len(descriptions)}


class QADuplicateRequest(BaseModel):
    sprints: list[str] = []
    force_refresh: bool = False


@app.post("/api/qa/analysis/duplicates")
def run_qa_duplicate_detection(
    req: QADuplicateRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in QA_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    sprint_filters = [s.strip() for s in req.sprints if s.strip()]
    sprint_scope = sorted(set(sprint_filters))
    sprint_scope_key = "__all__" if not sprint_scope else ",".join(sprint_scope)
    query = "SELECT defect_id, description, component, sprint_id FROM defects WHERE 1=1"
    params: list[str] = []
    if sprint_filters:
        placeholders = ",".join(["?"] * len(sprint_filters))
        query += f" AND sprint_id IN ({placeholders})"
        params.extend(sprint_filters)

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    actor = _get_qa_actor(authorization, role)

    if not req.force_refresh:
        cached = conn.execute(
            "SELECT input_count, groups_json FROM qa_duplicate_scans WHERE sprint_scope_key = ?",
            (sprint_scope_key,),
        ).fetchone()
        if cached:
            groups = json.loads(cached["groups_json"])
            conn.close()
            from services.audit_logger import log_action
            log_action(
                actor=actor,
                action="qa_duplicate_scan",
                entity_id="qa",
                metadata={
                    "input_count": cached["input_count"],
                    "groups": len(groups),
                    "cached": True,
                    "scope": sprint_scope_key,
                },
            )
            return {"groups": groups, "input_count": cached["input_count"], "cached": True}

    rows = conn.execute(query, params).fetchall()

    records = [
        {
            "defect_id": r["defect_id"],
            "description": r["description"],
            "component": r["component"],
            "sprint_id": r["sprint_id"],
        }
        for r in rows
    ]
    from services.ai_client import find_duplicates
    groups = find_duplicates(records)

    def _tokenize(text: str) -> set[str]:
        return {tok for tok in text.lower().replace("-", " ").replace("_", " ").split() if len(tok) > 3}

    def _overlap(a: str, b: str) -> float:
        a_tokens = _tokenize(a)
        b_tokens = _tokenize(b)
        if not a_tokens or not b_tokens:
            return 0.0
        return len(a_tokens & b_tokens) / max(1, len(a_tokens | b_tokens))

    enriched_groups = []
    for group in groups:
        if len(group) < 2:
            continue

        # Merge requests require canonical/source defects to be in the same sprint.
        # Split AI duplicate groups by sprint so UI candidates are directly actionable.
        sprint_partition: dict[str, list[dict]] = {}
        for item in group:
            sprint_key = str(item.get("sprint_id") or "")
            sprint_partition.setdefault(sprint_key, []).append(item)

        for sprint_group in sprint_partition.values():
            if len(sprint_group) < 2:
                continue

            pair_scores = []
            for idx in range(len(sprint_group)):
                for jdx in range(idx + 1, len(sprint_group)):
                    pair_scores.append(_overlap(sprint_group[idx]["description"], sprint_group[jdx]["description"]))

            avg_score = sum(pair_scores) / len(pair_scores) if pair_scores else 0.0
            confidence = round(min(0.99, max(0.52, avg_score + 0.22)), 2)

            components = [item.get("component") for item in sprint_group if item.get("component")]
            top_component = max(set(components), key=components.count) if components else None

            shared_keywords = set(_tokenize(sprint_group[0]["description"]))
            for item in sprint_group[1:]:
                shared_keywords &= _tokenize(item["description"])
            keywords_list = sorted(list(shared_keywords))[:3]

            if top_component and keywords_list:
                rationale = f"Repeated {top_component} issue signals; overlapping terms: {', '.join(keywords_list)}."
            elif top_component:
                rationale = f"Repeated {top_component} defect pattern with similar reproduction context."
            else:
                rationale = "Descriptions share substantial overlap in wording and symptom pattern."

            enriched_groups.append(
                {
                    "items": sprint_group,
                    "confidence": confidence,
                    "rationale": rationale,
                }
            )

    now = datetime.utcnow().isoformat() + "Z"
    conn.execute(
        """
        INSERT INTO qa_duplicate_scans
        (sprint_scope_key, sprint_scope, input_count, groups_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sprint_scope_key) DO UPDATE SET
            sprint_scope = excluded.sprint_scope,
            input_count = excluded.input_count,
            groups_json = excluded.groups_json,
            created_by = excluded.created_by,
            updated_at = excluded.updated_at
        """,
        (
            sprint_scope_key,
            sprint_scope_key,
            len(records),
            json.dumps(enriched_groups),
            actor,
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()

    from services.audit_logger import log_action
    log_action(
        actor=actor,
        action="qa_duplicate_scan",
        entity_id="qa",
        metadata={
            "input_count": len(records),
            "groups": len(enriched_groups),
            "cached": False,
            "scope": sprint_scope_key,
        },
    )

    return {"groups": enriched_groups, "input_count": len(records), "cached": False}


class QADuplicateMergeRequest(BaseModel):
    canonical_defect_id: int
    source_defect_ids: list[int]
    confidence_score: Optional[float] = None
    reason: Optional[str] = None


class QADuplicateMergeDecisionRequest(BaseModel):
    reason: Optional[str] = None


def _validate_duplicate_merge_candidates(conn: sqlite3.Connection, canonical_id: int, source_ids: list[int]) -> dict:
    all_ids = [canonical_id, *source_ids]
    placeholders = ",".join(["?"] * len(all_ids))
    rows = conn.execute(
        f"SELECT defect_id, sprint_id, status, canonical_defect_id FROM defects WHERE defect_id IN ({placeholders})",
        all_ids,
    ).fetchall()

    row_map = {r["defect_id"]: r for r in rows}
    missing = [d for d in all_ids if d not in row_map]
    if missing:
        raise HTTPException(status_code=404, detail=f"Defects not found: {missing}")

    sprint_ids = {row_map[d]["sprint_id"] for d in all_ids}
    if len(sprint_ids) != 1:
        raise HTTPException(status_code=400, detail="Merge candidates must be in the same sprint")

    for source_id in source_ids:
        existing_canonical = row_map[source_id]["canonical_defect_id"]
        if existing_canonical is not None and existing_canonical != canonical_id:
            raise HTTPException(
                status_code=409,
                detail=f"Defect {source_id} is already merged into canonical defect {existing_canonical}",
            )

    return row_map


def _execute_duplicate_merge(
    conn: sqlite3.Connection,
    canonical_id: int,
    source_ids: list[int],
    actor: str,
    confidence_score: Optional[float],
    reason: Optional[str],
) -> dict:
    _validate_duplicate_merge_candidates(conn, canonical_id, source_ids)
    now = datetime.utcnow().isoformat() + "Z"

    conn.execute("BEGIN")
    conn.execute(
        f"""
        UPDATE defects
        SET status = 'duplicate_merged', canonical_defect_id = ?, updated_at = ?
        WHERE defect_id IN ({','.join(['?'] * len(source_ids))})
        """,
        [canonical_id, now, *source_ids],
    )

    for source_id in source_ids:
        conn.execute(
            """
            INSERT INTO defect_merge_actions
            (source_defect_id, canonical_defect_id, confidence_score, reason, approved_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (source_id, canonical_id, confidence_score, reason, actor, now),
        )

    conn.commit()
    return {
        "success": True,
        "canonical_defect_id": canonical_id,
        "merged_defect_ids": source_ids,
        "merged_count": len(source_ids),
    }


def _build_merge_request_key(canonical_id: int, source_ids: list[int]) -> str:
    all_defect_ids = sorted({int(canonical_id), *[int(source_id) for source_id in source_ids]})
    return f"defects:{','.join(str(defect_id) for defect_id in all_defect_ids)}"


def _build_merge_request_defect_ids(canonical_id: int, source_ids: list[int]) -> list[int]:
    return sorted({int(canonical_id), *[int(source_id) for source_id in source_ids]})


def _serialize_merge_request_row(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    payload = dict(row)
    source_defect_ids = json.loads(payload.pop("source_defect_ids_json"))
    payload["source_defect_ids"] = source_defect_ids
    source_previous_statuses = payload.pop("source_previous_statuses_json", None)
    payload["source_previous_statuses"] = json.loads(source_previous_statuses) if source_previous_statuses else {}

    all_ids = [payload["canonical_defect_id"], *source_defect_ids]
    placeholders = ",".join(["?"] * len(all_ids))
    defect_rows = conn.execute(
        f"""
        SELECT defect_id, sprint_id, component, severity, status, assignee, reporter, title, updated_at
        FROM defects
        WHERE defect_id IN ({placeholders})
        """,
        all_ids,
    ).fetchall()
    defect_map = {defect_row["defect_id"]: dict(defect_row) for defect_row in defect_rows}

    payload["canonical_defect"] = defect_map.get(payload["canonical_defect_id"])
    payload["source_defects"] = [
        defect_map[source_id]
        for source_id in source_defect_ids
        if source_id in defect_map
    ]
    return payload


@app.post("/api/qa/analysis/duplicates/requests")
def create_qa_duplicate_merge_request(
    req: QADuplicateMergeRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in QA_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    canonical_id = req.canonical_defect_id
    source_ids = sorted({d for d in req.source_defect_ids if d != canonical_id})
    if not source_ids:
        raise HTTPException(status_code=400, detail="At least one source defect must be provided")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    row_map = _validate_duplicate_merge_candidates(conn, canonical_id, source_ids)
    request_key = _build_merge_request_key(canonical_id, source_ids)
    requested_defect_ids = _build_merge_request_defect_ids(canonical_id, source_ids)
    source_previous_statuses = {str(source_id): row_map[source_id]["status"] for source_id in source_ids}

    existing_request = conn.execute(
        """
        SELECT request_id, requested_by, created_at
        FROM defect_merge_requests
        WHERE request_key = ? AND status = 'pending'
        ORDER BY request_id DESC
        LIMIT 1
        """,
        (request_key,),
    ).fetchone()
    if existing_request:
        conn.close()
        raise HTTPException(
            status_code=409,
            detail=(
                "A pending merge request already exists "
                f"(request #{existing_request['request_id']} by {existing_request['requested_by']} on {existing_request['created_at']})"
            ),
        )

    pending_requests = conn.execute(
        """
        SELECT request_id, canonical_defect_id, source_defect_ids_json, requested_by, created_at
        FROM defect_merge_requests
        WHERE status = 'pending'
        ORDER BY request_id DESC
        """
    ).fetchall()
    for pending_request in pending_requests:
        pending_defect_ids = _build_merge_request_defect_ids(
            pending_request["canonical_defect_id"],
            json.loads(pending_request["source_defect_ids_json"]),
        )
        overlapping_defect_ids = sorted(set(requested_defect_ids).intersection(pending_defect_ids))
        if overlapping_defect_ids:
            conn.close()
            raise HTTPException(
                status_code=409,
                detail=(
                    "Some defects are already part of a pending merge request "
                    f"(request #{pending_request['request_id']} by {pending_request['requested_by']} on {pending_request['created_at']}). "
                    f"Overlapping defect IDs: {', '.join(f'#{defect_id}' for defect_id in overlapping_defect_ids)}"
                ),
            )

    actor = _get_qa_actor(authorization, role)
    now = datetime.utcnow().isoformat() + "Z"
    conn.execute(
        """
        INSERT INTO defect_merge_requests
        (canonical_defect_id, source_defect_ids_json, source_previous_statuses_json, request_key, confidence_score, reason, requested_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        """,
        (
            canonical_id,
            json.dumps(source_ids),
            json.dumps(source_previous_statuses),
            request_key,
            req.confidence_score,
            req.reason,
            actor,
            now,
            now,
        ),
    )
    conn.execute(
        f"""
        UPDATE defects
        SET status = 'duplicate_pending', updated_at = ?
        WHERE defect_id IN ({','.join(['?'] * len(source_ids))})
          AND status != 'duplicate_merged'
        """,
        [now, *source_ids],
    )
    conn.commit()
    request_row = conn.execute(
        "SELECT * FROM defect_merge_requests WHERE request_id = last_insert_rowid()"
    ).fetchone()

    from services.audit_logger import log_action
    log_action(
        actor=actor,
        action="qa_duplicate_merge_requested",
        entity_id=canonical_id,
        metadata={
            "canonical_defect_id": canonical_id,
            "source_defect_ids": source_ids,
        },
    )

    payload = _serialize_merge_request_row(conn, request_row) if request_row else None
    conn.close()
    return {"success": True, "request": payload}


@app.get("/api/qa/analysis/duplicates/requests")
def list_qa_duplicate_merge_requests(
    status: str = "pending",
    role: str = Depends(get_role),
):
    if role not in ("qa_lead", "qa_manager"):
        raise HTTPException(status_code=403, detail="Only QA lead or manager can review merge requests")

    if status not in ("pending", "approved", "rejected", "all"):
        raise HTTPException(status_code=400, detail="Invalid status")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    if status == "all":
        rows = conn.execute(
            "SELECT * FROM defect_merge_requests ORDER BY created_at DESC, request_id DESC"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM defect_merge_requests WHERE status = ? ORDER BY created_at DESC, request_id DESC",
            (status,),
        ).fetchall()
    results = [_serialize_merge_request_row(conn, row) for row in rows]
    conn.close()
    return results


@app.post("/api/qa/analysis/duplicates/requests/{request_id}/approve")
def approve_qa_duplicate_merge_request(
    request_id: int,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in ("qa_lead", "qa_manager"):
        raise HTTPException(status_code=403, detail="Only QA lead or manager can approve merge requests")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    req_row = conn.execute(
        "SELECT * FROM defect_merge_requests WHERE request_id = ?",
        (request_id,),
    ).fetchone()
    if not req_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Merge request not found")
    if req_row["status"] != "pending":
        conn.close()
        raise HTTPException(status_code=409, detail="Merge request is not pending")

    actor = _get_qa_actor(authorization, role)
    canonical_id = req_row["canonical_defect_id"]
    source_ids = json.loads(req_row["source_defect_ids_json"])

    result = _execute_duplicate_merge(
        conn,
        canonical_id,
        source_ids,
        actor,
        req_row["confidence_score"],
        req_row["reason"],
    )

    now = datetime.utcnow().isoformat() + "Z"
    conn.execute(
        """
        UPDATE defect_merge_requests
        SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
        WHERE request_id = ?
        """,
        (actor, now, now, request_id),
    )
    conn.commit()
    conn.close()

    from services.audit_logger import log_action
    log_action(
        actor=actor,
        action="qa_duplicate_merge_approved",
        entity_id=canonical_id,
        metadata={
            "request_id": request_id,
            "canonical_defect_id": canonical_id,
            "source_defect_ids": source_ids,
        },
    )

    return {"success": True, "request_id": request_id, "merge": result}


@app.post("/api/qa/analysis/duplicates/requests/{request_id}/reject")
def reject_qa_duplicate_merge_request(
    request_id: int,
    req: QADuplicateMergeDecisionRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in ("qa_lead", "qa_manager"):
        raise HTTPException(status_code=403, detail="Only QA lead or manager can reject merge requests")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    req_row = conn.execute(
        "SELECT * FROM defect_merge_requests WHERE request_id = ?",
        (request_id,),
    ).fetchone()
    if not req_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Merge request not found")
    if req_row["status"] != "pending":
        conn.close()
        raise HTTPException(status_code=409, detail="Merge request is not pending")

    actor = _get_qa_actor(authorization, role)
    now = datetime.utcnow().isoformat() + "Z"
    source_ids = json.loads(req_row["source_defect_ids_json"])
    source_previous_statuses = json.loads(req_row["source_previous_statuses_json"]) if req_row["source_previous_statuses_json"] else {}
    conn.execute(
        """
        UPDATE defect_merge_requests
        SET status = 'rejected', approved_by = ?, approved_at = ?, updated_at = ?
        WHERE request_id = ?
        """,
        (actor, now, now, request_id),
    )
    if source_ids:
        for source_id in source_ids:
            restored_status = source_previous_statuses.get(str(source_id), "open")
            conn.execute(
                """
                UPDATE defects
                SET status = ?, updated_at = ?
                WHERE defect_id = ?
                """,
                (restored_status, now, source_id),
            )
    conn.commit()
    conn.close()

    from services.audit_logger import log_action
    log_action(
        actor=actor,
        action="qa_duplicate_merge_rejected",
        entity_id=req_row["canonical_defect_id"],
        metadata={
            "request_id": request_id,
            "canonical_defect_id": req_row["canonical_defect_id"],
            "source_defect_ids": json.loads(req_row["source_defect_ids_json"]),
            "reason": req.reason,
        },
    )

    return {"success": True, "request_id": request_id}


@app.post("/api/qa/analysis/duplicates/merge")
def merge_qa_duplicates(
    req: QADuplicateMergeRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in ("qa_lead", "qa_manager"):
        raise HTTPException(status_code=403, detail="Only QA lead or manager can merge duplicates directly")

    canonical_id = req.canonical_defect_id
    source_ids = sorted({d for d in req.source_defect_ids if d != canonical_id})
    if not source_ids:
        raise HTTPException(status_code=400, detail="At least one source defect must be provided")

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)

    actor = _get_qa_actor(authorization, role)
    result = _execute_duplicate_merge(conn, canonical_id, source_ids, actor, req.confidence_score, req.reason)
    conn.close()

    from services.audit_logger import log_action
    log_action(
        actor=actor,
        action="qa_duplicates_merged",
        entity_id=canonical_id,
        metadata={
            "canonical_defect_id": canonical_id,
            "merged_defect_ids": source_ids,
            "merged_count": len(source_ids),
            "confidence_score": req.confidence_score,
        },
    )

    return result


@app.get("/api/qa/reports/export.csv")
def export_qa_report_csv(
    sprints: Optional[str] = None,
    severity: Optional[str] = None,
    component: Optional[str] = None,
    status: Optional[str] = None,
    assignee: Optional[str] = None,
    role: str = Depends(get_role),
):
    if role not in QA_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")

    sprint_filters = _parse_csv_param(sprints)
    query = "SELECT defect_id, sprint_id, component, severity, status, resolution_reason, assignee, title, created_at FROM defects WHERE 1=1"
    params: list[str] = []
    if sprint_filters:
        placeholders = ",".join(["?"] * len(sprint_filters))
        query += f" AND sprint_id IN ({placeholders})"
        params.extend(sprint_filters)
    if severity:
        query += " AND severity = ?"
        params.append(severity)
    if component:
        query += " AND component = ?"
        params.append(component)
    if status:
        query += " AND status = ?"
        params.append(status)
    if assignee:
        query += " AND assignee = ?"
        params.append(assignee)
    query += " ORDER BY sprint_id DESC, defect_id DESC"

    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    ensure_qa_schema(conn)
    rows = conn.execute(query, params).fetchall()
    conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["defect_id", "sprint_id", "component", "severity", "status", "resolution_reason", "assignee", "title", "created_at"])
    for row in rows:
        writer.writerow([
            row["defect_id"],
            row["sprint_id"],
            row["component"],
            row["severity"],
            row["status"],
            row["resolution_reason"],
            row["assignee"],
            row["title"],
            row["created_at"],
        ])

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=qa_defects_report.csv"},
    )


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------
LOG_VIEW_ROLES = ("ops_engineer", "it_admin", "support_manager", "infrastructure_developer")
LOG_EDIT_ROLES = ("ops_engineer", "it_admin", "support_manager")


@app.get("/api/logs/team")
def list_team_logs(
    level: Optional[str] = None,
    service: Optional[str] = None,
    status: Optional[str] = None,
    anomaly_only: bool = False,
    sort: str = "timestamp",
    role: str = Depends(get_role),
):
    if role not in LOG_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    ensure_log_flag_columns(conn)
    
    query = "SELECT * FROM logs WHERE 1=1"
    params = []
    
    if level:
        query += " AND level = ?"
        params.append(level)
    if service:
        query += " AND service = ?"
        params.append(service)
    if status:
        query += " AND status = ?"
        params.append(status)
    if anomaly_only:
        query += " AND anomaly_score > 75"
    
    if sort == "anomaly":
        query += " ORDER BY anomaly_score DESC"
    else:
        query += " ORDER BY timestamp DESC"
    
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/logs/my-assigned")
def list_assigned_logs(engineer: str, role: str = Depends(get_role)):
    if role not in LOG_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    ensure_log_flag_columns(conn)
    rows = conn.execute(
        "SELECT * FROM logs WHERE assigned_to = ? ORDER BY anomaly_score DESC",
        (engineer,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/logs/stats")
def get_logs_stats(role: str = Depends(get_role)):
    if role not in LOG_VIEW_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    ensure_log_flag_columns(conn)
    
    total_high = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE anomaly_score > 75").fetchone()[0]
    unassigned = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE anomaly_score > 75 AND assigned_to IS NULL").fetchone()[0]
    unreviewed = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE status = 'unreviewed' AND assigned_to IS NOT NULL").fetchone()[0]
    in_review = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE status = 'in_review'").fetchone()[0]
    resolved = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE status = 'resolved'").fetchone()[0]
    
    conn.close()
    return {
        "total_high_anomaly": total_high,
        "unassigned_count": unassigned,
        "unreviewed_count": unreviewed,
        "in_review_count": in_review,
        "resolved_count": resolved,
    }


class AssignRequest(BaseModel):
    assigned_to: Optional[str]
    status: Optional[str] = None


@app.post("/api/logs/{log_id}/assign")
def assign_log(log_id: int, req: AssignRequest, role: str = Depends(get_role)):
    if role not in ("it_admin", "support_manager"):
        raise HTTPException(status_code=403, detail="Only managers can reassign logs")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    ensure_log_flag_columns(conn)
    
    # Update assignment and optionally status
    if req.status:
        conn.execute(
            "UPDATE logs SET assigned_to = ?, status = ? WHERE log_id = ?",
            (req.assigned_to, req.status, log_id)
        )
    else:
        conn.execute(
            "UPDATE logs SET assigned_to = ? WHERE log_id = ?",
            (req.assigned_to, log_id)
        )
    
    conn.commit()
    
    # Log audit trail
    from services.audit_logger import log_action
    log_action(
        actor=role,
        action="log_assigned",
        entity_id=log_id,
        metadata={"assigned_to": req.assigned_to, "status": req.status}
    )
    
    # Return updated log
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM logs WHERE log_id = ?", (log_id,)).fetchone()
    conn.close()
    
    return {"success": True, "log": dict(row) if row else None}


class StatusRequest(BaseModel):
    status: str


@app.patch("/api/logs/{log_id}/status")
def update_log_status(log_id: int, req: StatusRequest, role: str = Depends(get_role)):
    if role not in LOG_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.execute("UPDATE logs SET status = ? WHERE log_id = ?", (req.status, log_id))
    conn.commit()
    
    from services.audit_logger import log_action
    log_action(
        actor=role,
        action="log_status_updated",
        entity_id=log_id,
        metadata={"status": req.status}
    )
    
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM logs WHERE log_id = ?", (log_id,)).fetchone()
    conn.close()
    
    return {"success": True, "log": dict(row) if row else None}


class DemoAnomalyRequest(BaseModel):
    service: Optional[str] = "api-service"
    message: Optional[str] = "DEMO: sustained error burst detected in checkout path"
    anomaly_score: Optional[int] = 96


@app.post("/api/logs/demo/anomaly")
def create_demo_anomaly(req: DemoAnomalyRequest, role: str = Depends(get_role)):
    if role not in ("support_manager", "it_admin"):
        raise HTTPException(status_code=403, detail="Manager or IT Admin role required")

    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    ensure_log_flag_columns(conn)

    now_ts = datetime.utcnow().isoformat() + "Z"
    level = "ERROR"
    message = (req.message or "DEMO: sustained error burst detected in checkout path").strip()
    service = (req.service or "api-service").strip()
    score = max(76, min(100, int(req.anomaly_score or 96)))

    conn.execute(
        """
        INSERT INTO logs (
            timestamp,
            service,
            level,
            message,
            anomaly_score,
            assigned_to,
            status,
            is_flagged,
            flagged_by,
            flagged_at,
            flagged_reason
        ) VALUES (?, ?, ?, ?, ?, NULL, 'unreviewed', 0, NULL, NULL, NULL)
        """,
        (now_ts, service, level, message, score),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM logs WHERE log_id = last_insert_rowid()").fetchone()
    conn.close()

    return {"success": True, "log": dict(row) if row else None}


@app.delete("/api/logs/demo/cleanup")
def cleanup_demo_logs(role: str = Depends(get_role)):
    if role not in ("support_manager", "it_admin"):
        raise HTTPException(status_code=403, detail="Manager or IT Admin role required")

    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    cursor = conn.cursor()
    cursor.execute("DELETE FROM logs WHERE message LIKE 'DEMO:%'")
    deleted = cursor.rowcount
    conn.commit()
    conn.close()

    return {"success": True, "deleted": deleted}


class FlagRequest(BaseModel):
    flagged: bool
    reason: Optional[str] = None
    engineer: Optional[str] = None


@app.patch("/api/logs/{log_id}/flag")
def update_log_flag(
    log_id: int,
    req: FlagRequest,
    role: str = Depends(get_role),
    authorization: Optional[str] = Header(default="Bearer token-agent"),
):
    if role not in LOG_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    ensure_log_flag_columns(conn)

    current = conn.execute("SELECT * FROM logs WHERE log_id = ?", (log_id,)).fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Log not found")

    token = (authorization or "").replace("Bearer ", "").strip()
    actor = DEMO_ACTORS.get(token)

    # Ops engineers can only flag logs currently assigned to themselves.
    if role == "ops_engineer" and current["assigned_to"] != actor:
        conn.close()
        raise HTTPException(status_code=403, detail="Only the assigned engineer can flag this log")

    if req.flagged:
        conn.execute(
            """
            UPDATE logs
            SET is_flagged = 1,
                flagged_by = ?,
                flagged_at = ?,
                flagged_reason = ?
            WHERE log_id = ?
            """,
            (actor or req.engineer or role, datetime.utcnow().isoformat() + "Z", req.reason, log_id),
        )
    else:
        conn.execute(
            """
            UPDATE logs
            SET is_flagged = 0,
                flagged_by = NULL,
                flagged_at = NULL,
                flagged_reason = NULL
            WHERE log_id = ?
            """,
            (log_id,),
        )

    conn.commit()

    from services.audit_logger import log_action
    log_action(
        actor=actor or req.engineer or role,
        action="log_flag_updated",
        entity_id=log_id,
        metadata={"flagged": req.flagged, "reason": req.reason},
    )

    row = conn.execute("SELECT * FROM logs WHERE log_id = ?", (log_id,)).fetchone()
    conn.close()
    return {"success": True, "log": dict(row) if row else None}


@app.get("/api/logs/{log_id}/explain")
def explain_log(
    log_id: int,
    engineer: Optional[str] = None,
    safe_mode: bool = True,
    role: str = Depends(get_role),
):
    if role not in ("ops_engineer", "it_admin", "infrastructure_developer"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    ensure_log_flag_columns(conn)
    row = conn.execute("SELECT * FROM logs WHERE log_id = ?", (log_id,)).fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Log not found")
    
    log = dict(row)
    
    if log["anomaly_score"] <= 75:
        return {
            "explanation": "Anomaly score too low for explanation",
            "anomaly_score": log["anomaly_score"],
            "safe_mode": safe_mode,
        }
    
    from services.ai_client import explain_anomaly
    from services.pii_scrubber import redact_sensitive

    # Safe mode ensures sensitive fields are redacted before external AI calls.
    ai_message = redact_sensitive(log["message"]) if safe_mode else log["message"]
    explanation = explain_anomaly(ai_message, log["anomaly_score"])
    
    from services.audit_logger import log_action
    log_action(
        actor=engineer or role,
        action="log_explained",
        entity_id=log_id,
        metadata={"safe_mode": safe_mode}
    )

    return {
        "explanation": explanation,
        "anomaly_score": log["anomaly_score"],
        "safe_mode": safe_mode,
    }


# ---------------------------------------------------------------------------
# Manager AI Ops Brief
# ---------------------------------------------------------------------------
@app.get("/api/logs/ops-brief")
def get_ops_brief(role: str = Depends(get_role)):
    if role not in ("support_manager", "it_admin"):
        raise HTTPException(status_code=403, detail="Manager or IT Admin role required")

    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    ensure_log_flag_columns(conn)

    high_anomaly = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE anomaly_score > 75").fetchone()[0]
    unassigned = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE anomaly_score > 75 AND assigned_to IS NULL").fetchone()[0]
    in_review = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE status = 'in_review'").fetchone()[0]
    resolved = conn.execute("SELECT COUNT(*) as cnt FROM logs WHERE status = 'resolved'").fetchone()[0]

    workload_rows = conn.execute(
        """
        SELECT assigned_to,
               SUM(CASE WHEN status = 'unreviewed' THEN 1 ELSE 0 END) as unreviewed,
               SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) as in_review,
               SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
               COUNT(*) as total
        FROM logs
        WHERE assigned_to IS NOT NULL
        GROUP BY assigned_to
        ORDER BY total DESC
        """
    ).fetchall()
    workload = [dict(r) for r in workload_rows]

    oldest_row = conn.execute(
        "SELECT timestamp FROM logs WHERE status = 'unreviewed' AND assigned_to IS NOT NULL ORDER BY timestamp ASC LIMIT 1"
    ).fetchone()
    oldest_unreviewed = oldest_row["timestamp"] if oldest_row else None
    conn.close()

    context = {
        "high_anomaly_total": high_anomaly,
        "unassigned": unassigned,
        "in_review": in_review,
        "resolved": resolved,
        "workload_per_engineer": workload,
        "oldest_unreviewed_timestamp": oldest_unreviewed,
    }

    from services.ai_client import generate_ops_brief
    from services.audit_logger import log_action

    brief = generate_ops_brief(context)

    log_action(
        actor=role,
        action="ops_brief_generated",
        entity_id=0,
        metadata={"safe_mode": True}
    )

    import datetime
    return {
        "brief": brief,
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "service": "internal-tools-sandbox-api"}
