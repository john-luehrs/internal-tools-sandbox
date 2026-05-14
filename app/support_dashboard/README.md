# Support Ticket Triage Dashboard

## Overview

| | |
|---|---|
| **Friction** | Agents spend 4.5 hours (75%) of a 6-hour ticket cycle searching across 4 systems before sending a first response. Average first-response time is 6.2 hours vs. a 2-hour SLA target. |
| **Root Cause** | Customer tier, SLA history, past tickets, runbooks, and engineering status live in four separate systems with no unified view and no AI assistance. |
| **Solution** | Unified dashboard with AI-assisted summarization, RBAC, and PII scrubbing before AI calls. |
| **Impact** | Time-to-first-substantive-response target: under 2 hours. SLA breaches ↓ 18%. CSAT target: 3.6 → 4.2 (out of 5). |

## Running

```bash
streamlit run app/support_dashboard/app.py
```

Requires `db/support.db` — run `py scripts/seed_all.py` first.

## Security

- **RBAC**: `support_agent` sees masked PII. `support_manager` sees full data + internal notes.
- **PII Scrubbing**: Toggle "safe mode" to scrub PII before any AI call.
- **Audit Logging**: All AI calls logged with user, ticket ID, and safe-mode status.

## Data Classification

| Field | Classification |
|-------|---------------|
| customer_name | PII |
| email | PII |
| phone | PII |
| sla_tier | Internal |
| risk_score | Sensitive |
| description | Internal |
| internal_notes | Restricted |

## Changelog

### v0.3.0 – Spec Update 2
- Added PII-scrubbing middleware
- Added "safe summary mode" toggle
- Added audit logs for all AI calls

### v0.2.0 – Spec Update 1
- Added `risk_score` column with red highlight for scores > 80
- Added AI risk explanation ("Why is this customer high risk?")

### v0.1.0 – Initial Release
- Unified ticket dashboard with search + SLA filter
- AI summary of ticket description
- Role-based access control (support_agent, support_manager)
