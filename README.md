# Internal Tools Engineering Sandbox

A fully self-contained, local-only environment for practicing real internal-tools engineering, AI-assisted workflows, secure data handling, and iterative development with spec updates.

This sandbox simulates realistic business friction, internal APIs, synthetic datasets, and evolving requirements, mirroring real-world workflows across internal-tools, DevEx, and AI-ops teams.

> Everything runs **locally**. No hosting. No real data.

---

## Tools

| # | Tool | Friction | Impact | Status |
|---|------|----------|--------|--------|
| 1 | [Support Ticket Triage Dashboard](app/support_dashboard/) | 6.2hr avg first response vs 2hr SLA target; agents spend 75% of ticket time searching 4 systems | First-response time target < 2hr; SLA breaches ↓ 18%; CSAT 3.6 → 4.2/5 | Testable |
| 2 | [QA Defect Pattern Analyzer](app/qa_analyzer/) | 10–12hr/sprint manual defect analysis; 22% of tickets are duplicates; 4–6hr/week lost to known-issue rework | Pattern analysis < 30min/sprint; duplicates caught before filing | Complete |
| 3 | [Onboarding Workflow Automation](app/onboarding/) | 14 untracked manual steps; 5–7 days to full access; 40% of hires arrive Day 1 without accounts | Same-day provisioning for standard roles; manager visibility dashboard | Not Started |
| 4 | [AI-Assisted Log Analyzer](app/log_analyzer/) | 47min MTTD; 3 incidents/quarter missed for 2+ hrs; 35% of on-call shift spent on log review | MTTD target < 10min; anomaly scoring replaces manual scanning | Complete |
| 5 | [Internal Data Cleanup Tool](app/data_cleanup/) | ~12% duplicate customer records; $40K in billing errors/quarter; 6–8hr/month manual reconciliation | Reconciliation < 30min/month; duplicate and invoice errors eliminated | Testable |
| 6 | [Slack Productivity Bot](app/slack_bot/) | Runbooks split across 3 tools; 45min/week/engineer lost to doc search; 9 engineer-hrs/week team-wide | Doc search < 5min/week/engineer; deploy status and runbooks in one command | Not Started |
| 7 | [GitHub Actions Automation](app/github_actions/) | 25–35min of manual steps per deploy cycle; 3 production incidents/quarter from skipped manual steps | Deploy cycle < 5min automated; failures notify Slack immediately | Not Started |

---

## Repository Structure

```
internal-tools-sandbox/
  app/                  # Tool modules and domain logic assets (Python + .NET)
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
  web/                  # Next.js frontend platform (Tool 2 + Tool 4)
  .env.example          # Environment variable template
  requirements.txt      # Python dependencies
```

---

## Quickstart

### 1. Clone and bootstrap once

```bash
git clone https://github.com/john-luehrs/internal-tools-sandbox.git
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

### 3. Run the active web platform (Tool 1 + Tool 2 + Tool 4)

```bash
# Terminal 1 — API server
py -m uvicorn services.api:app --reload --port 8000

# Terminal 2 — Web UI
cd web
npm install
npm run dev -- --webpack
```

Open one of the active dashboards:

- http://localhost:3000/support-triage/tickets
- http://localhost:3000/log-analyzer/team
- http://localhost:3000/qa-analyzer/sprint

Tools 3, 5, 6, and 7 are not part of the current web platform release.

If Turbopack becomes unstable in your environment, continue using `npm run dev -- --webpack` as the default local frontend command.

### 4. Run Tool 5 standalone desktop app (Testable)

```bash
# Prerequisite: .NET SDK 8.x
dotnet --version

# Ensure sandbox data exists with the latest seed definitions for all tools
py scripts/bootstrap.py

# Launch Tool 5
dotnet run --project app/data_cleanup
```

Tool 5 is a standalone Avalonia desktop workflow in `app/data_cleanup` and is not part of the active Next.js web platform.

Current desktop workflow steps:

1. Data Profile
2. Candidate Analysis
3. Review Queue (approve/reject decisions + quick comparison)
4. Execute Run

## Agent Workflow Governance

For by-the-book agent-assisted development workflow (branching, PR gates, validation, docs/changelog discipline, and review protocol), see:

- `docs/agent-constitution.md`

### 5. Active vs legacy UI paths

- Active release path: Next.js + FastAPI for Tool 1, Tool 2, and Tool 4 (`web/` + `services/api.py`)
- Legacy/prototype path: Python module UIs under `app/` (some use Streamlit)
- Streamlit is not required to run the active Tool 1/Tool 2/Tool 4 web experience

If you want a command reminder for a project, run `py scripts/run_tool.py <tool_name>`.

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
