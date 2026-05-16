# AI-Assisted Log Analyzer

Version 2.0 introduces a role-aware web experience alongside the original local dashboards.

## Overview

| | |
|---|---|
| **Friction** | Ops engineers spend 6–8 hours/week scanning logs. Mean time to detect anomalies is 47 minutes. |
| **Root Cause** | Logs are reviewed manually in CLI tools with no anomaly scoring or redaction layer. |
| **Solution** | Log viewer with anomaly scoring, safe AI summaries, and redaction before AI calls. |
| **Impact** | MTTD target under 10 minutes and less on-call time spent on manual scanning. |

## What Is New In 2.0

- Persona-based demo login for Alice, Bob, Carol, Dana, and Evan
- Role-aware views for ops engineers, support managers, and IT admins
- Manager-only assignment controls, workload sidebar, and AI ops brief
- Ops-focused personal stat cards while preserving visibility into the shared team queue
- Top-of-page timeline analytics for managers with stacked volume and level trend views
- Safe AI explanation flows backed by redaction and audit logging

## Interfaces

### Web UI

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000/log-analyzer/team after starting the API.

The web UI is the current v2.0 demo surface. It includes:

- Persona-based login with role expectations on the sign-in screen
- Shared team queue with filters, stats, detail modal, and AI explanations
- Role-based workflow controls so only managers and admins can assign or reassign logs
- Personal queue behavior for ops engineers on `/log-analyzer/my-logs`
- Manager analytics and AI ops brief for support managers and IT admins

## Running

### Team Dashboard (detect & assign)

```bash
streamlit run app/log_analyzer/app.py
```

All ops engineers see the same log stream and can filter by service, level, and status. In the web UI, assignment and reassignment are restricted to manager-level roles.

### Individual Dashboard (your assigned logs)

```bash
streamlit run app/log_analyzer/individual.py
```

Each engineer sees only logs assigned to them, tracks status (unreviewed → in_review → resolved), and can get AI explanations.

## Demo Personas

- Alice, Bob, Carol: ops engineers with personal queue views and status updates
- Dana: support manager with workload controls, team analytics, and ops brief access
- Evan: IT admin with the same elevated workflow visibility as the manager role

Both require `db/logs.db` — run `py scripts/bootstrap.py` first.
