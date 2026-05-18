# QA Defect Pattern Analyzer Changelog

## v0.2.0 - Spec Update 1 (Feature Complete)

- Added component heatmap visualization backed by `GET /api/qa/trends/heatmap`
- Added severity distribution chart based on heatmap totals
- Added heatmap-to-triage click filtering (component and severity)
- Added heatmap filter context banner with clear action
- Added sprint multi-select clear action to return to all-sprint view
- Updated QA dashboard layout for stable card alignment and improved sprint summary readability
- Removed automatic viewport jump when applying heatmap filters
- Added/updated frontend integration surface:
  - `web/lib/types.ts` (`QAHeatmapPoint`)
  - `web/lib/api.ts` (`getQAHeatmap`)
  - `web/app/qa-analyzer/sprint/page.tsx`

## v0.1.0 - Initial Release

- Implemented sprint-scoped QA defect triage dashboard
- Added defects filtering by sprint, severity, component, status, and assignee
- Added triage modal workflow with status changes, assignee updates, and notes
- Added AI clustering and duplicate detection triggers
- Added CSV report export