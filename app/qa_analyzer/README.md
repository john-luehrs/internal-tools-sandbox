# QA Defect Pattern Analyzer

## Overview

| | |
|---|---|
| **Friction** | After each sprint, QA leads manually read 40–80 defect reports to identify patterns, duplicates, and hotspots. Analysis takes 10–12 hours per sprint. |
| **Root Cause** | Defect data lives in spreadsheets and issue trackers with no clustering or duplicate detection. |
| **Solution** | Web-based QA analyzer with sprint filters, triage workflows, AI clustering, duplicate detection, and CSV reporting. |
| **Impact** | Pattern analysis < 30 minutes per sprint. Duplicate defects caught before filing. |

## Running

```bash
# Terminal 1
py -m uvicorn services.api:app --reload --port 8000

# Terminal 2
cd web
npm run dev
```

Open `http://localhost:3000/qa-analyzer/sprint`.

Requires `db/qa.db` — run `py scripts/bootstrap.py` first.
