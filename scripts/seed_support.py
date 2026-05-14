"""Seed support ticket database with synthetic data."""
import os
import sqlite3
import random

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/support.db")

NAMES = ["Alice Johnson", "Bob Martinez", "Carol Williams", "David Lee", "Emma Brown",
         "Frank Davis", "Grace Wilson", "Henry Moore", "Isabella Taylor", "James Anderson"]
DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "company.org"]
SLA_TIERS = ["platinum", "gold", "silver", "bronze"]
DESCRIPTIONS = [
    "Unable to log into the portal since yesterday morning.",
    "Payment processing fails with error code 500 on checkout.",
    "Email notifications stopped arriving three days ago.",
    "Dashboard graphs are not loading for the past 24 hours.",
    "API rate limit errors appearing despite low usage.",
    "Account merge request from duplicate customer entries.",
    "Data export function returns empty file every time.",
    "SSO integration broken after IT pushed new policy.",
    "Mobile app crashes on startup after latest update.",
    "Billing report shows incorrect totals for last quarter.",
    "Two-factor auth codes not sending via SMS.",
    "Search results returning stale data after record update.",
]
INTERNAL_NOTES = [
    "Customer has escalated twice before. Check prior tickets.",
    "Known issue with SSO — engineering aware. ETA 48h.",
    "High-value account. Escalate immediately.",
    "Duplicate of ticket #1042. Merge if confirmed.",
    "Billing team needs to verify manually.",
    "Requires backend data team involvement.",
]


def seed_support():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS tickets")
    conn.execute("""
        CREATE TABLE tickets (
            ticket_id INTEGER PRIMARY KEY,
            customer_name TEXT,
            email TEXT,
            phone TEXT,
            sla_tier TEXT,
            risk_score INTEGER,
            description TEXT,
            internal_notes TEXT
        )
    """)
    rows = []
    for i in range(1, 31):
        name = random.choice(NAMES)
        email = f"{name.split()[0].lower()}.{name.split()[1].lower()}{random.randint(1,99)}@{random.choice(DOMAINS)}"
        phone = f"{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
        rows.append((
            i, name, email, phone,
            random.choice(SLA_TIERS),
            random.randint(10, 100),
            random.choice(DESCRIPTIONS),
            random.choice(INTERNAL_NOTES),
        ))
    conn.executemany(
        "INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_support()
    print("support.db seeded.")
