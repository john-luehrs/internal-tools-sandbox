# Onboarding Workflow Automation

## Overview

| | |
|---|---|
| **Friction** | Onboarding a new employee requires 14 manual steps across HR, IT, and Security and takes 5–7 business days to full access provisioning. |
| **Root Cause** | No central tracking system for approvals, access provisioning, and training completion. |
| **Solution** | Step tracker with role-based access, manager approval, and training completion status. |
| **Impact** | Standard roles can reach Day 1 provisioning and managers can see onboarding status in one place. |

## Running

```bash
streamlit run app/onboarding/app.py
```

Requires `db/onboarding.db` — run `py scripts/bootstrap.py` first.
