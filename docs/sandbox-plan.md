# Internal Tools Engineering Sandbox  
A fully self‑contained, local‑only environment for practicing real internal‑tools engineering, AI‑assisted workflows, secure data handling, and iterative development with spec updates.

This sandbox simulates realistic business friction, internal APIs, synthetic datasets, and evolving requirements — mirroring the work done by internal‑tools, DevEx, and AI‑ops teams at companies like Datadog, HubSpot, Mark43, M‑Files, and ServiceNow.

Everything runs **locally**, with **no hosting**, **no external dependencies**, and **no real data**.

---

# 📦 Repository Structure

```
internal-tools-sandbox/
  /app/                 # Python tool modules and domain logic assets
  /data/                # Synthetic CSV/JSON datasets
  /db/                  # Local SQLite databases
  /docs/                # Documentation (this file, API specs, updates)
  /scripts/             # Seeders, data generators, utilities
  /services/            # Local mock APIs (FastAPI/Express)
  /tools/               # Internal scripts, GitHub Actions, bots
  /web/                 # Next.js frontend for Tool 4 v2.0
  README.md
```

---

# 🧩 The 7 Tools in This Sandbox

Each tool includes:

- Business friction summary  
- Security & data‑classification notes  
- Synthetic data schema  
- Local mock API documentation  
- Initial specification  
- Two rounds of spec updates  
- Changelog  
- README with friction → root cause → tool → impact  
- Local-only implementation (FastAPI + Next.js for active tools, Python + SQLite for supporting modules)

---

# 1. Support Ticket Triage Dashboard (AI‑Assisted)

## **Business Friction Summary**
Before a support agent can send a meaningful first response, they spend an average of **6 hours** gathering context — pulling customer tier, SLA terms, past interactions, internal documentation, and known issue logs from four separate systems.

Agents spend **4.5 hours** (75%) of that time searching, not resolving:

- customer tier and contract details (Salesforce)  
- SLA terms and breach history (Zendesk)  
- past ticket interactions (Zendesk + Jira)  
- internal runbooks and known issues (Confluence)  
- engineering status updates (Slack/Jira)  

**Impact:**
- SLA breaches up **18%** year-over-year  
- CSAT dropped **4.2 → 3.6** (out of 5)  
- Agents spend **75% of ticket time searching**, not resolving  
- Average first-response time: **6.2 hours** vs. SLA target of **2 hours**  

**Goal:**  
Reduce time-to-first-substantive-response to **under 2 hours** by unifying customer context and adding AI-assisted summarization.

## **Security Notes**
- Contains synthetic **PII** (names, emails, phone numbers)  
- Must implement **RBAC** (support_agent, support_manager)  
- Must **scrub PII** before sending text to AI  
- Must not log sensitive fields  
- API keys stored in `.env` (ignored by Git)

## **Synthetic Data Schema**
`tickets.csv`  
- ticket_id (int)  
- customer_name (PII)  
- email (PII)  
- phone (PII)  
- sla_tier (internal)  
- risk_score (sensitive)  
- description  
- internal_notes (restricted)

## **Mock API Endpoints**
```
GET /api/tickets
GET /api/tickets/:id
POST /api/ai/summarize   # returns mock or real AI summary
```

## **Spec Update 1**
**Reason:** New customer risk model deployed.

**Changes:**
- Add `risk_score` column  
- Highlight scores >80  
- Add AI explanation: “Why is this customer high risk?”  

## **Spec Update 2**
**Reason:** Compliance prohibits sending PII to external AI APIs.

**Changes:**
- Add PII-scrubbing middleware  
- Add “safe summary mode”  
- Add audit logs for all AI calls  

---

# 2. QA Defect Pattern Analyzer (AI‑Powered)

## **Business Friction Summary**
After each sprint, QA leads manually read through 40–80 defect reports to identify patterns, recurring components, and duplicates. There is no tooling — analysis is done in spreadsheets.

Manual defect analysis takes **10–12 hours per sprint** (one QA lead, every two weeks).

**Impact:**
- Duplicate defects filed per sprint: **~22% of all tickets** — engineers investigate issues that have already been triaged  
- Root‑cause analysis delayed by **3–5 days** after sprint close  
- Engineering loses **4–6 hours/week** (team-wide) investigating already-known issues  
- Hotspot components (auth, payments) go undetected until a critical defect surfaces  

