"""Seed QA defects database."""
import os
import sqlite3
import random

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/qa.db")

COMPONENTS = ["auth", "payments", "dashboard", "api-gateway", "notifications", "reporting", "mobile"]
SEVERITIES = ["critical", "high", "medium", "low"]
ENGINEERS = ["alice", "bob", "carol", "david", "emma", "frank"]
SPRINTS = ["sprint-42", "sprint-43", "sprint-44", "sprint-45"]
DESCRIPTIONS = [
    "Login fails with 401 after token refresh on mobile",
    "OAuth2 flow breaks when user has special characters in email",
    "Dashboard chart renders blank on Safari 16",
    "Payment webhook silently drops events with null amount",
    "Email notification template renders HTML tags as plain text",
    "API returns 200 with empty body instead of 404",
    "Report export ignores date range filter",
    "Mobile app crashes on Android 12 when camera permission denied",
    "Login session expires too quickly — 5 min instead of 60",
    "Notification emails sent in wrong locale",
    "Dashboard pagination resets on filter change",
    "Invoice calculation rounds down incorrectly for fractional units",
    "Auth token not cleared on explicit logout",
    "Slow query in report endpoint — 12s for large date ranges",
    "Duplicate webhook events on payment retry",
]


def seed_qa():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS defects")
    conn.execute("""
        CREATE TABLE defects (
            defect_id INTEGER PRIMARY KEY,
            component TEXT,
            severity TEXT,
            description TEXT,
            sprint TEXT,
            engineer TEXT,
            tags TEXT
        )
    """)
    rows = []
    for i in range(1, 41):
        rows.append((
            i,
            random.choice(COMPONENTS),
            random.choice(SEVERITIES),
            random.choice(DESCRIPTIONS),
            random.choice(SPRINTS),
            random.choice(ENGINEERS),
            ",".join(random.sample(["ui", "backend", "api", "db", "auth", "mobile"], k=2)),
        ))
    conn.executemany("INSERT INTO defects VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_qa()
    print("qa.db seeded.")
