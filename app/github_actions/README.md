# GitHub Actions Automation Tool

## Overview

| | |
|---|---|
| **Friction** | Each deploy cycle takes 25–35 minutes of manual shell steps and 3 production incidents per quarter have been traced to skipped steps. |
| **Root Cause** | CI/CD is run by hand with no caching or notification layer. |
| **Solution** | Workflow trigger dashboard with caching and Slack notification simulation. |
| **Impact** | Deploy cycle time falls below 5 minutes and failures are surfaced immediately. |

## Running

```bash
streamlit run app/github_actions/app.py
```

Requires `db/ci.db` — run `py scripts/bootstrap.py` first.
