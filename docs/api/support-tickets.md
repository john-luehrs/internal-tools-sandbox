# Support Tickets API Reference

**Module:** `services/api.py` (`/api/tickets/*`, `/api/ai/summarize`)  
**Roles Required:** `support_agent`, `support_manager`

---

## Overview

The Support Tickets API powers ticket triage workflows with role-based masking, safe AI summarization, and escalation tracking.

**Key Concepts:**
- **PII Masking:** `support_agent` sees masked `email`, `phone`, and restricted `internal_notes`
- **Safe Summarization:** `safe_mode=true` scrubs PII before AI processing
- **Escalation Workflow:** agents request escalation; managers approve/reject/clear

**Authentication Headers:**
- `Authorization: Bearer <token>` (preferred)
- `X-Token: <token>` (supported)

---

## Endpoints

### GET /api/tickets

**Description:** List support tickets with role-based masking.

**Authentication:** Required (`support_agent`, `support_manager`)

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Role is not `support_agent` or `support_manager` |

---

### GET /api/tickets/{ticket_id}

**Description:** Get one ticket with role-based masking.

**Authentication:** Required (`support_agent`, `support_manager`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `ticket_id` | integer | Ticket ID |

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Role is not `support_agent` or `support_manager` |
| 404 | Ticket not found |

---

### PATCH /api/tickets/{ticket_id}/escalate

**Description:** Update escalation state for a ticket.

**Authentication:**
- `request` action: `support_agent`, `support_manager`
- `approve`, `reject`, `clear` actions: `support_manager` only

**Request Body:**

```json
{
  "action": "request",
  "target": "engineering_on_call",
  "reason": "Customer impact is repeating and needs urgent engineering review."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | Yes | One of: `request`, `approve`, `reject`, `clear` |
| `target` | string | No | Used for `request`; defaults to `engineering_on_call` |
| `reason` | string | No | Required for `request` with minimum length 5 |

**Response (200 OK):**

```json
{
  "success": true,
  "ticket": {
    "ticket_id": 1,
    "escalation_status": "requested",
    "escalation_target": "engineering_on_call",
    "escalation_reason": "Customer impact is repeating and needs urgent engineering review.",
    "escalation_requested_by": "sage",
    "escalation_requested_at": "2026-05-22T12:30:00Z",
    "escalation_resolved_by": null,
    "escalation_resolved_at": null
  }
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 400 | Invalid action or request reason too short |
| 403 | Unsupported role for selected escalation action |
| 404 | Ticket not found |

---

### POST /api/ai/summarize

**Description:** Generate AI summary for ticket text with optional safe-mode scrubbing.

**Authentication:** Required (`support_agent`, `support_manager`)

**Request Body:**

```json
{
  "text": "Payment processing fails with error code 500 on checkout.",
  "context": "SLA tier: platinum; risk score: 92",
  "safe_mode": true
}
```

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `text` | string | Yes | — | Text to summarize (max 4000 chars) |
| `context` | string | No | `""` | Additional ticket context |
| `safe_mode` | boolean | No | `true` | Scrubs PII before AI call |

**Error Cases:**

| Status | Reason |
|--------|--------|
| 400 | Text exceeds 4000 characters |
| 403 | Role is not `support_agent` or `support_manager` |

---

## Data Schema

### Ticket Record

| Field | Type | Description |
|-------|------|-------------|
| `ticket_id` | integer | Unique identifier (PK) |
| `customer_name` | string | Customer name (PII) |
| `customer_tier` | string | Customer segment (`enterprise`, `mid_market`, `small_business`) |
| `email` | string | Customer email (PII, masked for agents) |
| `phone` | string | Customer phone (PII, masked for agents) |
| `sla_tier` | string | Service tier (internal) |
| `risk_score` | integer | Risk model score (0-100) |
| `description` | string | Ticket description |
| `internal_notes` | string | Restricted notes (masked for agents) |
| `created_at` | string | Queue entry timestamp (ISO 8601, UTC) |
| `updated_at` | string | Last update timestamp (ISO 8601, UTC) |
| `escalation_status` | string | `none`, `requested`, `approved`, `rejected` |
| `escalation_target` | string | Escalation destination/team |
| `escalation_reason` | string | Escalation rationale |
| `escalation_requested_by` | string | Actor that requested escalation |
| `escalation_requested_at` | string | Escalation request timestamp |
| `escalation_resolved_by` | string | Manager that approved/rejected |
| `escalation_resolved_at` | string | Resolution timestamp |

---

## RBAC Restrictions

| Action | Allowed Roles |
|--------|---------------|
| List tickets | `support_agent`, `support_manager` |
| View ticket detail | `support_agent`, `support_manager` |
| Request escalation | `support_agent`, `support_manager` |
| Approve/Reject/Clear escalation | `support_manager` |
| Request AI summary | `support_agent`, `support_manager` |

---

## See Also

- [Master API Reference](../API.md)
- [Log Analyzer API](log-analyzer.md)
- [QA Analyzer API](qa-analyzer.md)