**Goal:**  
Reduce per-sprint pattern analysis from 10–12 hours to under 30 minutes, and surface duplicate defects in real time.  

## **Security Notes**
- Contains synthetic internal engineering data  
- No PII  
- Must restrict access to QA + engineering roles  

## **Synthetic Data Schema**
`defects.csv`  
- defect_id  
- component  
- severity  
- description  
- sprint  
- engineer  
- tags  

## **Mock API**
```
POST /api/ai/cluster-defects
GET /api/defects
```

## **Spec Update 1**
**Reason:** Engineering wants visibility into component hotspots.

**Changes:**
- Add component heatmap  
- Add severity distribution chart  

## **Spec Update 2**
**Reason:** Duplicate defects causing rework.

**Changes:**
- Add duplicate detection using AI similarity  
- Add “merge duplicates” workflow  

---

# 3. Onboarding Workflow Automation Tool

## **Business Friction Summary**
Onboarding a new employee requires **14 manual steps** coordinated across HR, IT, and Security — each handled through a mix of email chains, shared spreadsheets, and direct Slack messages. There is no central tracking system.

Average time from start date to full access provisioning: **5–7 business days**.

**Impact:**
- New hires arrive on Day 1 without laptop, email, or system access in **~40% of onboardings**  
- Average idle time in first week: **1.5–2 days** waiting on access provisioning  
- IT spends **3–4 hours per hire** fielding status requests via Slack  
- Security training completion is untracked — compliance audits flag this quarterly  
- Manager satisfaction with onboarding process: **2.8 / 5**  

**Goal:**  
Automate step tracking across HR, IT, and Security. Reduce time-to-full-access to **Day 1** for standard roles, with a clear status dashboard for managers.  

## **Security Notes**
- Contains synthetic employee data (PII + sensitive)  
- Must implement RBAC (hr_admin, it_admin)  
- Must encrypt secrets  
- Must log all onboarding actions  

## **Spec Update 1**
Add manager approval step.

## **Spec Update 2**
Add security training completion tracking.

---

# 4. AI‑Assisted Log Analyzer (Ops)

## **Business Friction Summary**
Ops engineers rotate through manual log review across five services, scanning for errors, anomalies, and SLA-impacting events. Logs are queried directly via CLI with no aggregation or anomaly scoring.

Each engineer spends **6–8 hours/week** on manual log scanning.

**Impact:**
- Mean time to detect (MTTD) for production anomalies: **47 minutes**  
- **3 incidents last quarter** went undetected for 2+ hours, causing SLA breaches  
- On-call engineers spend **~35% of their shift** reviewing logs rather than resolving issues  
- No audit trail for what was reviewed or flagged — compliance risk  

**Goal:**  
Reduce MTTD to under 10 minutes with anomaly scoring. Free engineers from routine scanning so they focus on resolution.

## **Security Notes**
- Logs may contain sensitive operational metadata  
- Must redact sensitive fields  
- Must avoid sending raw logs to AI  

## **Spec Update 1**
Add anomaly detection.

## **Spec Update 2**
Add “safe AI mode” with redaction.

---

# 5. Internal Data Cleanup Tool (Finance/Ops)

## **Business Friction Summary**
The customer database has grown through manual imports, CRM migrations, and ad-hoc data entry over three years. Invoice amounts are entered inconsistently — mixing currency symbols, comma formatting, and locale-specific notation.

**Current state:**
- **~12% of customer records** have at least one duplicate (same email, different record IDs)  
- Invoice amount field contains raw strings: `$1,200`, `1200.00`, `£820`, `invalid` — no normalization  
- Finance spends **6–8 hours/month** manually reconciling records before month-end reporting  
- Billing errors linked to duplicate records affected an estimated **$40K in invoices** last quarter  
- Duplicate records cause double-billing incidents at a rate of **~3 per quarter**  

**Goal:**  
Automate duplicate detection and invoice normalization. Reduce monthly reconciliation from 6–8 hours to under 30 minutes.

## **Security Notes**
- Contains synthetic PII  
- Must mask PII in logs  
- Must validate all input  

## **Spec Update 1**
Add duplicate detection.

## **Spec Update 2**
Add invoice normalization rules.

---

# 6. Slack Productivity Bot (Engineering)

