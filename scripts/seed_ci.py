"""Seed CI/CD workflow run history."""
import os
import sqlite3
import random
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/ci.db")

WORKFLOWS = ["lint", "test", "build", "deploy-staging", "deploy-prod"]
ACTORS = ["alice", "bob", "carol", "david", "ci-bot"]
STATUSES = ["success", "success", "success", "failure", "in_progress"]


def seed_ci():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS workflow_runs")
    conn.execute("""
        CREATE TABLE workflow_runs (
            run_id TEXT PRIMARY KEY,
            workflow_id TEXT,
            status TEXT,
            triggered_by TEXT,
            started_at TEXT,
            duration_seconds INTEGER,
            cache_hit INTEGER
        )
    """)
    now = datetime.utcnow()
    rows = []
    for i in range(1, 51):
        ts = now - timedelta(hours=random.randint(0, 72))
        rows.append((
            f"run_{i:04d}",
            random.choice(WORKFLOWS),
            random.choice(STATUSES),
            random.choice(ACTORS),
            ts.isoformat(),
            random.randint(30, 600),
            random.randint(0, 1),
        ))
    conn.executemany("INSERT INTO workflow_runs VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_ci()
    print("ci.db seeded.")
