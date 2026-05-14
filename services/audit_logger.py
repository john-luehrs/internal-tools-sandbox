"""
Audit logger — writes structured audit events to db/audit.db.
No PII is logged. Only user identity (role/name), action, and entity ID.
"""
import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/audit.db")


def _ensure_table():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_id TEXT,
            metadata TEXT
        )
    """)
    conn.commit()
    conn.close()


def log_action(actor: str, action: str, entity_id: str = None, metadata: dict = None):
    """Log an auditable action. Never include PII in actor/action/entity_id."""
    _ensure_table()
    import json
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO audit_log (timestamp, actor, action, entity_id, metadata) VALUES (?, ?, ?, ?, ?)",
        (datetime.utcnow().isoformat(), actor, action, str(entity_id) if entity_id else None,
         json.dumps(metadata) if metadata else None),
    )
    conn.commit()
    conn.close()


def log_ai_call(user: str, entity_id, safe_mode: bool = True):
    """Convenience wrapper for AI call audit logging."""
    log_action(actor=user, action="ai_call", entity_id=str(entity_id), metadata={"safe_mode": safe_mode})
