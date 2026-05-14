# AI-Assisted Log Analyzer

## Overview

| | |
|---|---|
| **Friction** | Ops engineers spend 6–8 hours/week scanning logs. Mean time to detect anomalies is 47 minutes. |
| **Root Cause** | Logs are reviewed manually in CLI tools with no anomaly scoring or redaction layer. |
| **Solution** | Log viewer with anomaly scoring, safe AI summaries, and redaction before AI calls. |
| **Impact** | MTTD target under 10 minutes and less on-call time spent on manual scanning. |

## Running

### Team Dashboard (detect & assign)

```bash
streamlit run app/log_analyzer/app.py
```

All ops engineers see the same log stream, can filter by service/level/status, and assign high-anomaly logs to team members.

### Individual Dashboard (your assigned logs)

```bash
streamlit run app/log_analyzer/individual.py
```

Each engineer sees only logs assigned to them, tracks status (unreviewed → in_review → resolved), and can get AI explanations.

Both require `db/logs.db` — run `py scripts/bootstrap.py` first.
