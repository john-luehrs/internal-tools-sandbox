"""Seed finance database (customers + invoices)."""
import os
import sqlite3
import random

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/finance.db")

NAMES = ["Acme Corp", "Globex Inc", "Initech LLC", "Umbrella Co", "Initech LLC",
         "Acme Corp", "Wayne Enterprises", "Stark Industries", "Globex Inc", "Pied Piper"]
DOMAINS = ["acmecorp.com", "globex.net", "initech.org", "umbrella.co", "waynecorp.com"]

# Intentional data quality issues
RAW_AMOUNTS = ["1200.00", "$1,450.50", "950", "£820.00", "2,100.75", "invalid",
               "1750.00", "$3,200", "870.25", None, "1,050.00", "$420.99"]

DEFAULT_TIERS = ["enterprise", "mid-market", "smb"]


def _clean_customer_rows(start_id: int, count: int):
    """Generate non-duplicate customers with unique billing emails."""
    rows = []
    for offset in range(count):
        customer_id = start_id + offset
        rows.append((
            customer_id,
            f"CleanCo {offset + 1:02d}",
            f"billing.clean.{offset + 1:02d}@cleanco.example",
            DEFAULT_TIERS[offset % len(DEFAULT_TIERS)],
        ))
    return rows


def _clean_invoice_rows(start_invoice_id: int, customer_ids):
    """Generate valid invoices that should normalize cleanly."""
    rows = []
    for offset, customer_id in enumerate(customer_ids):
        invoice_id = start_invoice_id + offset
        amount_raw = f"{1250 + (offset * 37):.2f}"
        rows.append((
            invoice_id,
            customer_id,
            amount_raw,
            "USD",
            "pending",
            f"2025-{((offset % 12) + 1):02d}-{((offset % 27) + 1):02d}",
        ))
    return rows


def seed_finance():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS customers")
    conn.execute("DROP TABLE IF EXISTS invoices")
    conn.execute("""
        CREATE TABLE customers (
            customer_id INTEGER PRIMARY KEY,
            company_name TEXT,
            email TEXT,
            account_tier TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE invoices (
            invoice_id INTEGER PRIMARY KEY,
            customer_id INTEGER,
            amount_raw TEXT,
            currency TEXT,
            status TEXT,
            due_date TEXT
        )
    """)
    # Customers — with intentional duplicates for detection behavior
    customers = []
    for i in range(1, 16):
        name = random.choice(NAMES)
        domain = random.choice(DOMAINS)
        email = f"billing@{domain}"
        # Inject duplicates: some share the same email
        customers.append((i, name, email, random.choice(DEFAULT_TIERS)))

    # Add clean non-duplicate customers so demo includes non-flagged records.
    clean_customers = _clean_customer_rows(start_id=16, count=20)
    customers.extend(clean_customers)
    conn.executemany("INSERT INTO customers VALUES (?, ?, ?, ?)", customers)

    # Invoices — intentional data quality issues
    invoices = []
    for i in range(1, 26):
        invoices.append((
            i,
            random.randint(1, 15),
            random.choice(RAW_AMOUNTS),
            random.choice(["USD", "GBP", "EUR"]),
            random.choice(["paid", "pending", "overdue"]),
            f"2025-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
        ))

    # Add clean invoices mapped to clean customers.
    clean_customer_ids = [row[0] for row in clean_customers]
    invoices.extend(_clean_invoice_rows(start_invoice_id=26, customer_ids=clean_customer_ids))

    conn.executemany("INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?)", invoices)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_finance()
    print("finance.db seeded.")
