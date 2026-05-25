# Internal Data Cleanup Tool Changelog

## v0.4.1 - Update 2 Refinements (Testable)

- Simplified Review Queue flow: duplicate groups auto-enter `in_review` after analysis.
- Removed redundant queue action and tightened top-grid layout for smaller screens.
- Added inline conditional reject-reason prompt (only appears when reject is attempted without a reason).
- Added visible reject reason column in the duplicate review queue grid.
- Added granular invoice exception controls: flag all, flag selected, unflag selected.
- Added mocked invoice author routing (`created_by`) so flagged invoices assign back to the source author.
- Added AR lead communication outputs from pipeline runs:
  - enriched `summary_<run_id>.json` with overall picture + routing sections
  - `ar_lead_digest_<run_id>.md` human-readable digest
  - `action_exports/ar_actions_<run_id>.csv` action handoff template
- Updated behavior to keep duplicate review state session-scoped for demo runs (no cross-run persistence restore).

## v0.4.0 - Spec Update 2 (Testable)

- Added handoff lifecycle states for duplicate review queue items: `new`, `in_review`, `approved`, `resolved`, and `rejected`.
- Added AR ownership fields and assignment workflow controls in the Review Queue.
- Added CSV action-export template generation for handoff (`action_exports/ar_actions_<run_id>.csv`).
- Added rerun/closure tracking metrics in-app: rerun count, last rerun timestamp, resolved count, and closure rate.
- Added lifecycle/ownership column help text and audit events for assignment, lifecycle transitions, and export actions.

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
