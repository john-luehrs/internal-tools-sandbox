"""
Onboarding Workflow Automation Tool — Tool 3
Tracks 14-step onboarding across HR, IT, and Security with approval gates.
"""
import os
import sqlite3
import streamlit as st
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

from services.audit_logger import log_action
from services.rbac import require_role

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "../../db/onboarding.db")
ROLES = ["hr_admin", "it_admin", "support_manager"]

ONBOARDING_STEPS = [
    {"step": 1, "name": "Create employee record", "owner": "hr_admin"},
    {"step": 2, "name": "Send offer letter", "owner": "hr_admin"},
    {"step": 3, "name": "Collect signed documents", "owner": "hr_admin"},
    {"step": 4, "name": "Manager approval", "owner": "support_manager"},  # Spec Update 1
    {"step": 5, "name": "Provision laptop", "owner": "it_admin"},
    {"step": 6, "name": "Create Active Directory account", "owner": "it_admin"},
    {"step": 7, "name": "Configure email", "owner": "it_admin"},
    {"step": 8, "name": "Assign software licenses", "owner": "it_admin"},
    {"step": 9, "name": "VPN access setup", "owner": "it_admin"},
    {"step": 10, "name": "Security onboarding briefing", "owner": "it_admin"},
    {"step": 11, "name": "Security training assigned", "owner": "hr_admin"},
    {"step": 12, "name": "Security training completed", "owner": "hr_admin"},  # Spec Update 2
    {"step": 13, "name": "Badge access provisioned", "owner": "it_admin"},
    {"step": 14, "name": "Onboarding complete — manager sign-off", "owner": "support_manager"},
]


def load_employees() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM employees", conn)
    conn.close()
    return df


def load_progress(employee_id: int) -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        "SELECT * FROM onboarding_progress WHERE employee_id = ?", conn, params=(employee_id,)
    )
    conn.close()
    return df


def update_step(employee_id: int, step: int, status: str, actor: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """INSERT OR REPLACE INTO onboarding_progress (employee_id, step, status, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (employee_id, step, status, actor, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()
    log_action(actor=actor, action=f"step_{step}_{status}", entity_id=employee_id)


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(page_title="Onboarding Automation", layout="wide")

user = st.session_state.get("user", {"name": "Demo HR", "role": "hr_admin"})
require_role(user["role"], allowed=ROLES)

with st.sidebar:
    selected_role = st.selectbox("Viewing as:", ROLES, index=ROLES.index(user["role"]))
    st.session_state["user"] = {"name": "Demo User", "role": selected_role}
    user = st.session_state["user"]

st.title("Onboarding Workflow Automation")
st.caption("Reduces 14-step manual onboarding from 3.5 days to same-day provisioning.")

employees = load_employees()
if employees.empty:
    st.warning("No employees in database. Run `py scripts/seed_all.py` first.")
    st.stop()

# Mask PII for it_admin
display_cols = ["employee_id", "start_date", "department"]
if user["role"] in ["hr_admin", "support_manager"]:
    display_cols = ["employee_id", "full_name", "email", "start_date", "department"]

selected_emp_id = st.selectbox("Select employee", employees["employee_id"].tolist())
emp = employees[employees["employee_id"] == selected_emp_id].iloc[0]

col1, col2 = st.columns(2)
with col1:
    if user["role"] in ["hr_admin", "support_manager"]:
        st.markdown(f"**Name:** {emp['full_name']}")
        st.markdown(f"**Email:** {emp['email']}")
    else:
        st.markdown(f"**Employee ID:** {emp['employee_id']}")
with col2:
    st.markdown(f"**Department:** {emp['department']}")
    st.markdown(f"**Start Date:** {emp['start_date']}")

st.markdown("---")
st.subheader("Onboarding Progress")

progress = load_progress(selected_emp_id)
progress_map = {row["step"]: row["status"] for _, row in progress.iterrows()} if not progress.empty else {}

completed = sum(1 for s in progress_map.values() if s == "complete")
st.progress(completed / len(ONBOARDING_STEPS), text=f"{completed}/{len(ONBOARDING_STEPS)} steps complete")

for step_def in ONBOARDING_STEPS:
    step_num = step_def["step"]
    owner = step_def["owner"]
    status = progress_map.get(step_num, "pending")
    icon = "✅" if status == "complete" else ("🔄" if status == "in_progress" else "⬜")

    col_a, col_b, col_c = st.columns([0.5, 4, 1.5])
    with col_a:
        st.write(icon)
    with col_b:
        st.write(f"**{step_num}. {step_def['name']}** _(owner: {owner})_")
    with col_c:
        if user["role"] == owner and status != "complete":
            if st.button("Mark Complete", key=f"step_{step_num}"):
                update_step(selected_emp_id, step_num, "complete", user["name"])
                st.rerun()
