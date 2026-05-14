"""
Slack Productivity Bot — Streamlit UI
Simulates a Slack-like chat interface for the productivity bot.
"""
import streamlit as st
from app.slack_bot.app import handle_command

st.set_page_config(page_title="Slack Bot Simulator", layout="centered")
st.title("Slack Productivity Bot")
st.caption("Simulates an engineering Slack bot. Try `/runbook deploy`, `/deploy-status`, or ask a question.")

if "messages" not in st.session_state:
    st.session_state["messages"] = [
        {"role": "bot", "text": "Hi! I'm your internal productivity bot. Try `/help` to get started."}
    ]

for msg in st.session_state["messages"]:
    with st.chat_message("user" if msg["role"] == "user" else "assistant"):
        st.markdown(msg["text"])

if prompt := st.chat_input("Type a command or question..."):
    st.session_state["messages"].append({"role": "user", "text": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    response = handle_command(prompt)
    st.session_state["messages"].append({"role": "bot", "text": response})
    with st.chat_message("assistant"):
        st.markdown(response)
