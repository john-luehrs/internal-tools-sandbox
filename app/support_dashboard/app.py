"""
Support Ticket Triage Dashboard
Tool 1 — Internal Tools Engineering Sandbox

Business friction: 6-hour manual triage per ticket.
Solution: Unified dashboard with AI-assisted summarization, PII scrubbing, RBAC.
Impact: Triage time < 1 hour, SLA breaches ↓, CSAT ↑.
"""
import os
import json
import sqlite3
import streamlit as st
import pandas as pd
from dotenv import load_dotenv

from services.ai_client import get_ai_summary
from services.pii_scrubber import scrub_pii
from services.audit_logger import log_ai_call
from services.rbac import require_role

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "../../db/support.db")

# ---------------------------------------------------------------------------
# Auth (simulated)
# ---------------------------------------------------------------------------
ROLES = ["support_agent", "support_manager"]

def get_current_user() -> dict:
    """Simulates session-based auth. In a real app, replace with JWT/OAuth."""
    if "user" not in st.session_state:
        st.session_state["user"] = {"name": "Demo User", "role": "support_agent"}
    return st.session_state["user"]


# ---------------------------------------------------------------------------
# Data layer
# ---------------------------------------------------------------------------
def load_tickets(role: str) -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM tickets", conn)
    conn.close()

    # PII masking for support_agent role
    if role == "support_agent":
        df["email"] = df["email"].apply(lambda e: e[:2] + "***@***" if pd.notna(e) else e)
        df["phone"] = "***-***-****"
        df["internal_notes"] = "[RESTRICTED]"

    return df


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(page_title="Ticket Triage Dashboard", layout="wide")

user = get_current_user()
require_role(user["role"], allowed=ROLES)

# Sidebar: role switcher (demo only)
with st.sidebar:
    st.header("Demo Controls")
    selected_role = st.selectbox("Viewing as:", ROLES, index=ROLES.index(user["role"]))
    if selected_role != user["role"]:
        st.session_state["user"]["role"] = selected_role
        st.rerun()
    st.markdown("---")
    st.caption(f"User: **{user['name']}** | Role: **{user['role']}**")

st.title("Support Ticket Triage Dashboard")
st.caption("Reduces manual triage time from 6 hours to < 1 hour.")

# Load data
df = load_tickets(user["role"])

# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
col1, col2, col3 = st.columns(3)
with col1:
    sla_filter = st.multiselect("SLA Tier", options=df["sla_tier"].unique(), default=list(df["sla_tier"].unique()))
with col2:
    search = st.text_input("Search description", "")
with col3:
    high_risk_only = st.checkbox("High-risk only (score > 80)")

filtered = df[df["sla_tier"].isin(sla_filter)]
if search:
    filtered = filtered[filtered["description"].str.contains(search, case=False, na=False)]
if high_risk_only:
    filtered = filtered[filtered["risk_score"] > 80]

# ---------------------------------------------------------------------------
# Ticket table
# ---------------------------------------------------------------------------
st.subheader(f"Tickets ({len(filtered)})")

def style_risk(val):
    if isinstance(val, (int, float)) and val > 80:
        return "background-color: #ffe5e5; color: #c0392b; font-weight: bold;"
    return ""

styled = filtered[["ticket_id", "customer_name", "sla_tier", "risk_score", "description"]].style.applymap(
    style_risk, subset=["risk_score"]
)
st.dataframe(styled, use_container_width=True)

# ---------------------------------------------------------------------------
# Ticket detail + AI summary
# ---------------------------------------------------------------------------
st.subheader("Ticket Detail")
ticket_ids = filtered["ticket_id"].tolist()
if ticket_ids:
    selected_id = st.selectbox("Select ticket", ticket_ids)
    ticket = filtered[filtered["ticket_id"] == selected_id].iloc[0]

    col_a, col_b = st.columns(2)
    with col_a:
        st.markdown(f"**Customer:** {ticket['customer_name']}")
        st.markdown(f"**Email:** {ticket['email']}")
        st.markdown(f"**Phone:** {ticket['phone']}")
        st.markdown(f"**SLA Tier:** {ticket['sla_tier']}")
        st.markdown(f"**Risk Score:** {ticket['risk_score']}")
    with col_b:
        st.markdown(f"**Description:**")
        st.info(ticket["description"])
        if user["role"] == "support_manager":
            st.markdown(f"**Internal Notes:**")
            st.warning(ticket["internal_notes"])

    # AI Summary
    st.markdown("---")
    st.subheader("AI Summary")
    safe_mode = st.toggle("Safe mode (scrub PII before AI)", value=True)

    if st.button("Generate AI Summary"):
        text = ticket["description"]
        if safe_mode:
            text = scrub_pii(text)
            st.caption("PII scrubbed before sending to AI.")
        with st.spinner("Generating summary..."):
            summary = get_ai_summary(text, context=f"SLA: {ticket['sla_tier']}, Risk: {ticket['risk_score']}")
            log_ai_call(user=user["name"], ticket_id=selected_id, safe_mode=safe_mode)
        st.success(summary)

        if ticket["risk_score"] > 80:
            st.markdown("**Why is this customer high risk?**")
            risk_explanation = get_ai_summary(
                scrub_pii(text) if safe_mode else text,
                context=f"Risk score: {ticket['risk_score']}. Explain why this customer may be high risk."
            )
            st.warning(risk_explanation)
else:
    st.info("No tickets match the current filters.")
