"""
Seed all databases with synthetic data.
Run: py scripts/seed_all.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.seed_support import seed_support
from scripts.seed_qa import seed_qa
from scripts.seed_onboarding import seed_onboarding
from scripts.seed_logs import seed_logs
from scripts.seed_finance import seed_finance
from scripts.seed_ci import seed_ci
from scripts.seed_runbooks import seed_runbooks


def main():
    print("Seeding all databases...")
    seed_support()
    print("  ✓ support.db")
    seed_qa()
    print("  ✓ qa.db")
    seed_onboarding()
    print("  ✓ onboarding.db")
    seed_logs()
    print("  ✓ logs.db")
    seed_finance()
    print("  ✓ finance.db")
    seed_ci()
    print("  ✓ ci.db")
    seed_runbooks()
    print("  ✓ runbooks.json")
    print("\nAll databases seeded. Run any tool with: streamlit run app/<tool>/app.py")


if __name__ == "__main__":
    main()
