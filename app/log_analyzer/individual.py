"""
Individual Log Dashboard — Tool 4b
Personal view for ops engineers to see logs assigned to them.
"""
import os
import sqlite3
import streamlit as st
import pandas as pd
from dotenv import load_dotenv

from services.ai_client import explain_anomaly
from services.pii_scrubber import redact_sensitive
from services.audit_logger import log_action

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "../../db/logs.db")
OPS_TEAM = ["alice", "bob", "carol", "david"]
ANOMALY_THRESHOLD = 75


def load_assigned_logs(engineer: str) -> pd.DataFrame:
    """Load logs assigned to this engineer."""
    conn = sqlite3.connect(DB_PATH)
    query = """
        SELECT * FROM logs
        WHERE assigned_to = ?
        ORDER BY anomaly_score DESC, timestamp DESC
    """
    df = pd.read_sql_query(query, conn, params=(engineer,))
    conn.close()
    return df


def update_log_status(log_id: int, status: str, engineer: str):
    """Update log status and log the action."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE logs SET status = ? WHERE log_id = ?", (status, log_id))
    conn.commit()
    conn.close()
    log_action(actor=engineer, action="log_status_update", entity_id=log_id, metadata={"status": status})


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(page_title="My Logs Dashboard", layout="wide")

# Engineer selector (demo mode)
if "engineer" not in st.session_state:
    st.session_state["engineer"] = "alice"

with st.sidebar:
    st.header("Your Profile")
    selected_engineer = st.selectbox("You are:", OPS_TEAM, index=OPS_TEAM.index(st.session_state["engineer"]))
    if selected_engineer != st.session_state["engineer"]:
        st.session_state["engineer"] = selected_engineer
        st.rerun()

engineer = st.session_state["engineer"]
df = load_assigned_logs(engineer)

st.title(f"📋 My Logs — {engineer}")
st.caption(f"You have {len(df)} assigned log(s). Focus on the highest anomaly scores first.")

# Summary stats
if not df.empty:
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        resolved = len(df[df["status"] == "resolved"])
        st.metric("Resolved", resolved)
    with col2:
        in_review = len(df[df["status"] == "in_review"])
        st.metric("In Review", in_review)
    with col3:
        unreviewed = len(df[df["status"] == "unreviewed"])
        st.metric("Unreviewed", unreviewed)
    with col4:
        avg_anomaly = df["anomaly_score"].mean()
        st.metric("Avg Anomaly", f"{avg_anomaly:.0f}")

# Log list
st.subheader("Your Assigned Logs")

if df.empty:
    st.info("Great! You have no assigned logs right now.")
else:
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

    display_cols = ["log_id", "timestamp", "service", "level", "message", "anomaly_score", "status"]
    styled = df[display_cols].style \
        .applymap(style_anomaly, subset=["anomaly_score"]) \
        .applymap(style_level, subset=["level"]) \
        .applymap(style_status, subset=["status"])
    st.dataframe(styled, use_container_width=True, key="log_table")

    # Detail view
    st.subheader("Log Details")
    selected_id = st.selectbox("Select log to review", df["log_id"].tolist())
    log_row = df[df["log_id"] == selected_id].iloc[0]

    col_left, col_right = st.columns([2, 1])
    with col_left:
        st.markdown(f"**Timestamp:** {log_row['timestamp']}")
        st.markdown(f"**Service:** `{log_row['service']}`")
        st.markdown(f"**Level:** {log_row['level']}")
        st.markdown(f"**Message:**")
        st.code(log_row["message"])
    with col_right:
        st.markdown(f"**Anomaly Score:** {log_row['anomaly_score']}")
        st.markdown(f"**Current Status:** {log_row['status']}")

    # Status update
    st.markdown("---")
    col_a, col_b = st.columns([3, 1])
    with col_a:
        new_status = st.radio(
            "Update status:",
            ["unreviewed", "in_review", "resolved"],
            index=["unreviewed", "in_review", "resolved"].index(log_row["status"]),
            horizontal=True,
        )
    with col_b:
        if st.button("Save Status", use_container_width=True):
            update_log_status(selected_id, new_status, engineer)
            st.success(f"Log {selected_id} marked as {new_status}!")
            st.rerun()

    # AI explanation
    st.markdown("---")
    st.subheader("AI Insight")
    if log_row["anomaly_score"] > ANOMALY_THRESHOLD:
        if st.button("Get AI Explanation"):
            with st.spinner("Analyzing..."):
                text = redact_sensitive(log_row["message"])
                explanation = explain_anomaly(text, score=log_row["anomaly_score"])
            st.warning(explanation)
    else:
        st.info("No AI analysis needed for low-anomaly logs.")
