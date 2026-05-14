"""Seed logs database."""
import os
import sqlite3
import random
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/logs.db")

SERVICES = ["api-service", "auth-service", "worker-service", "notification-service", "payment-service"]
LEVELS = ["ERROR", "WARN", "INFO", "DEBUG"]
LEVEL_WEIGHTS = [0.10, 0.20, 0.50, 0.20]
OPS_TEAM = ["alice", "bob", "carol", "david"]  # Ops team members for assignment

MESSAGES = {
    "ERROR": [
        "Unhandled exception in payment processor: NullPointerException",
        "Database connection pool exhausted after 30s timeout",
        "Failed to send notification: SMTP timeout",
        "Auth token validation failed: signature mismatch",
        "Worker job crashed: memory limit exceeded (512MB)",
    ],
    "WARN": [
        "Slow query detected: 4200ms for SELECT * FROM invoices",
        "Retry attempt 3/5 for webhook delivery",
        "Cache miss rate above threshold: 78%",
        "Response time p99 above SLA: 2800ms",
        "Deprecated API endpoint called: /api/v1/users",
    ],
    "INFO": [
        "Request completed: POST /api/payments 200 142ms",
        "Worker job started: report_generation_daily",
        "Cache warm-up completed: 1240 entries loaded",
        "User session created: user_id=*** role=support_agent",
        "Deploy completed: api-service v2.4.1",
    ],
    "DEBUG": [
        "DB query executed: SELECT tickets WHERE sla_tier=? (12ms)",
        "Feature flag evaluated: new_dashboard=false user_id=***",
        "Config reloaded from environment",
        "Middleware chain: auth → rbac → rate_limit → handler",
    ],
}


def seed_logs():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS logs")
    conn.execute("""
        CREATE TABLE logs (
            log_id INTEGER PRIMARY KEY,
            timestamp TEXT,
            service TEXT,
            level TEXT,
            message TEXT,
            anomaly_score INTEGER,
            assigned_to TEXT,
            status TEXT DEFAULT 'unreviewed'
        )
    """)
    now = datetime.utcnow()
    rows = []
    for i in range(1, 201):
        level = random.choices(LEVELS, weights=LEVEL_WEIGHTS)[0]
        ts = now - timedelta(minutes=random.randint(0, 1440))
        # Higher anomaly scores for errors
        base_score = {"ERROR": 60, "WARN": 30, "INFO": 5, "DEBUG": 2}[level]
        anomaly = min(100, base_score + random.randint(-10, 40))
        assigned_to = None
        status = "unreviewed"
        if anomaly > 75:
            assigned_to = random.choice(OPS_TEAM)
            status = random.choice(["unreviewed", "in_review", "resolved"])
        rows.append((
            i,
            ts.isoformat(),
            random.choice(SERVICES),
            level,
            random.choice(MESSAGES[level]),
            anomaly,
            assigned_to,
            status,
        ))
    conn.executemany("INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_logs()
    print("logs.db seeded.")
