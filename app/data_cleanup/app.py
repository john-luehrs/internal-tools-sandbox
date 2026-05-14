"""
Internal Data Cleanup Tool — Tool 5
Detects duplicate customer records and normalizes invoice data for Finance/Ops.
"""
import os
import sqlite3
import re
import streamlit as st
import pandas as pd
from dotenv import load_dotenv

from services.rbac import require_role
from services.audit_logger import log_action

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "../../db/finance.db")
ROLES = ["ops_engineer", "support_manager"]


def load_customers() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM customers", conn)
    conn.close()
    return df


def load_invoices() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM invoices", conn)
    conn.close()
    return df


def find_duplicate_customers(df: pd.DataFrame) -> pd.DataFrame:
    """Detect duplicates by normalized email."""
    df = df.copy()
    df["_norm_email"] = df["email"].str.lower().str.strip()
    dupes = df[df.duplicated(subset=["_norm_email"], keep=False)].copy()
    return dupes.drop(columns=["_norm_email"])


def normalize_invoice_amount(val) -> float | None:
    """Strip currency symbols, commas. Returns float or None."""
    if pd.isna(val):
        return None
    cleaned = re.sub(r"[^\d.]", "", str(val))
    try:
        return float(cleaned)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(page_title="Data Cleanup Tool", layout="wide")

user = st.session_state.get("user", {"name": "Demo Ops", "role": "ops_engineer"})
require_role(user["role"], allowed=ROLES)

st.title("Internal Data Cleanup Tool")
st.caption("Detects duplicate customer records and normalizes invoice data for Finance/Ops reporting.")

tab1, tab2 = st.tabs(["Duplicate Customers", "Invoice Normalization"])

# ---------------------------------------------------------------------------
# Tab 1: Duplicate detection (Spec Update 1)
# ---------------------------------------------------------------------------
with tab1:
    customers = load_customers()

    # Mask PII in display
    display = customers.copy()
    display["email"] = display["email"].apply(lambda e: e[:3] + "***" if pd.notna(e) else e)

    st.subheader(f"Customer Records ({len(customers)})")
    st.dataframe(display, use_container_width=True)

    if st.button("Find Duplicate Records"):
        dupes = find_duplicate_customers(customers)
        if not dupes.empty:
            st.warning(f"Found {len(dupes)} records with duplicate emails.")
            dupes_display = dupes.copy()
            dupes_display["email"] = dupes_display["email"].apply(lambda e: e[:3] + "***")
            st.dataframe(dupes_display, use_container_width=True)
            if st.button("Mark duplicates for review"):
                log_action(actor=user["name"], action="flagged_duplicates", entity_id="customer_batch")
                st.success("Duplicates flagged in audit log. Review queue updated.")
        else:
            st.success("No duplicates found.")

# ---------------------------------------------------------------------------
# Tab 2: Invoice normalization (Spec Update 2)
# ---------------------------------------------------------------------------
with tab2:
    invoices = load_invoices()
    st.subheader(f"Invoices ({len(invoices)})")
    st.dataframe(invoices, use_container_width=True)

    if st.button("Normalize Invoice Amounts"):
        invoices["amount_normalized"] = invoices["amount_raw"].apply(normalize_invoice_amount)
        bad = invoices[invoices["amount_normalized"].isna() & invoices["amount_raw"].notna()]
        st.subheader("Normalization Results")
        st.success(f"Normalized {invoices['amount_normalized'].notna().sum()} records.")
        if not bad.empty:
            st.warning(f"{len(bad)} records could not be parsed:")
            st.dataframe(bad[["invoice_id", "amount_raw"]])
        st.dataframe(invoices[["invoice_id", "amount_raw", "amount_normalized"]], use_container_width=True)
        log_action(actor=user["name"], action="invoice_normalization", entity_id="invoice_batch")
