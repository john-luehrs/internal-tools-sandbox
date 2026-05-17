# Internal Tools Sandbox API Documentation

**Version:** 1.0.0  
**Base URL:** `http://localhost:8000`  
**Last Updated:** May 2026

---

## Overview

The Internal Tools Sandbox API is a FastAPI service that powers the internal tools platform. All endpoints require authentication via bearer token and enforce role-based access control (RBAC).

This document serves as the master reference. For detailed endpoint documentation, see tool-specific guides:

- [Log Analyzer API](api/log-analyzer.md)
- [QA Analyzer API](api/qa-analyzer.md)
- [Support Tickets API](api/support-tickets.md)

---

## Authentication

All endpoints (except `/health`) require an `Authorization` header with a bearer token.

### Header Format

```
Authorization: Bearer <token>
```

### Available Tokens (Demo)

| Token | Role | Actor | Use Case |
|-------|------|-------|----------|
| `token-agent` | `support_agent` | agent | Support ticket API access |
| `token-manager` | `support_manager` | dana | Log assignment, manager features |
| `token-it` | `it_admin` | evan | IT admin, log cleanup |
| `token-alice` | `ops_engineer` | alice | Ops engineer with personal queue |
| `token-bob` | `ops_engineer` | bob | Ops engineer with personal queue |
| `token-carol` | `ops_engineer` | carol | Ops engineer with personal queue |
| `token-qa` | `qa_engineer` | quinn | QA triage work |
| `token-qa-taylor` | `qa_engineer` | taylor | QA triage work |
| `token-qa-lead` | `qa_lead` | riley | QA lead (analysis approval, reassignment) |
| `token-qa-manager` | `qa_manager` | morgan | QA manager (full control) |

---

## Role-Based Access Control (RBAC)

### Roles and Permissions

#### Support/Ops Roles
- **`support_agent`**: Can list and view tickets (with PII masking)
- **`support_manager`** (dana): Can assign logs, create/cleanup demo logs, run AI summarization
- **`ops_engineer`** (alice, bob, carol): Can update log status, flag assigned logs, request explanations
- **`it_admin`** (evan): Can assign logs, cleanup demo logs, full log access

#### QA Roles
- **`qa_engineer`** (quinn, taylor): Can triage defects, add notes, update own defects only
- **`qa_lead`** (riley): Can reassign defects, run analysis, approve duplicate merges, add notes
- **`qa_manager`** (morgan): Can do everything QA lead can do, plus full admin permissions

### Key RBAC Rules

1. **Log Assignment**: Only `support_manager` and `it_admin` can assign logs
2. **Log Flagging**: `ops_engineer` can only flag logs assigned to them
3. **QA Analysis**: Only `qa_lead` and `qa_manager` can run clustering and duplicate detection
4. **Defect Assignment**: Only `qa_lead` and `qa_manager` can reassign defects
5. **Duplicate Merge**: Only `qa_lead` and `qa_manager` can mark defects as `duplicate_merged`
6. **Engineer Status Update**: `qa_engineer` can only update defects they own or are unassigned

---

## Error Responses

All error responses follow a consistent format:

### Standard Error Format

