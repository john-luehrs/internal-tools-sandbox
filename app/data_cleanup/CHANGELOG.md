# Internal Data Cleanup Tool Changelog

## v0.3.0 - Spec Update 1 (Testable)

- Added duplicate merge decision workflow in Review Queue with explicit approve/reject actions.
- Added confidence and risk labels for duplicate candidates.
- Added quick comparison panel for selected duplicate groups with baseline-vs-candidate MATCH/DIFF signals.
- Added review decision audit events for queued, approved, and rejected duplicate actions.
- Added readable DataGrid headers and contextual hover descriptions for confidence/risk and comparison signal columns.
- Updated seeded finance data to include realistic distribution: mostly clean records, ambiguous candidates, and clear true-merge pairs.
- Clarified phase behavior: decisions are captured and audited; physical database merges are not executed in Update 1.

## v0.2.0 - Desktop Foundation (Testable)

- Rebuilt Tool 5 as a standalone Avalonia desktop app in `app/data_cleanup`.
- Added SQLite-backed data profiling for customer and invoice records.
- Added duplicate candidate detection by normalized billing email.
- Added invoice normalization with parse status and failure reason classifications.
- Added structured four-step workflow UI:
  - Data Profile
  - Candidate Analysis
  - Review Queue
  - Execute Run
- Added deterministic artifact generation:
  - `duplicates_<run_id>.csv`
  - `invoice_normalization_<run_id>.csv`
  - `summary_<run_id>.json`
  - `audit_log.jsonl`
- Added review queue audit events for duplicate and invoice exception workflows.
- Updated `scripts/run_tool.py` to launch Tool 5 through `dotnet run --project app/data_cleanup`.
- Preserved prior Python/Streamlit implementation in `app/data_cleanup/scratch/`.
