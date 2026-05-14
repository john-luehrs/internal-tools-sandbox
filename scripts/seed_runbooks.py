"""Seed runbooks JSON data for the Slack productivity bot."""
import os
import json

DATA_PATH = os.path.join(os.path.dirname(__file__), "../data/runbooks.json")

RUNBOOKS = [
    {
        "id": 1,
        "title": "Deploy to Production",
        "content": (
            "1. Ensure all tests pass on main branch.\n"
            "2. Create a release tag: git tag v<version>\n"
            "3. Push the tag: git push origin v<version>\n"
            "4. Monitor GitHub Actions deploy-prod workflow.\n"
            "5. Verify health endpoint post-deploy: GET /health\n"
            "6. Announce in #deployments Slack channel."
        ),
    },
    {
        "id": 2,
        "title": "Incident Response Runbook",
        "content": (
            "1. Acknowledge the alert in PagerDuty.\n"
            "2. Join #incident-response Slack channel.\n"
            "3. Assign Incident Commander (IC).\n"
            "4. Identify affected systems using the log analyzer.\n"
            "5. Communicate status every 15 minutes.\n"
            "6. Write post-mortem within 48 hours of resolution."
        ),
    },
    {
        "id": 3,
        "title": "Database Backup and Restore",
        "content": (
            "Backup: pg_dump -U postgres mydb > backup.sql\n"
            "Restore: psql -U postgres mydb < backup.sql\n"
            "Verify: SELECT COUNT(*) FROM critical_table;\n"
            "Schedule: Backups run nightly at 02:00 UTC via cron."
        ),
    },
    {
        "id": 4,
        "title": "On-Call Handoff Checklist",
        "content": (
            "1. Review open alerts and incidents.\n"
            "2. Check deployment queue — any pending prod deploys?\n"
            "3. Review anomaly scores in log analyzer (score > 75).\n"
            "4. Brief incoming on-call engineer on active issues.\n"
            "5. Update on-call rotation in PagerDuty."
        ),
    },
    {
        "id": 5,
        "title": "Rollback Procedure",
        "content": (
            "1. Identify the last stable release tag.\n"
            "2. Trigger deploy workflow with previous tag.\n"
            "3. Monitor health endpoint: GET /health\n"
            "4. Announce rollback in #deployments.\n"
            "5. Open a bug report for the regression."
        ),
    },
]


def seed_runbooks():
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, "w") as f:
        json.dump(RUNBOOKS, f, indent=2)


if __name__ == "__main__":
    seed_runbooks()
    print("runbooks.json seeded.")