```json
{
  "detail": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

| Code | Meaning | When It Occurs |
|------|---------|----------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid input parameters or validation failure |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Authenticated but insufficient permissions for requested action |
| 404 | Not Found | Resource (log, defect, ticket) does not exist |
| 500 | Server Error | Internal server error |

---

## Endpoints Summary

### Health / Utility
- **`GET /health`** — Service health check (no auth required)

### Support Tickets
- **`GET /api/tickets`** — List all support tickets (with PII masking for agents)
- **`GET /api/tickets/{ticket_id}`** — Get single ticket details
- **`POST /api/ai/summarize`** — AI-assisted ticket summarization

### Log Analyzer
- **`GET /api/logs/team`** — List all team logs with filters
- **`GET /api/logs/my-assigned`** — Get logs assigned to an engineer
- **`GET /api/logs/stats`** — Summary stats (high anomaly, unreviewed, etc.)
- **`POST /api/logs/{log_id}/assign`** — Assign log to engineer (manager only)
- **`PATCH /api/logs/{log_id}/status`** — Update log status (unreviewed → in_review → resolved)
- **`PATCH /api/logs/{log_id}/flag`** — Flag anomaly for escalation
- **`GET /api/logs/{log_id}/explain`** — Get AI explanation of anomaly
- **`POST /api/logs/demo/anomaly`** — Create demo anomaly for testing
- **`DELETE /api/logs/demo/cleanup`** — Delete all demo logs

### QA Analyzer
- **`GET /api/qa/sprints`** — List all sprint metadata
- **`GET /api/qa/defects`** — List defects with filters
- **`GET /api/qa/trends/heatmap`** — Component/severity heatmap data
- **`GET /api/qa/defects/{defect_id}/notes`** — Get triage notes for defect
- **`POST /api/qa/defects/{defect_id}/notes`** — Add triage note to defect
- **`PATCH /api/qa/defects/{defect_id}/status`** — Update defect status
- **`PATCH /api/qa/defects/{defect_id}/assign`** — Reassign defect (lead/manager only)
- **`POST /api/qa/analysis/cluster`** — Run AI clustering on descriptions
- **`POST /api/qa/analysis/duplicates`** — Find duplicate defects
- **`GET /api/qa/reports/export.csv`** — Export defects to CSV

---

## Rate Limiting

Currently not implemented. All requests are processed immediately.

---

## Versioning

API versioning is done via the base URL (`/api/v1/`, `/api/v2/`, etc.) when needed in the future. Current endpoints use `/api/`.

---

## Data Flow & Audit

All state-changing operations (updates, creates) are logged to `audit_log.jsonl` with:
- Actor name (who performed the action)
- Action type (what was done)
- Entity ID (what was affected)
- Timestamp (when it happened)
- Metadata (additional context like status change, reason, etc.)

---

## Example Request-Response Cycle

### Example 1: Get QA Sprints
```bash
curl -X GET http://localhost:8000/api/qa/sprints \
  -H "Authorization: Bearer token-qa-manager"
```

Response (200 OK):
```json
[
  {
    "sprint_id": "S510",
    "start_date": "2026-01-06",
    "end_date": "2026-01-19",
    "release_label": "2026.R1",
    "modules_deployed": "checkout,payment_gateway,notifications",
    "deploy_success_count": 17,
    "deploy_error_count": 2
  },
  {
    "sprint_id": "S511",
    "start_date": "2026-01-20",
    "end_date": "2026-02-02",
    "release_label": "2026.R2",
    "modules_deployed": "inventory_service,promotions_engine,checkout",
    "deploy_success_count": 22,
    "deploy_error_count": 4
  }
]
```

### Example 2: Add QA Note (RBAC Check)
```bash
# As qa_engineer (quinn) — allowed
curl -X POST http://localhost:8000/api/qa/defects/1/notes \
  -H "Authorization: Bearer token-qa" \
  -H "Content-Type: application/json" \
  -d '{"note_body":"Likely duplicate of ticket #5"}'
```

Response (200 OK):
```json
{
  "success": true,
  "note": {
    "note_id": 42,
    "defect_id": 1,
    "author": "quinn",
    "note_body": "Likely duplicate of ticket #5",
    "created_at": "2026-05-17T14:30:22.123456Z"
  }
}
```

---

## Contributing to API Documentation

When adding new endpoints or modifying existing ones:

1. **Update tool-specific docs** first: `docs/api/<tool>.md`
2. **Update this master doc** with the new endpoint in the summary
3. **Add unit test** in `tests/test_api_smoke.py` or create new test file
4. **Update test overview** in `tests/TEST_OVERVIEW.md`
5. **See** [Contribution Guidelines](../tests/contributing/API_TEST_CONTRIBUTION.md) for full workflow

---

## Support

For questions or bugs, see project `README.md` or check `services/api.py` for implementation details.
