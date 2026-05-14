"""
RBAC enforcement — raise if user's role is not in the allowed list.
"""
import streamlit as st


def require_role(role: str, allowed: list[str]):
    """Call at the top of each Streamlit app to enforce role restrictions."""
    if role not in allowed:
        st.error(f"Access denied. This tool requires one of: {', '.join(allowed)}. Your role: {role}")
        st.stop()


def can_access(role: str, allowed: list[str]) -> bool:
    return role in allowed
