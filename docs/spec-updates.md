# Specification Updates
This document contains all initial specifications and iterative updates for each tool in the Internal Tools Sandbox.

Each tool receives **two rounds of spec changes**, simulating real-world evolving requirements.

---

# 1. Support Ticket Triage Dashboard

## Initial Spec
- Unified dashboard for tickets, SLAs, customer tier, and notes  
- AI summary of ticket description  
- Search + filter  
- Role-based access (support_agent, support_manager)

## Spec Update 1
**Reason:** New customer risk model deployed.

**Changes:**
- Add `risk_score` column  
- Highlight scores >80  
- Add AI explanation: “Why is this customer high risk?”  

## Spec Update 2
**Reason:** Compliance prohibits sending PII to external AI APIs.

**Changes:**
- Add PII-scrubbing middleware  
- Add “safe summary mode”  
- Add audit logs for all AI calls  

---

# 2. QA Defect Pattern Analyzer

## Initial Spec
- Load defects from SQLite  
- Cluster similar defects using AI  
- Display patterns by component and severity  

## Spec Update 1
**Reason:** Engineering wants visibility into component hotspots.

**Changes:**
- Add component heatmap  
- Add severity distribution chart  

## Spec Update 2
**Reason:** Duplicate defects causing rework.

**Changes:**
- Add duplicate detection using AI similarity  
- Add “merge duplicates” workflow  

---

# 3. Onboarding Workflow Automation Tool

## Initial Spec
- Track onboarding steps  
- Assign tasks to HR + IT  
- Provide status dashboard  

## Spec Update 1
**Reason:** Managers want visibility.

**Changes:**
- Add manager approval step  
- Add notifications  

## Spec Update 2
**Reason:** Security requires training verification.

**Changes:**
- Add “security training completion” tracking  
- Add audit logs for onboarding actions  

---

# 4. AI-Assisted Log Analyzer

## Initial Spec
- Load logs from SQLite  
- AI summary of log segments  
- Search + filter  

## Spec Update 1
**Reason:** Ops needs anomaly detection.

**Changes:**
- Add anomaly scoring  
- Add “flag anomalies” workflow  

## Spec Update 2
**Reason:** Logs contain sensitive metadata.

**Changes:**
- Add redaction middleware  
- Add “safe AI mode”  

---

# 5. Internal Data Cleanup Tool

## Initial Spec
- Load customer + invoice data  
- Identify inconsistent fields  
- Add duplicate detection for customer records  
- Add invoice normalization and validation reporting  
- Provide cleanup suggestions  

## Spec Update 1
**Reason:** Duplicate records discovered.

**Changes:**
- Add merge decision workflow (approve/reject)  
- Add confidence/risk labels for duplicate candidates  
- Add explicit review queue actions  

## Spec Update 2
**Reason:** Finance wants normalized invoices.

**Changes:**
- Add handoff lifecycle states (new, in_review, approved, resolved, rejected)  
- Add AR ownership fields and action-export template  
- Add rerun/closure tracking metrics  

---

# 6. Slack Productivity Bot

## Initial Spec
- Respond to `/help`  
- Provide internal documentation links  
- Run simple internal commands  

## Spec Update 1
**Reason:** Engineers need faster runbook access.

**Changes:**
- Add runbook search  
- Add “top 5 relevant docs” AI summary  

## Spec Update 2
**Reason:** DevOps wants deployment visibility.

**Changes:**
- Add deploy status command  
- Add restricted admin commands  

---

# 7. GitHub Actions Automation Tool

## Initial Spec
- Automate linting, tests, and formatting  
- Trigger on PR creation  

## Spec Update 1
**Reason:** Build times too slow.

**Changes:**
- Add caching  
- Add parallel jobs  

## Spec Update 2
**Reason:** Teams want notifications.

**Changes:**
- Add Slack notifications  
- Add failure summaries  

---

# ✔️ Summary
These spec updates simulate:
- Real-world requirement changes  
- Cross-team requests  
- Compliance-driven updates  
- Security-driven updates  
- Iterative internal-tool development  

Each tool should include a `CHANGELOG.md` reflecting these updates.
