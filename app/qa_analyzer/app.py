"""
QA Defect Pattern Analyzer — Tool 2
AI-powered defect clustering, heatmaps, and duplicate detection.
"""
import os
import sqlite3
import streamlit as st
import pandas as pd
from dotenv import load_dotenv

from services.ai_client import cluster_defects, find_duplicates
from services.rbac import require_role

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "../../db/qa.db")
ROLES = ["qa_engineer", "support_manager"]


def load_defects() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM defects", conn)
    conn.close()
    return df


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(page_title="QA Defect Analyzer", layout="wide")

user = st.session_state.get("user", {"name": "Demo", "role": "qa_engineer"})
require_role(user["role"], allowed=ROLES)

st.title("QA Defect Pattern Analyzer")
st.caption("Identifies recurring patterns across sprints. Reduces root-cause analysis from 10-12hrs to < 1hr.")

df = load_defects()

# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
col1, col2 = st.columns(2)
with col1:
    sprints = st.multiselect("Sprint", options=sorted(df["sprint"].unique()), default=list(df["sprint"].unique()))
with col2:
    severities = st.multiselect("Severity", options=df["severity"].unique(), default=list(df["severity"].unique()))

filtered = df[df["sprint"].isin(sprints) & df["severity"].isin(severities)]

# ---------------------------------------------------------------------------
# Heatmap: defects by component (Spec Update 1)
# ---------------------------------------------------------------------------
st.subheader("Component Heatmap")
heatmap_data = filtered.groupby(["component", "severity"]).size().unstack(fill_value=0)
st.dataframe(heatmap_data.style.background_gradient(cmap="YlOrRd"), use_container_width=True)

# ---------------------------------------------------------------------------
# Severity distribution (Spec Update 1)
# ---------------------------------------------------------------------------
st.subheader("Severity Distribution")
sev_counts = filtered["severity"].value_counts()
st.bar_chart(sev_counts)

# ---------------------------------------------------------------------------
# AI Cluster analysis
# ---------------------------------------------------------------------------
st.subheader("AI Pattern Clustering")
if st.button("Cluster Defects by Pattern"):
    descriptions = filtered["description"].tolist()
    with st.spinner("Clustering..."):
        clusters = cluster_defects(descriptions)
    for i, cluster in enumerate(clusters, 1):
        with st.expander(f"Cluster {i} — {len(cluster['defects'])} defects"):
            st.markdown(f"**Pattern:** {cluster['pattern']}")
            for d in cluster["defects"]:
                st.markdown(f"- {d}")

# ---------------------------------------------------------------------------
# Duplicate detection (Spec Update 2)
# ---------------------------------------------------------------------------
st.subheader("Duplicate Detection")
if st.button("Find Duplicate Defects"):
    with st.spinner("Analyzing similarity..."):
        duplicates = find_duplicates(filtered[["defect_id", "description"]].to_dict("records"))
    if duplicates:
        for group in duplicates:
            with st.expander(f"Duplicate Group ({len(group)} defects)"):
                for item in group:
                    st.markdown(f"- **#{item['defect_id']}**: {item['description']}")
                if st.button(f"Merge group", key=f"merge_{group[0]['defect_id']}"):
                    st.success("Merge workflow triggered (stub — connect to your issue tracker).")
    else:
        st.info("No significant duplicates found.")

# ---------------------------------------------------------------------------
# Raw data
# ---------------------------------------------------------------------------
with st.expander("Raw Defect Data"):
    st.dataframe(filtered, use_container_width=True)
