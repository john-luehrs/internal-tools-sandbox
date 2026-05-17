"""
One-time sandbox bootstrap.
Creates .env from .env.example if needed and seeds all local datasets/dbs.
Run once after cloning, then start any project directly.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_EXAMPLE = ROOT / ".env.example"
ENV_FILE = ROOT / ".env"


def ensure_env_file() -> None:
    if ENV_FILE.exists():
        print(".env already exists")
        return
    if not ENV_EXAMPLE.exists():
        raise FileNotFoundError("Missing .env.example; cannot create .env")
    shutil.copy2(ENV_EXAMPLE, ENV_FILE)
    print("Created .env from .env.example")


def run_seeders() -> None:
    cmd = [sys.executable, str(ROOT / "scripts" / "seed_all.py")]
    print("Seeding local databases and data files...")
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    os.chdir(ROOT)
    ensure_env_file()
    run_seeders()
    print("\nBootstrap complete. You can start working on any project now.")
    print("Examples:")
    print("  streamlit run app/support_dashboard/app.py")
    print("  py -m uvicorn services.api:app --reload --port 8000")
    print("  cd web && npm run dev  # open /qa-analyzer/sprint or /log-analyzer/team")
    print("  streamlit run app/onboarding/app.py")


if __name__ == "__main__":
    main()
