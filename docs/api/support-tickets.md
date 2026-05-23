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
- **Ticket History:** related tickets + similar tickets + event trail for the selected ticket
- **SLA Workflow:** support managers can pause/resume/reset SLA state and track fulfillment

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

### GET /api/tickets/{ticket_id}/history

**Description:** Return a combined ticket history payload for triage context.

**Authentication:** Required (`support_agent`, `support_manager`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `ticket_id` | integer | Ticket ID |

**Response (200 OK):**

```json
{
  "ticket_id": 1,
  "related_tickets": [
    {
      "ticket_id": 17,
      "customer_name": "Alice Johnson",
      "customer_tier": "enterprise",
      "sla_tier": "platinum",
      "risk_score": 88,
      "description": "...",
      "created_at": "2026-05-21T08:12:00Z",
      "updated_at": "2026-05-21T09:42:00Z",
      "escalation_status": "none",
      "sla_state": "active"
    }
  ],
  "similar_tickets": [
    {
      "ticket_id": 4,
      "customer_name": "Bob Martinez",
      "customer_tier": "mid_market",
      "sla_tier": "gold",
      "risk_score": 74,
      "description": "...",
      "created_at": "2026-05-20T12:00:00Z",
      "updated_at": "2026-05-20T12:45:00Z",
      "escalation_status": "requested",
      "sla_state": "paused",
      "similarity_score": 0.37
    }
  ],
  "events": [
    {
      "event_id": 101,
      "event_type": "escalation_request",
      "actor": "sage",
      "details": {
        "previous_status": "none",
        "current_status": "requested"
      },
      "created_at": "2026-05-22T12:30:00Z"
    }
  ]
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Role is not `support_agent` or `support_manager` |
| 404 | Ticket not found |

---

### PATCH /api/tickets/{ticket_id}/sla-state

**Description:** Update SLA workflow state for a ticket.

**Authentication:**
- `pause`, `resume`, `reset_active`: `support_manager` only
- `mark_met`: `support_agent`, `support_manager`

**Request Body:**

```json
{
  "action": "pause",
  "reason": "Waiting on third-party vendor response."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | Yes | One of: `pause`, `resume`, `mark_met`, `reset_active` |
| `reason` | string | No | Required for `pause` with minimum length 5 |

**Error Cases:**

| Status | Reason |
|--------|--------|
| 400 | Invalid action or state transition |
| 403 | Role not allowed for selected SLA action |
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
| `sla_state` | string | `active`, `paused`, `met` |
| `sla_pause_reason` | string | SLA pause rationale |
| `sla_paused_at` | string | SLA pause timestamp |
| `sla_paused_by` | string | Actor that paused SLA |
| `sla_resumed_at` | string | SLA resume timestamp |
| `sla_resumed_by` | string | Actor that resumed SLA |
| `sla_pause_total_seconds` | number | Total pause time applied to SLA clock |
| `sla_met_at` | string | Timestamp when SLA was marked met |
| `sla_met_by` | string | Actor that marked SLA as met |

---

## RBAC Restrictions

| Action | Allowed Roles |
|--------|---------------|
| List tickets | `support_agent`, `support_manager` |
| View ticket detail | `support_agent`, `support_manager` |
| View ticket history | `support_agent`, `support_manager` |
| Request escalation | `support_agent`, `support_manager` |
| Approve/Reject/Clear escalation | `support_manager` |
| Pause/Resume/Reset SLA | `support_manager` |
| Mark SLA met | `support_agent`, `support_manager` |
| Request AI summary | `support_agent`, `support_manager` |

---

## See Also

- [Master API Reference](../API.md)
- [Log Analyzer API](log-analyzer.md)
- [QA Analyzer API](qa-analyzer.md)
