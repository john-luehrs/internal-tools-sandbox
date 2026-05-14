"""
GitHub Actions Automation Tool — Tool 7
Manages and triggers simulated CI/CD workflows with caching and Slack notifications.
"""
import os
import json
import sqlite3
import streamlit as st
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

from services.audit_logger import log_action
from services.rbac import require_role

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "../../db/ci.db")
ROLES = ["ops_engineer", "qa_engineer", "it_admin"]

WORKFLOW_DEFINITIONS = [
    {"id": "lint", "name": "Lint Check", "description": "Runs ESLint/flake8 across all services"},
    {"id": "test", "name": "Run Tests", "description": "Unit + integration test suite"},
    {"id": "build", "name": "Build & Package", "description": "Builds Docker images, caches layers"},
    {"id": "deploy-staging", "name": "Deploy to Staging", "description": "Deploys to staging environment"},
    {"id": "deploy-prod", "name": "Deploy to Production", "description": "Deploys to production (requires approval)"},
]


def load_run_history() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT 100", conn)
    conn.close()
    return df


def trigger_workflow(workflow_id: str, triggered_by: str) -> dict:
    """Simulate triggering a GitHub Actions workflow."""
    run_id = f"run_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    statuses = ["success", "success", "success", "failure", "in_progress"]
    import random
    status = random.choice(statuses)
    duration = random.randint(45, 420)

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """INSERT INTO workflow_runs (run_id, workflow_id, status, triggered_by, started_at, duration_seconds, cache_hit)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (run_id, workflow_id, status, triggered_by, datetime.utcnow().isoformat(), duration, random.choice([0, 1])),
    )
    conn.commit()
    conn.close()

    log_action(actor=triggered_by, action=f"triggered_{workflow_id}", entity_id=run_id)

    # Spec Update 2: Slack notification (simulated)
    slack_notify(workflow_id=workflow_id, run_id=run_id, status=status, actor=triggered_by)

    return {"run_id": run_id, "status": status, "duration": duration}


def slack_notify(workflow_id: str, run_id: str, status: str, actor: str):
    """Simulate sending a Slack notification."""
    icon = {"success": "✅", "failure": "❌", "in_progress": "🔄"}.get(status, "ℹ️")
    message = f"{icon} Workflow `{workflow_id}` | Run `{run_id}` | Status: **{status}** | Triggered by: {actor}"
    if "slack_notifications" not in st.session_state:
        st.session_state["slack_notifications"] = []
    st.session_state["slack_notifications"].append(message)


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(page_title="GitHub Actions Automation", layout="wide")

user = st.session_state.get("user", {"name": "Demo Ops", "role": "ops_engineer"})
require_role(user["role"], allowed=ROLES)

st.title("GitHub Actions Automation Tool")
st.caption("Trigger and monitor CI/CD workflows. Replaces repetitive manual script runs.")

# Slack notification feed (Spec Update 2)
if st.session_state.get("slack_notifications"):
    with st.expander("Slack Notifications", expanded=True):
        for note in reversed(st.session_state["slack_notifications"][-10:]):
            st.markdown(note)

# Workflow triggers
st.subheader("Workflows")
cols = st.columns(len(WORKFLOW_DEFINITIONS))
for i, wf in enumerate(WORKFLOW_DEFINITIONS):
    with cols[i]:
        st.markdown(f"**{wf['name']}**")
        st.caption(wf["description"])
        if wf["id"] == "deploy-prod":
            confirm = st.checkbox("Confirm prod deploy", key=f"confirm_{wf['id']}")
            disabled = not confirm
        else:
            disabled = False
        if st.button("Trigger", key=f"trigger_{wf['id']}", disabled=disabled):
            with st.spinner(f"Triggering {wf['name']}..."):
                result = trigger_workflow(wf["id"], triggered_by=user["name"])
            status_icon = "✅" if result["status"] == "success" else ("❌" if result["status"] == "failure" else "🔄")
            st.markdown(f"{status_icon} {result['status']} ({result['duration']}s)")
            st.rerun()

# Run history
st.subheader("Run History")
history = load_run_history()
if not history.empty:
    def style_status(val):
        colors = {"success": "#d4edda", "failure": "#f8d7da", "in_progress": "#fff3cd"}
        return f"background-color: {colors.get(val, '')};"

    styled = history[["run_id", "workflow_id", "status", "triggered_by", "started_at", "duration_seconds", "cache_hit"]].style \
        .applymap(style_status, subset=["status"])
    st.dataframe(styled, use_container_width=True)
else:
    st.info("No runs yet. Trigger a workflow above.")
