"""
Launch a sandbox project by name.
Usage: py scripts/run_tool.py support_dashboard
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TOOL_COMMANDS = {
    "support_dashboard": ["streamlit", "run", "app/support_dashboard/app.py"],
    "qa_analyzer": ["streamlit", "run", "app/qa_analyzer/app.py"],
    "onboarding": ["streamlit", "run", "app/onboarding/app.py"],
    "log_analyzer": ["web", "ui"],
    "log_analyzer_legacy": ["streamlit", "run", "app/log_analyzer/app.py"],
    "data_cleanup": ["streamlit", "run", "app/data_cleanup/app.py"],
    "slack_bot": ["streamlit", "run", "app/slack_bot/streamlit_app.py"],
    "github_actions": ["streamlit", "run", "app/github_actions/app.py"],
    "api": ["uvicorn", "services.api:app", "--reload", "--port", "8000"],
}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: py scripts/run_tool.py <tool_name>")
        print(f"Available: {', '.join(sorted(TOOL_COMMANDS))}")
        raise SystemExit(1)

    tool_name = sys.argv[1]
    command = TOOL_COMMANDS.get(tool_name)
    if not command:
        print(f"Unknown tool: {tool_name}")
        print(f"Available: {', '.join(sorted(TOOL_COMMANDS))}")
        raise SystemExit(1)

    print("Run this command from the repo root:")
    if tool_name == "log_analyzer":
        print("py -m uvicorn services.api:app --reload --port 8000")
        print("cd web && npm run dev")
        print("Open http://localhost:3000/log-analyzer/team")
    else:
        print(" ".join(command))


if __name__ == "__main__":
    main()
