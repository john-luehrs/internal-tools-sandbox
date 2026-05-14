# QA Defect Pattern Analyzer

## Overview

| | |
|---|---|
| **Friction** | After each sprint, QA leads manually read 40–80 defect reports to identify patterns, duplicates, and hotspots. Analysis takes 10–12 hours per sprint. |
| **Root Cause** | Defect data lives in spreadsheets and issue trackers with no clustering or duplicate detection. |
| **Solution** | Streamlit dashboard with component heatmaps, severity distribution, AI clustering, and duplicate detection. |
| **Impact** | Pattern analysis < 30 minutes per sprint. Duplicate defects caught before filing. |

## Running

```bash
streamlit run app/qa_analyzer/app.py
```

Requires `db/qa.db` — run `py scripts/bootstrap.py` first.
