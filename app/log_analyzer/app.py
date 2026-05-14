"""
AI-Assisted Log Analyzer — Tool 4
Reduces 6-8hr/week manual log scanning with anomaly detection and safe AI summaries.
"""
import os
import sqlite3
import streamlit as st
import pandas as pd
from dotenv import load_dotenv

from services.ai_client import summarize_logs, explain_anomaly
from services.pii_scrubber import redact_sensitive
from services.audit_logger import log_ai_call

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "../../db/logs.db")
ROLES = ["ops_engineer", "it_admin", "support_manager"]

ANOMALY_THRESHOLD = 75  # scores above this are flagged


def load_logs(filters: dict) -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    query = "SELECT * FROM logs WHERE 1=1"
    params = []
    if filters.get("level"):
        placeholders = ",".join("?" * len(filters["level"]))
        query += f" AND level IN ({placeholders})"
        params.extend(filters["level"])
    if filters.get("service"):
        query += " AND service = ?"
        params.append(filters["service"])
    query += " ORDER BY timestamp DESC LIMIT 500"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    return df


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(page_title="Log Analyzer — Team Dashboard", layout="wide")

user = st.session_state.get("user", {"name": "Demo Ops", "role": "ops_engineer"})

st.title("🚨 Log Analyzer — Team Dashboard")
st.caption("Team-wide anomaly detection and assignment. Target: MTTD < 10 min.")

# Role switcher (demo)
with st.sidebar:
    st.header("Demo Controls")
    roles = ["ops_engineer", "it_admin", "support_manager"]
    selected_role = st.selectbox("Viewing as:", roles, index=roles.index(user["role"]))
    if selected_role != user["role"]:
        st.session_state["user"] = {"name": "Demo User", "role": selected_role}
        st.rerun()

# Filters
st.subheader("Filters")
col1, col2, col3, col4 = st.columns(4)
with col1:
    level_filter = st.multiselect("Log Level", ["ERROR", "WARN", "INFO", "DEBUG"], default=["ERROR", "WARN"])
with col2:
    conn_tmp = sqlite3.connect(DB_PATH)
    services = pd.read_sql_query("SELECT DISTINCT service FROM logs", conn_tmp)["service"].tolist()
    conn_tmp.close()
    service_filter = st.selectbox("Service", ["All"] + services)
with col3:
    status_filter = st.multiselect("Status", ["unreviewed", "in_review", "resolved"], default=["unreviewed", "in_review"])
with col4:
    anomaly_only = st.checkbox("High anomaly only (score > 75)")

filters = {
    "level": level_filter,
    "service": service_filter if service_filter != "All" else None,
}
df = load_logs(filters)
if anomaly_only:
    df = df[df["anomaly_score"] > ANOMALY_THRESHOLD]
if status_filter:
    df = df[df["status"].isin(status_filter)]

# ---------------------------------------------------------------------------
# Log table with assignment column
# ---------------------------------------------------------------------------
st.subheader(f"Logs ({len(df)}) — {status_filter}")

def style_anomaly(val):
    if isinstance(val, (int, float)) and val > ANOMALY_THRESHOLD:
        return "background-color: #fff3cd; font-weight: bold;"
    return ""

def style_level(val):
    colors = {"ERROR": "#ffe5e5", "WARN": "#fff3cd", "INFO": "", "DEBUG": "#e8f4fd"}
    return f"background-color: {colors.get(val, '')};"  

def style_status(val):
    colors = {"unreviewed": "#ffe5e5", "in_review": "#fff3cd", "resolved": "#d4edda"}
    return f"background-color: {colors.get(val, '')};"  

display_cols = ["log_id", "timestamp", "service", "level", "message", "anomaly_score", "assigned_to", "status"]
styled = df[display_cols].style \
    .applymap(style_anomaly, subset=["anomaly_score"]) \
    .applymap(style_level, subset=["level"]) \
    .applymap(style_status, subset=["status"])

# ---------------------------------------------------------------------------
# AI Log Summary & Anomaly explanation
# ---------------------------------------------------------------------------
st.subheader("AI Log Summary")
safe_mode = st.toggle("Safe mode (redact sensitive fields before AI)", value=True)

if st.button("Generate Summary"):
    log_text = df[["timestamp", "level", "service", "message"]].to_csv(index=False)
    if safe_mode:
        log_text = redact_sensitive(log_text)
        st.caption("Sensitive fields redacted before sending to AI.")
    with st.spinner("Summarizing..."):
        summary = summarize_logs(log_text)
        log_ai_call(user=user["name"], entity_id="log_batch", safe_mode=safe_mode)
    st.info(summary)

def update_log(log_id: int, assigned_to: str = None, status: str = None):
    """Update log assignment and/or status."""
    conn = sqlite3.connect(DB_PATH)
    updates = []
    params = []
    if assigned_to is not None:
        updates.append("assigned_to = ?")
        params.append(assigned_to if assigned_to != "Unassigned" else None)
    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if updates:
        params.append(log_id)
        query = f"UPDATE logs SET {', '.join(updates)} WHERE log_id = ?"
        conn.execute(query, params)
        conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Assignment & status management
# ---------------------------------------------------------------------------
st.subheader("Quick Assign")
if not df.empty:
    col_a, col_b, col_c = st.columns([2, 1, 1])
    with col_a:
        selected_log_id = st.selectbox("Select log", df["log_id"].tolist(), format_func=lambda x: f"Log {x}")
    with col_b:
        new_assignee = st.selectbox("Assign to", ["Unassigned", "alice", "bob", "carol", "david"])
    with col_c:
        new_status = st.selectbox("Status", ["unreviewed", "in_review", "resolved"])
    
    if st.button("Update"):
        update_log(selected_log_id, assigned_to=new_assignee, status=new_status)
        st.success(f"Log {selected_log_id} updated!")
        st.rerun()
st.subheader("Anomaly Details")
anomalies = df[df["anomaly_score"] > ANOMALY_THRESHOLD]
if not anomalies.empty:
    selected_log_id = st.selectbox("Select anomalous log", anomalies["log_id"].tolist())
    log_row = anomalies[anomalies["log_id"] == selected_log_id].iloc[0]
    st.markdown(f"**Message:** `{log_row['message']}`")
    st.markdown(f"**Anomaly Score:** {log_row['anomaly_score']}")
    if st.button("Explain Anomaly"):
        text = redact_sensitive(log_row["message"]) if safe_mode else log_row["message"]
        with st.spinner("Analyzing..."):
            explanation = explain_anomaly(text, score=log_row["anomaly_score"])
        st.warning(explanation)
else:
    st.info("No anomalies in current view.")
