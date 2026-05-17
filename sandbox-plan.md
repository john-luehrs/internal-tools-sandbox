# Internal Tools Engineering Sandbox  
A fully self‑contained, local‑only environment for practicing real internal‑tools engineering, AI‑assisted workflows, secure data handling, and iterative development with spec updates.

This sandbox simulates realistic business friction, internal APIs, synthetic datasets, and evolving requirements — mirroring the work done by internal‑tools, DevEx, and AI‑ops teams at companies like Datadog, HubSpot, Mark43, M‑Files, and ServiceNow.

Everything runs **locally**, with **no hosting**, **no external dependencies**, and **no real data**.

---

# 📦 Repository Structure

```
internal-tools-sandbox/
  /app/                 # Python tool modules, CLI tools, and domain logic assets
  /data/                # Synthetic CSV/JSON datasets
  /db/                  # Local SQLite databases
  /docs/                # Documentation (this file, API specs, updates)
  /scripts/             # Seeders, data generators, utilities
  /services/            # Local mock APIs (FastAPI/Express)
  /tools/               # Internal scripts, GitHub Actions, bots
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
- Local-only implementation (FastAPI + Next.js for active tools, Python + SQLite for data/services)

---

# 1. Support Ticket Triage Dashboard (AI‑Assisted)

## **Business Friction Summary**
Support triage currently takes **6 hours per ticket**.  
Agents spend **4.5 hours** manually searching:

- customer tier  
- SLA  
- past interactions  
- internal documentation  
- known issues  

**Impact:**
- SLA breaches up **18%**  
- CSAT dropped **4.2 → 3.6**  
- Agents spend **70% of time searching**, not resolving  

**Goal:**  
Reduce triage time to **under 1 hour** by unifying data and adding AI summaries.

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
QA teams struggle to identify recurring defect patterns across sprints.  
Manual analysis takes **10–12 hours per sprint**.

**Impact:**
- Duplicate defects increase by **22%**  
- Root‑cause analysis delayed  
- Engineering loses **~8 hours/week** to rework  

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
Onboarding requires **14 manual steps** across HR, IT, and Security.  
Average onboarding time: **3.5 days**.

**Impact:**
- Delayed access provisioning  
- New hires waiting idle  
- Managers frustrated  

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
Ops engineers spend **6–8 hours/week** manually scanning logs.

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
Finance reports contain duplicate customer records and inconsistent invoice data.

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
Engineers waste time searching for internal docs and running repetitive tasks.

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
Engineers manually run repetitive scripts for testing, linting, and deployments.

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
