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

Requires `db/finance.db` from the sandbox root. If needed, run `py scripts/bootstrap.py` first.

### Prerequisites

- .NET SDK 8.x (`dotnet --version`)

### Desktop App (Avalonia)

From repo root:

```bash
dotnet run --project app/data_cleanup
```

### Workflow in app

1. Data Profile: inspect customer and invoice source rows
2. Candidate Analysis: review duplicate candidates and invoice normalization outcomes
3. Execute Run: generate deterministic report artifacts

Review Queue controls are intentionally hidden in this phase and will be restored in a future update.

Artifacts are written locally to `reports/data_cleanup/` by default:

- `duplicates_<run_id>.csv`
- `invoice_normalization_<run_id>.csv`
- `summary_<run_id>.json`
- `audit_log.jsonl`

### Notes

- This implementation is Windows-first and source-run oriented for sandbox use.
- Previous Python/Streamlit implementation has been moved to `app/data_cleanup/scratch/`.

Use `py scripts/run_tool.py data_cleanup` for command guidance.
