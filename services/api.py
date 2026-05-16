"""
Mock FastAPI service — serves all tool endpoints locally.
Start with: uvicorn services.api:app --reload --port 8000
"""
import os
import sqlite3
import json
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Internal Tools Sandbox API", version="1.0.0")

DB_DIR = os.path.join(os.path.dirname(__file__), "../db")

# ---------------------------------------------------------------------------
# Simple token auth simulation
# ---------------------------------------------------------------------------
DEMO_TOKENS = {
    "token-agent": "support_agent",
    "token-manager": "support_manager",
    "token-qa": "qa_engineer",
    "token-ops": "ops_engineer",
    "token-alice": "ops_engineer",
    "token-bob": "ops_engineer",
    "token-carol": "ops_engineer",
    "token-hr": "hr_admin",
    "token-it": "it_admin",
}


def get_role(authorization: Optional[str] = Header(default="Bearer token-agent")) -> str:
    token = (authorization or "").replace("Bearer ", "").strip()
    role = DEMO_TOKENS.get(token)
    if not role:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return role


# ---------------------------------------------------------------------------
# Support Tickets
# ---------------------------------------------------------------------------
@app.get("/api/tickets")
def list_tickets(role: str = Depends(get_role)):
    conn = sqlite3.connect(os.path.join(DB_DIR, "support.db"))
    conn.row_factory = sqlite3.Row
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
    conn = sqlite3.connect(os.path.join(DB_DIR, "support.db"))
    conn.row_factory = sqlite3.Row
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


@app.post("/api/ai/summarize")
def ai_summarize(req: SummarizeRequest, role: str = Depends(get_role)):
    if len(req.text) > 4000:
        raise HTTPException(status_code=400, detail="Text exceeds maximum length of 4000 characters")
    from services.ai_client import get_ai_summary
    from services.pii_scrubber import scrub_pii
    text = scrub_pii(req.text) if req.safe_mode else req.text
    summary = get_ai_summary(text, context=req.context)
    return {"summary": summary, "safe_mode": req.safe_mode}


# ---------------------------------------------------------------------------
# Defects
# ---------------------------------------------------------------------------
@app.get("/api/defects")
def list_defects(role: str = Depends(get_role)):
    conn = sqlite3.connect(os.path.join(DB_DIR, "qa.db"))
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM defects").fetchall()
    conn.close()
    return [dict(r) for r in rows]


class ClusterRequest(BaseModel):
    descriptions: list[str]


@app.post("/api/ai/cluster-defects")
def ai_cluster(req: ClusterRequest, role: str = Depends(get_role)):
    if role not in ("qa_engineer", "support_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    from services.ai_client import cluster_defects
    return cluster_defects(req.descriptions)


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------
@app.get("/api/logs/team")
def list_team_logs(
    level: Optional[str] = None,
    service: Optional[str] = None,
    status: Optional[str] = None,
    anomaly_only: bool = False,
    sort: str = "timestamp",
    role: str = Depends(get_role),
):
    if role not in ("ops_engineer", "it_admin", "support_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    
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
    if role not in ("ops_engineer", "it_admin", "support_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM logs WHERE assigned_to = ? ORDER BY anomaly_score DESC",
        (engineer,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/logs/stats")
def get_logs_stats(role: str = Depends(get_role)):
    if role not in ("ops_engineer", "it_admin", "support_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    
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
    if role not in ("ops_engineer", "it_admin", "support_manager"):
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


@app.get("/api/logs/{log_id}/explain")
def explain_log(
    log_id: int,
    engineer: Optional[str] = None,
    safe_mode: bool = True,
    role: str = Depends(get_role),
):
    if role not in ("ops_engineer", "it_admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    conn = sqlite3.connect(os.path.join(DB_DIR, "logs.db"))
    conn.row_factory = sqlite3.Row
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
