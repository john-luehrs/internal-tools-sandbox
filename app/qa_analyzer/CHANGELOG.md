# QA Defect Pattern Analyzer Changelog

## v0.3.0 - Spec Update 2 (Complete)

- Added duplicate merge API endpoint `POST /api/qa/analysis/duplicates/merge`
- Expanded duplicate detection execution to all QA roles (`qa_engineer`, `qa_lead`, `qa_manager`)
- Added duplicate scan caching in DB (`qa_duplicate_scans`) to reduce repeated AI/token usage
- Added `force_refresh` support for duplicate detection when recomputation is needed
- Partitioned duplicate detection groups by sprint to ensure merge-request candidates are actionable without cross-sprint validation failures
- Added merge-request workflow endpoints:
  - `POST /api/qa/analysis/duplicates/requests` (QA submit)
  - `GET /api/qa/analysis/duplicates/requests` (lead/manager queue)
  - `POST /api/qa/analysis/duplicates/requests/{request_id}/approve` (lead/manager approval)
- Added DB table `defect_merge_requests` for pending/approved merge workflow state
- Updated direct merge enforcement to QA lead/manager
- Added canonical defect selection + "Submit Merge Request" flow in duplicate groups UI
- Added lead queue panel with pending request count and approve actions
- Improved lead queue error handling and explicit retry action in UI sidebar
- Added merge audit persistence in `defect_merge_actions` + audit log events:
  - `qa_duplicates_merged`
  - `qa_duplicate_merge_requested`
  - `qa_duplicate_merge_approved`
- Added frontend request/approval integration:
  - `web/lib/types.ts` (`QADuplicateMergeRequestItem`)
  - `web/lib/api.ts` (`createQADuplicateMergeRequest`, `listQADuplicateMergeRequests`, `approveQADuplicateMergeRequest`)
  - `web/app/qa-analyzer/sprint/page.tsx` (request submit + lead approval queue)

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