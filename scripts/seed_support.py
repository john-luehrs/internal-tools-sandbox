"""Seed support ticket database with synthetic data."""
import os
import sqlite3
import random
from datetime import datetime, timedelta

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
            internal_notes TEXT,
            created_at TEXT,
            updated_at TEXT,
            escalation_status TEXT,
            escalation_target TEXT,
            escalation_reason TEXT,
            escalation_requested_by TEXT,
            escalation_requested_at TEXT,
            escalation_resolved_by TEXT,
            escalation_resolved_at TEXT,
            sla_state TEXT,
            sla_pause_reason TEXT,
            sla_paused_at TEXT,
            sla_paused_by TEXT,
            sla_resumed_at TEXT,
            sla_resumed_by TEXT,
            sla_pause_total_seconds REAL,
            sla_met_at TEXT,
            sla_met_by TEXT
        )
    """)
    rows = []
    now = datetime.utcnow()
    sla_base_hours = {
        "platinum": 2,
        "gold": 6,
        "silver": 12,
        "bronze": 24,
    }
    # Weighted mix to mimic realistic queue aging:
    # mostly within SLA, some near threshold, fewer breached.
    age_multipliers = [0.35, 0.55, 0.75, 0.9, 1.05, 1.2, 1.45, 1.8]
    age_weights = [0.14, 0.2, 0.2, 0.17, 0.12, 0.09, 0.05, 0.03]

    for i in range(1, 31):
        name = random.choice(NAMES)
        email = f"{name.split()[0].lower()}.{name.split()[1].lower()}{random.randint(1,99)}@{random.choice(DOMAINS)}"
        phone = f"{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
        sla_tier = random.choice(SLA_TIERS)
        multiplier = random.choices(age_multipliers, weights=age_weights, k=1)[0]
        age_hours = max(0.5, sla_base_hours[sla_tier] * multiplier)
        created_dt = now - timedelta(hours=age_hours, minutes=random.randint(0, 59))
        progress_window = max(0.25, min(age_hours * 0.5, 6))
        updated_dt = created_dt + timedelta(hours=random.uniform(0, progress_window))

        escalation_status = "none"
        escalation_target = None
        escalation_reason = None
        escalation_requested_by = None
        escalation_requested_at = None
        escalation_resolved_by = None
        escalation_resolved_at = None

        roll = random.random()
        if roll < 0.12:
            escalation_status = "requested"
            escalation_target = random.choice(["engineering_on_call", "billing_ops", "identity_platform"])
            escalation_reason = random.choice([
                "Customer reports repeated impact and requests urgent engineering review.",
                "SLA breach risk rising with no mitigation available to support.",
                "Issue appears platform-side and needs specialist ownership.",
            ])
            escalation_requested_by = random.choice(["sage", "dana"])
            escalation_requested_at = (updated_dt + timedelta(minutes=15)).isoformat() + "Z"
        elif roll < 0.17:
            escalation_status = "approved"
            escalation_target = random.choice(["engineering_on_call", "billing_ops", "identity_platform"])
            escalation_reason = "Escalation approved after triage confirmation and customer impact validation."
            escalation_requested_by = random.choice(["sage", "dana"])
            escalation_requested_at = (updated_dt + timedelta(minutes=10)).isoformat() + "Z"
            escalation_resolved_by = "dana"
            escalation_resolved_at = (updated_dt + timedelta(minutes=40)).isoformat() + "Z"
        elif roll < 0.2:
            escalation_status = "rejected"
            escalation_target = "engineering_on_call"
            escalation_reason = "Escalation rejected; issue routed to standard support workflow after review."
            escalation_requested_by = random.choice(["sage", "dana"])
            escalation_requested_at = (updated_dt + timedelta(minutes=5)).isoformat() + "Z"
            escalation_resolved_by = "dana"
            escalation_resolved_at = (updated_dt + timedelta(minutes=30)).isoformat() + "Z"

        sla_state = "active"
        sla_pause_reason = None
        sla_paused_at = None
        sla_paused_by = None
        sla_resumed_at = None
        sla_resumed_by = None
        sla_pause_total_seconds = 0.0
        sla_met_at = None
        sla_met_by = None

        sla_roll = random.random()
        if sla_roll < 0.1:
            sla_state = "paused"
            sla_pause_reason = random.choice([
                "Waiting on third-party vendor response.",
                "Pending customer confirmation for compliance checks.",
                "Dependent on external payment processor investigation.",
            ])
            sla_paused_at = (updated_dt + timedelta(minutes=20)).isoformat() + "Z"
            sla_paused_by = "dana"
            sla_pause_total_seconds = float(random.randint(900, 5400))
        elif sla_roll < 0.25:
            sla_state = "met"
            sla_met_at = (updated_dt + timedelta(minutes=10)).isoformat() + "Z"
            sla_met_by = random.choice(["sage", "dana"])
            sla_pause_total_seconds = float(random.randint(0, 1800))

        rows.append((
            i, name, email, phone,
            sla_tier,
            random.randint(10, 100),
            random.choice(DESCRIPTIONS),
            random.choice(INTERNAL_NOTES),
            created_dt.isoformat() + "Z",
            updated_dt.isoformat() + "Z",
            escalation_status,
            escalation_target,
            escalation_reason,
            escalation_requested_by,
            escalation_requested_at,
            escalation_resolved_by,
            escalation_resolved_at,
            sla_state,
            sla_pause_reason,
            sla_paused_at,
            sla_paused_by,
            sla_resumed_at,
            sla_resumed_by,
            sla_pause_total_seconds,
            sla_met_at,
            sla_met_by,
        ))
    conn.executemany(
        "INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_support()
    print("support.db seeded.")
