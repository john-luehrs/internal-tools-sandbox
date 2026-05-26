"""Seed finance database (customers + invoices)."""
from pathlib import Path
import random
import sqlite3

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "finance.db"

DEFAULT_TIERS = ["enterprise", "mid-market", "smb"]
INVOICE_CURRENCIES = ["USD", "GBP", "EUR"]
INVOICE_STATUSES = ["paid", "pending", "overdue"]
INVOICE_AUTHORS = [
    "ava.johnson",
    "liam.carter",
    "maya.patel",
    "noah.kim",
    "zoe.hughes",
]


def _clean_customer_rows(start_id: int, count: int) -> list[tuple[int, str, str, str]]:
    """Generate non-duplicate customers with unique billing emails."""
    rows: list[tuple[int, str, str, str]] = []
    for offset in range(count):
        customer_id = start_id + offset
        rows.append((
            customer_id,
            f"Clearwater Systems {offset + 1:02d}",
            f"billing.clearwater.{offset + 1:02d}@clearwater.example",
            DEFAULT_TIERS[offset % len(DEFAULT_TIERS)],
        ))
    return rows


def _duplicate_customer_rows(start_id: int) -> list[tuple[int, str, str, str]]:
    """Generate realistic duplicate scenarios.

    Distribution in this block:
    - 2 true-merge pairs (exact same company + tier + email)
    - 4 ambiguous pairs (same billing inbox but org attributes vary)
    - 1 same-company/same-tier pair with different billing emails
    """
    rows = [
        # True merges
        (start_id, "Northstar Labs", "billing@northstarlabs.com", "smb"),
        (start_id + 1, "Northstar Labs", "billing@northstarlabs.com", "smb"),
        (start_id + 2, "Harbor Logistics", "ar@harborlogistics.com", "mid-market"),
        (start_id + 3, "Harbor Logistics", "ar@harborlogistics.com", "mid-market"),
        # Ambiguous duplicate candidates
        (start_id + 4, "Acme Corp", "billing@acmecorp.com", "enterprise"),
        (start_id + 5, "Acme Corporation", "billing@acmecorp.com", "enterprise"),
        (start_id + 6, "Globex Inc", "finance@globex.com", "smb"),
        (start_id + 7, "Globex UK Ltd", "finance@globex.com", "enterprise"),
        (start_id + 8, "Orion Holdings", "billing@orionholdings.com", "mid-market"),
        (start_id + 9, "Orion Health", "billing@orionholdings.com", "mid-market"),
        (start_id + 10, "Redwood Group LLC", "ap@redwoodgroup.com", "mid-market"),
        (start_id + 11, "Redwood Consulting", "ap@redwoodgroup.com", "mid-market"),
        # Same company + same tier, but different billing emails
        (start_id + 12, "Pioneer Manufacturing", "billing@pioneermfg.com", "mid-market"),
        (start_id + 13, "Pioneer Manufacturing", "ap@pioneermfg.com", "mid-market"),
    ]
    return rows


def _invoice_rows_for_customers(customer_ids: list[int], start_invoice_id: int) -> list[tuple[int, int, str | None, str, str, str, str]]:
    """Generate mostly clean invoices with a small, realistic exception set."""
    rng = random.Random(17)
    rows: list[tuple[int, int, str | None, str, str, str, str]] = []
    invoice_id = start_invoice_id

    for index, customer_id in enumerate(customer_ids):
        amount = 900 + (index * 43)
        amount_raw = f"{amount:.2f}" if index % 3 else f"${amount:,.2f}"
        rows.append((
            invoice_id,
            customer_id,
            amount_raw,
            rng.choice(INVOICE_CURRENCIES),
            rng.choice(INVOICE_STATUSES),
            f"2025-{((index % 12) + 1):02d}-{((index % 27) + 1):02d}",
            INVOICE_AUTHORS[index % len(INVOICE_AUTHORS)],
        ))
        invoice_id += 1

    # Explicit exception set for review queue coverage.
    exceptions = ["invalid", "N/A", None, ""]
    for offset, raw_amount in enumerate(exceptions):
        rows.append((
            invoice_id + offset,
            customer_ids[offset % len(customer_ids)],
            raw_amount,
            "USD",
            "pending",
            f"2025-12-{(offset + 1):02d}",
            INVOICE_AUTHORS[(offset + 1) % len(INVOICE_AUTHORS)],
        ))

    return rows


def seed_finance() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS customers")
    conn.execute("DROP TABLE IF EXISTS invoices")
    conn.execute(
        """
        CREATE TABLE customers (
            customer_id INTEGER PRIMARY KEY,
            company_name TEXT,
            email TEXT,
            account_tier TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE invoices (
            invoice_id INTEGER PRIMARY KEY,
            customer_id INTEGER,
            amount_raw TEXT,
            currency TEXT,
            status TEXT,
            due_date TEXT,
            created_by TEXT
        )
        """
    )

    clean_customers = _clean_customer_rows(start_id=1, count=28)
    duplicate_customers = _duplicate_customer_rows(start_id=29)
    customers = clean_customers + duplicate_customers

    invoice_customer_ids = [row[0] for row in customers]
    invoices = _invoice_rows_for_customers(invoice_customer_ids, start_invoice_id=1)

    conn.executemany("INSERT INTO customers VALUES (?, ?, ?, ?)", customers)
    conn.executemany("INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?, ?)", invoices)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_finance()
    print("finance.db seeded with realistic profile (clean + ambiguous + true-merge).")
