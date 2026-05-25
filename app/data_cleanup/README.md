# Internal Data Cleanup Tool

## Overview

| | |
|---|---|
| **Friction** | About 12% of customer records are duplicates and invoice data arrives in mixed formats. Finance spends 6–8 hours/month reconciling data. |
| **Root Cause** | Duplicate customer imports and unnormalized invoice strings from multiple systems. |
| **Solution** | Duplicate detection plus invoice normalization workflow with audit logging. |
| **Impact** | Reconciliation time drops below 30 minutes/month and billing errors are reduced. |

## Running

Current status: this tool is not part of the active web platform release.

Requires `db/finance.db` from the sandbox root.

### Prerequisites

- .NET SDK 8.x (`dotnet --version`)
- Python environment for sandbox data setup (`py -m venv .venv` + `pip install -r requirements.txt`)

### Data setup

From repo root:

```bash
# One-time setup for sandbox DBs and latest seed data across all projects
py scripts/bootstrap.py
```

`bootstrap.py` runs `scripts/seed_all.py`, which always uses the latest version of each tool's seed script (including Tool 5 `seed_finance.py`).

### Desktop App (Avalonia)

From repo root:

```bash
dotnet run --project app/data_cleanup
```

### Workflow in app

1. Data Profile: inspect customer and invoice source rows
2. Candidate Analysis: review duplicate candidates and invoice normalization outcomes
3. Review Queue: duplicate groups auto-enter `in_review`, assign AR ownership, approve/reject (reject requires inline reason), resolve, inspect quick comparisons, and export action templates
4. Execute Run: generate deterministic report artifacts

Artifacts are written locally to `reports/data_cleanup/` by default:

- `duplicates_<run_id>.csv`
- `invoice_normalization_<run_id>.csv`
- `summary_<run_id>.json`
- `audit_log.jsonl`
- `action_exports/ar_actions_<run_id>.csv`
- `ar_lead_digest_<run_id>.md`

`summary_<run_id>.json` now includes:

- overall picture metrics
- merge candidate groups with AR assignee
- rejected groups with reason + assignee candidate
- flagged invoices with assignee (defaulted to invoice author)

### Notes

- This implementation is Windows-first and source-run oriented for sandbox use.
- Previous Python/Streamlit implementation has been moved to `app/data_cleanup/scratch/`.
- Merge decisions in Update 1 capture review outcomes and audit events; physical database row merges are not executed in this phase.
- Update 2 adds AR assignment and lifecycle tracking for demo workflow handoff.
- Review queue state is session-scoped for demos and starts fresh on each analysis run.
- Flagged invoice exceptions route to mocked invoice authors (`created_by`) as assignees.

Use `py scripts/run_tool.py data_cleanup` for command guidance.
