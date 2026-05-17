# Support Tickets API Reference

**Module:** `services/api.py` (`/api/tickets/*`, `/api/ai/summarize`)  
**Roles Required:** `support_agent`, `support_manager`  

---

## Overview

The Support Tickets API manages customer support tickets. Agents can list and view tickets with PII masking applied automatically. Managers can request AI-powered summaries of ticket content with safe PII redaction.

**Key Concepts:**
- **PII Masking:** For agents, email and phone are masked; internal notes are hidden
- **Safe Summarization:** AI summaries redact PII before processing (configurable)
- **Ticket Status:** (Future feature) Open, in_progress, resolved, closed

---

## Endpoints

### GET /api/tickets

**Description:** List all support tickets. Agents receive PII-masked version; managers see full data.

**Authentication:** Required (`support_agent`, `support_manager`)

**Query Parameters:** None

**Example Request:**

```bash
curl -X GET http://localhost:8000/api/tickets \
  -H "Authorization: Bearer token-agent"
```

**Example Response - Agent View (200 OK):**

```json
[
  {
    "ticket_id": 1,
    "customer_name": "Jane Doe",
    "email": "ja***@***",
    "phone": "***-***-****",
    "subject": "Payment processing error on checkout",
    "description": "I was unable to complete my purchase. The payment kept timing out.",
    "priority": "high",
    "status": "open",
    "created_at": "2026-05-15T10:30:00.000000Z",
    "updated_at": "2026-05-17T14:00:00.000000Z",
    "internal_notes": "[RESTRICTED]"
  },
  {
    "ticket_id": 2,
    "customer_name": "John Smith",
    "email": "jo***@***",
    "phone": "***-***-****",
    "subject": "Inventory out of stock notification issue",
    "description": "I didn't receive an email when items came back in stock.",
    "priority": "medium",
    "status": "open",
    "created_at": "2026-05-14T15:20:00.000000Z",
    "updated_at": "2026-05-17T09:30:00.000000Z",
    "internal_notes": "[RESTRICTED]"
  }
]
```

**Example Response - Manager View (200 OK):**

```json
[
  {
    "ticket_id": 1,
    "customer_name": "Jane Doe",
    "email": "jane.doe@example.com",
    "phone": "415-555-0123",
    "subject": "Payment processing error on checkout",
    "description": "I was unable to complete my purchase. The payment kept timing out.",
    "priority": "high",
    "status": "open",
    "created_at": "2026-05-15T10:30:00.000000Z",
    "updated_at": "2026-05-17T14:00:00.000000Z",
    "internal_notes": "Payment gateway timeout on retry. Escalate to payments team. Customer in premium tier."
  }
]
```

---

### GET /api/tickets/{ticket_id}

**Description:** Get a single support ticket. Same PII masking rules apply as list endpoint.

**Authentication:** Required (`support_agent`, `support_manager`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `ticket_id` | integer | Ticket ID |

**Example Request:**

```bash
curl -X GET http://localhost:8000/api/tickets/1 \
  -H "Authorization: Bearer token-agent"
```

**Example Response (200 OK):**

```json
{
  "ticket_id": 1,
  "customer_name": "Jane Doe",
  "email": "ja***@***",
  "phone": "***-***-****",
  "subject": "Payment processing error on checkout",
  "description": "I was unable to complete my purchase. The payment kept timing out. This happened on May 15th around 10am.",
  "priority": "high",
  "status": "open",
  "created_at": "2026-05-15T10:30:00.000000Z",
  "updated_at": "2026-05-17T14:00:00.000000Z",
  "internal_notes": "[RESTRICTED]"
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 404 | Ticket with `ticket_id` not found |

---

### POST /api/ai/summarize

**Description:** Request AI-powered summarization of ticket content. Supports safe mode PII redaction before sending to AI.

**Authentication:** Required (`support_agent`, `support_manager`, and other roles)

**Request Body:**

```json
{
  "text": "I was unable to complete my purchase. The payment kept timing out. This is very frustrating.",
  "context": "Payment processing issue",
  "safe_mode": true
}
```

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `text` | string | Yes | — | Text to summarize (max 4000 characters) |
| `context` | string | No | `""` | Additional context for AI (e.g., "support ticket", "log analysis") |
| `safe_mode` | boolean | No | `true` | If `true`, PII redacted before AI call; if `false`, raw text sent |

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/ai/summarize \
  -H "Authorization: Bearer token-agent" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I was unable to complete my purchase. The payment kept timing out. This is very frustrating. My email is jane@example.com and phone is 415-555-0123.",
    "context": "support ticket payment issue",
    "safe_mode": true
  }'
```

**Example Response (200 OK):**

```json
{
  "summary": "Customer unable to complete checkout due to payment gateway timeouts. Issue impacts transaction completion and customer satisfaction. Recommend immediate escalation to payments engineering team and proactive outreach to affected customer with status update.",
  "safe_mode": true
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 400 | Text exceeds 4000 characters |

---

## Data Schema

### Ticket Record

| Field | Type | Description |
|-------|------|-------------|
| `ticket_id` | integer | Unique identifier (PK) |
| `customer_name` | string | Full customer name |
| `email` | string | Customer email (PII, masked for agents) |
| `phone` | string | Customer phone number (PII, masked for agents) |
| `subject` | string | Ticket subject line |
| `description` | string | Full ticket description/message |
| `priority` | string | Priority level (`low`, `medium`, `high`, `critical`) |
| `status` | string | Status (`open`, `in_progress`, `resolved`, `closed`) |
| `internal_notes` | string | Internal team notes (hidden from agents) |
| `created_at` | string | ISO 8601 timestamp (UTC) |
| `updated_at` | string | ISO 8601 timestamp (UTC) |

---

## PII Masking Rules

### For `support_agent` role:

- **email:** First 2 characters + `***@***` (e.g., `ja***@***`)
- **phone:** `***-***-****`
- **internal_notes:** `[RESTRICTED]`

### For `support_manager` role:

- No masking; full data visible

---

## RBAC Restrictions

| Action | Allowed Roles |
|--------|---------------|
| List tickets (with masking) | `support_agent`, `support_manager` |
| View ticket details (with masking) | `support_agent`, `support_manager` |
| Request AI summary | All authenticated roles |

---

## See Also

- [Master API Reference](../API.md)
- [Log Analyzer API](log-analyzer.md)
- [QA Analyzer API](qa-analyzer.md)
