# Slack Productivity Bot

## Overview

| | |
|---|---|
| **Friction** | Runbooks are split across three tools and engineers lose about 45 minutes/week searching docs. |
| **Root Cause** | No unified search layer for runbooks or deploy status, and common scripts are run manually. |
| **Solution** | Slack-style bot for runbook search and deploy status responses. |
| **Impact** | Doc lookup drops to under 5 minutes/week per engineer and common answers are available instantly. |

## Running

```bash
streamlit run app/slack_bot/streamlit_app.py
```

Or run the CLI:

```bash
py app/slack_bot/app.py
```

Requires `data/runbooks.json` — run `py scripts/bootstrap.py` first.
