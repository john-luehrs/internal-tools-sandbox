"""
Slack Productivity Bot — Tool 6
Simulates a Slack bot that answers runbook questions and deploy status queries.
Run this as a CLI: py app/slack_bot/app.py
Or use the Streamlit UI: streamlit run app/slack_bot/streamlit_app.py
"""
import os
import json
from dotenv import load_dotenv
from services.ai_client import get_ai_summary

load_dotenv()

RUNBOOKS_PATH = os.path.join(os.path.dirname(__file__), "../../data/runbooks.json")


def load_runbooks() -> list[dict]:
    if not os.path.exists(RUNBOOKS_PATH):
        return []
    with open(RUNBOOKS_PATH) as f:
        return json.load(f)


def search_runbooks(query: str) -> list[dict]:
    runbooks = load_runbooks()
    query_lower = query.lower()
    return [r for r in runbooks if query_lower in r["title"].lower() or query_lower in r["content"].lower()]


def handle_command(command: str, user: str = "engineer") -> str:
    """
    Supported commands:
      /runbook <query>    — Search runbooks
      /deploy-status      — Get deploy status (mocked)
      /help               — List commands
    """
    command = command.strip()

    if command.startswith("/runbook "):
        query = command[len("/runbook "):].strip()
        results = search_runbooks(query)
        if not results:
            return f"No runbooks found for '{query}'. Try /runbook deploy or /runbook incident."
        response = f"Found {len(results)} runbook(s):\n"
        for r in results[:3]:
            response += f"\n**{r['title']}**\n{r['content'][:200]}...\n"
        return response

    elif command == "/deploy-status":
        # Spec Update 2: deploy status integration (mocked)
        return (
            "Deploy Status (last 24h):\n"
            "- api-service: ✅ v2.4.1 deployed 2h ago\n"
            "- auth-service: ✅ v1.8.3 deployed 6h ago\n"
            "- worker-service: ⚠️ v3.1.0 deploy failed — rollback in progress\n"
        )

    elif command == "/help":
        return (
            "Available commands:\n"
            "/runbook <query>  — Search internal runbooks\n"
            "/deploy-status    — Check recent deploy status\n"
            "/help             — Show this message\n"
        )

    else:
        # AI fallback for natural language questions
        safe_query = command.replace("/", "").strip()
        if len(safe_query) > 500:
            return "Query too long. Please keep questions under 500 characters."
        return get_ai_summary(safe_query, context="You are an internal engineering assistant. Answer concisely.")


if __name__ == "__main__":
    print("Slack Productivity Bot (CLI simulation)")
    print("Type a command (/runbook, /deploy-status, /help) or a question. Ctrl+C to exit.\n")
    while True:
        try:
            cmd = input("> ").strip()
            if cmd:
                print(handle_command(cmd))
                print()
        except KeyboardInterrupt:
            print("\nBye!")
            break