## **Business Friction Summary**
Internal runbooks are split across three locations (Confluence, Notion, a private GitHub wiki) with no search that spans all three. Engineers also manually trigger common scripts — running test suites, checking deploy status, kicking off linting — by SSH-ing into a shared dev box or navigating GitHub Actions in the browser.

**Measured impact (12-person engineering team):**
- Average time per engineer spent searching internal docs: **45 min/week**  
- Team-wide: **~9 engineer-hours/week** lost to doc search and manual script runs  
- Incident response is slowed by **15–20 minutes** when on-call engineers can't quickly locate the correct runbook  
- New engineers (< 3 months) ask the same 8–10 questions repeatedly in #engineering  

**Goal:**  
Single-command runbook search and deploy status via Slack. Reduce doc search time from 45 min/week to under 5 min/week per engineer.

## **Security Notes**
- Must not expose secrets  
- Must restrict admin commands  

## **Spec Update 1**
Add runbook search.

## **Spec Update 2**
Add deploy status integration.

---

# 7. GitHub Actions Automation Tool (DevEx)

## **Business Friction Summary**
Each deploy cycle requires engineers to manually run 6–8 shell commands in sequence: pull latest, run lint, run tests, build Docker image, push to registry, trigger deploy, verify health endpoint, post status in Slack. Steps are documented in a Confluence page that is often out of date. There is no caching and no automated notifications.

**Impact:**
- Each deploy cycle takes **25–35 minutes** of manual steps per engineer  
- Engineers run an average of **3 deploy cycles/week** — ~1.5 hours/week per engineer on manual CI work  
- **3 production incidents in the last quarter** were traced to a manual step being skipped (health check not run, wrong branch deployed)  
- No Slack notification on failure — broken builds are discovered by whoever next tries to use the service  
- Build times are 40–50% longer than necessary due to missing layer caching  

**Goal:**  
Automate the full deploy cycle via GitHub Actions with caching and automatic Slack notifications on success or failure. Reduce manual deploy time from 25–35 minutes to under 5 minutes.

## **Security Notes**
- Must not expose secrets in logs  
- Must validate inputs  

## **Spec Update 1**
Add caching.

## **Spec Update 2**
Add Slack notifications.

---

# 🔐 Security & Data Classification

| Classification | Examples | Handling Requirements |
|----------------|----------|-----------------------|
| Public | Docs, sample code | No restrictions |
| Internal | Ticket IDs, SLAs | Internal only |
| Sensitive | Logs, risk scores | Mask logs, restrict access |
| PII | Names, emails | Mask logs, scrub before AI |
| Restricted | Internal notes | RBAC + audit logging |

---

# 🔧 Local‑Only Architecture

Everything runs locally:

- SQLite databases in `/db/`  
- CSV/JSON data in `/data/`  
- Mock APIs in `/services/`  
- Web dashboards in `/web/` backed by FastAPI in `/services/`  
- Python scripts in `/scripts/`  
- No hosting required  
- No external APIs required  

---

# 📝 Changelog Structure

Each tool includes a `CHANGELOG.md`:

```
## v0.1.0 – Initial Release
- Implemented dashboard
- Added mock API

## v0.2.0 – Spec Update 1
- Added risk score
- Added AI explanation

## v0.3.0 – Spec Update 2
- Added PII scrubbing
- Added audit logs
```

---

# 🧾 Commit Message Guidelines

Use conventional commits:

- `feat:` new feature  
- `fix:` bug fix  
- `chore:` maintenance  
- `refactor:` code restructuring  
- `docs:` documentation  
- `test:` tests  

Examples:

- `feat: add AI summarization to triage dashboard`  
- `fix: remove PII from logs`  
- `chore: update API client for risk score endpoint`  

---

# 🚀 Running the Sandbox

```
pip install -r requirements.txt
py -m uvicorn services.api:app --reload --port 8000
cd web
npm install
npm run dev
```

Everything works offline.

---

# 🎯 Purpose of This Sandbox

This environment is designed to help you:

- Build confidence  
- Practice real internal‑tools engineering  
- Demonstrate AI‑assisted workflows  
- Show secure data handling  
- Handle spec updates  
- Build interview‑ready STAR stories  
- Create a portfolio that looks like real enterprise work  

---

# ✔️ Next Step

Start with:

```
/app/support_dashboard/
```

Then build each tool one by one, applying the friction → root cause → tool → impact pattern.
