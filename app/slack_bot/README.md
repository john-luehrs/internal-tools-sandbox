# Slack Productivity Bot

## Overview

| | |
|---|---|
| **Friction** | Runbooks are split across three tools and engineers lose about 45 minutes/week searching docs. |
| **Root Cause** | No unified search layer for runbooks or deploy status, and common scripts are run manually. |
| **Solution** | Slack-style bot for runbook search and deploy status responses. |
| **Impact** | Doc lookup drops to under 5 minutes/week per engineer and common answers are available instantly. |

## Running

Current status: this tool is not part of the active web platform release.

CLI mode is still available:

```bash
py app/slack_bot/app.py
```

Requires `data/runbooks.json` — run `py scripts/bootstrap.py` first.
Use `py scripts/run_tool.py slack_bot` for command guidance when this tool is resumed.
