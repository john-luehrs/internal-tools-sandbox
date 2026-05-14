# Internal Tools Engineering Sandbox

A fully self-contained, local-only environment for practicing real internal-tools engineering, AI-assisted workflows, secure data handling, and iterative development with spec updates.

This sandbox simulates realistic business friction, internal APIs, synthetic datasets, and evolving requirements — mirroring the work done by internal-tools, DevEx, and AI-ops teams at companies like Datadog, HubSpot, Mark43, M-Files, and ServiceNow.

> Everything runs **locally**. No hosting. No real data.

---

## Tools

| # | Tool | Friction | Impact |
|---|------|----------|--------|
| 1 | [Support Ticket Triage Dashboard](app/support_dashboard/) | 6.2hr avg first response vs 2hr SLA target; agents spend 75% of ticket time searching 4 systems | First-response time target < 2hr; SLA breaches ↓ 18%; CSAT 3.6 → 4.2/5 |
| 2 | [QA Defect Pattern Analyzer](app/qa_analyzer/) | 10–12hr/sprint manual defect analysis; 22% of tickets are duplicates; 4–6hr/week lost to known-issue rework | Pattern analysis < 30min/sprint; duplicates caught before filing |
| 3 | [Onboarding Workflow Automation](app/onboarding/) | 14 untracked manual steps; 5–7 days to full access; 40% of hires arrive Day 1 without accounts | Same-day provisioning for standard roles; manager visibility dashboard |
| 4 | [AI-Assisted Log Analyzer](app/log_analyzer/) | 47min MTTD; 3 incidents/quarter missed for 2+ hrs; 35% of on-call shift spent on log review | MTTD target < 10min; anomaly scoring replaces manual scanning |
| 5 | [Internal Data Cleanup Tool](app/data_cleanup/) | ~12% duplicate customer records; $40K in billing errors/quarter; 6–8hr/month manual reconciliation | Reconciliation < 30min/month; duplicate and invoice errors eliminated |
| 6 | [Slack Productivity Bot](app/slack_bot/) | Runbooks split across 3 tools; 45min/week/engineer lost to doc search; 9 engineer-hrs/week team-wide | Doc search < 5min/week/engineer; deploy status and runbooks in one command |
| 7 | [GitHub Actions Automation](app/github_actions/) | 25–35min of manual steps per deploy cycle; 3 production incidents/quarter from skipped manual steps | Deploy cycle < 5min automated; failures notify Slack immediately |

---

## Repository Structure

```
internal-tools-sandbox/
  app/                  # Streamlit dashboards, CLI tools
    support_dashboard/
    qa_analyzer/
    onboarding/
    log_analyzer/
    data_cleanup/
    slack_bot/
    github_actions/
  data/                 # Synthetic CSV/JSON datasets
  db/                   # SQLite databases (auto-created by seeders)
  docs/                 # Project documentation and specs
  scripts/              # Data seeders and generators
  services/             # Local mock FastAPI server
  tools/                # Utility scripts, GitHub Actions workflows
  .env.example          # Environment variable template
  requirements.txt      # Python dependencies
```

---

## Quickstart

### 1. Clone and bootstrap once

```bash
git clone https://github.com/yourusername/internal-tools-sandbox.git
cd internal-tools-sandbox

py -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
py scripts/bootstrap.py
```

### 2. Start the mock API server

```bash
uvicorn services.api:app --reload --port 8000
```

### 3. Run a tool dashboard

```bash
streamlit run app/support_dashboard/app.py
```

If you want a command reminder for any project, run `py scripts/run_tool.py <tool_name>`.

---

## Security Model

This sandbox simulates enterprise data governance. See [docs/security-guidelines.md](docs/security-guidelines.md) and [docs/data-classification.md](docs/data-classification.md).

| Classification | Examples | Handling |
|----------------|----------|----------|
| Public | Docs, sample code | No restrictions |
| Internal | Ticket IDs, SLAs | Internal only |
| Sensitive | Logs, risk scores | Mask in logs, restrict by role |
| PII | Names, emails, phones | Scrub before AI, mask in logs |
| Restricted | Internal notes | RBAC + audit logging |

**All data is synthetic. No real PII is used.**

---

## AI Integration

Tools use OpenAI (gpt-4o-mini by default) for:
- Ticket summarization with PII scrubbing
- Defect clustering and duplicate detection
- Log anomaly explanation
- Safe-mode redaction before all AI calls

Set `OPENAI_API_KEY` in `.env` to enable real AI responses. Without it, all AI features return realistic mock responses automatically.

### AI usage by tool

| Tool | Uses OpenAI key? | Notes |
|---|---|---|
| Support Ticket Triage Dashboard | Optional | Real summaries and high-risk explanations fall back to mock text if no key is set |
| QA Defect Pattern Analyzer | Optional | AI clustering and duplicate detection use the key when available |
| AI-Assisted Log Analyzer | Optional | Summaries and anomaly explanations use the key when available |
| Slack Productivity Bot | Optional | Only free-form AI fallback questions use the key; `/runbook` and `/deploy-status` are local |
| Onboarding Workflow Automation | No | Workflow tracking is fully local |
| Internal Data Cleanup Tool | No | Duplicate detection and normalization are deterministic/local |
| GitHub Actions Automation Tool | No | Workflow simulation is fully local |

---

## Spec Update Discipline

Each tool has been through **two rounds of spec changes**, simulating real evolving requirements. See [docs/spec-updates.md](docs/spec-updates.md). Each tool folder contains its own `CHANGELOG.md`.

---

## Commit Conventions

```
feat:     new feature
fix:      bug fix
chore:    maintenance
refactor: code restructuring
docs:     documentation
test:     tests
```
