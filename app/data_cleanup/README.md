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

Requires `db/finance.db` — run `py scripts/bootstrap.py` first for data setup.
Use `py scripts/run_tool.py data_cleanup` for command guidance when this tool is resumed.
