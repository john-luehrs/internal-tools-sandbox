"""Seed onboarding database."""
import os
import sqlite3
import random
from datetime import date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/onboarding.db")

DEPTS = ["Engineering", "Product", "Sales", "Finance", "HR", "Operations"]
NAMES = ["Chris Park", "Dana Singh", "Evan Nguyen", "Fiona Okafor", "George Kim",
         "Hannah Patel", "Ivan Reyes", "Julia Chen", "Kevin Walsh", "Laura Bennett"]


def seed_onboarding():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS employees")
    conn.execute("DROP TABLE IF EXISTS onboarding_progress")
    conn.execute("""
        CREATE TABLE employees (
            employee_id INTEGER PRIMARY KEY,
            full_name TEXT,
            email TEXT,
            department TEXT,
            start_date TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE onboarding_progress (
            employee_id INTEGER,
            step INTEGER,
            status TEXT,
            updated_by TEXT,
            updated_at TEXT,
            PRIMARY KEY (employee_id, step)
        )
    """)
    today = date.today()
    for i, name in enumerate(NAMES, 1):
        email = f"{name.replace(' ', '.').lower()}@company.internal"
        start = today + timedelta(days=random.randint(-5, 14))
        conn.execute(
            "INSERT INTO employees VALUES (?, ?, ?, ?, ?)",
            (i, name, email, random.choice(DEPTS), start.isoformat()),
        )
        # Seed some partial progress for first few employees
        if i <= 3:
            for step in range(1, random.randint(3, 8)):
                conn.execute(
                    "INSERT INTO onboarding_progress VALUES (?, ?, ?, ?, ?)",
                    (i, step, "complete", "hr_admin", "2025-01-01T10:00:00"),
                )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_onboarding()
    print("onboarding.db seeded.")
