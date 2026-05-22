# QA Defect Pattern Analyzer

Current milestone: Spec Update 2 is complete and testable in the web UI.

See `CHANGELOG.md` for release history and update scope.

## Overview

| | |
|---|---|
| **Friction** | After each sprint, QA leads manually read 40–80 defect reports to identify patterns, duplicates, and hotspots. Analysis takes 10–12 hours per sprint. |
| **Root Cause** | Defect data lives in spreadsheets and issue trackers with no clustering or duplicate detection. |
| **Solution** | Web-based QA analyzer with sprint filters, triage workflows, AI clustering, duplicate detection, and CSV reporting. |
| **Impact** | Pattern analysis < 30 minutes per sprint. Duplicate defects caught before filing. |

## Update 1 (Complete)

- Component heatmap fed by `GET /api/qa/trends/heatmap`
- Severity distribution visualization from backend heatmap totals
- Click-to-filter bridge from heatmap/distribution into defect table filters
- Sprint filter clear action and stable top-panel layout for test walkthroughs

## Update 2 (Complete)

- Duplicate detection is runnable by all QA roles with DB-backed cached scan reuse
- Duplicate detection groups are reviewable by confidence and rationale
- QA users submit duplicate merge requests (canonical + sources + rationale)
- QA lead/manager reviews a pending merge-request queue and approves merges from review view
- On approval, merge action links source defects to canonical via `canonical_defect_id` and marks sources as `duplicate_merged`

## API + Docs Alignment

- API reference includes sprint metadata, defects filters, and heatmap endpoint in `docs/api/qa-analyzer.md`
- Web implementation lives at `web/app/qa-analyzer/sprint/page.tsx`
- Shared client types and API wrappers are in `web/lib/types.ts` and `web/lib/api.ts`

## Testing Notes

- Primary validation for this update is web build + interactive QA walkthrough in `web/qa-analyzer/sprint`
- No dedicated QA analyzer unit-test doc exists yet in this repo

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
