# Log Analyzer API Reference

**Tool:** AI-Assisted Log Analyzer (Tool 4)  
**Module:** `services/api.py` (`/api/logs/*`, `/api/logs/demo/*`)  
**Roles Required:** `ops_engineer`, `support_manager`, `it_admin`  

---

## Overview

The Log Analyzer API manages anomaly detection and log triage workflows. Logs are streamed from applications into SQLite (`db/logs.db`) and ranked by anomaly score. Engineers can assign logs to themselves, flag anomalies for escalation, update triage status, and request AI explanations for high-anomaly logs.

**Key Concepts:**
- **Anomaly Score:** 0-100, where 75+ indicates unusual activity
- **Status Workflow:** `unreviewed` → `in_review` → `resolved`
- **Flagging:** Mark logs for escalation to management
- **Demo Mode:** Create/cleanup synthetic logs for testing

---

## Endpoints

### GET /api/logs/team

**Description:** List all team logs with optional filters.

**Authentication:** Required (`ops_engineer`, `support_manager`, `it_admin`)

**Query Parameters:**

| Param | Type | Optional | Description |
|-------|------|----------|-------------|
| `level` | string | Yes | Filter by log level: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `service` | string | Yes | Filter by service name (e.g., `api-service`, `checkout-service`) |
| `status` | string | Yes | Filter by status: `unreviewed`, `in_review`, `resolved` |
| `anomaly_only` | boolean | Yes | If `true`, only return logs with anomaly_score > 75 |
| `sort` | string | Yes | Sort order: `timestamp` (default, newest first) or `anomaly` (highest score first) |

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/logs/team?anomaly_only=true&sort=anomaly" \
  -H "Authorization: Bearer token-manager"
```

**Example Response (200 OK):**

```json
[
  {
    "log_id": 12,
    "timestamp": "2026-05-17T14:30:22.123456Z",
    "service": "checkout-service",
    "level": "ERROR",
    "message": "Payment gateway timeout after 30s retry on SKU-4521",
    "anomaly_score": 94,
    "assigned_to": "alice",
    "status": "in_review",
    "is_flagged": 0,
    "flagged_by": null,
    "flagged_at": null,
    "flagged_reason": null
  },
  {
    "log_id": 8,
    "timestamp": "2026-05-17T14:15:10.987654Z",
    "service": "inventory-service",
    "level": "WARNING",
    "message": "Inventory sync behind schedule; 15-minute lag detected",
    "anomaly_score": 81,
    "assigned_to": null,
    "status": "unreviewed",
    "is_flagged": 0,
    "flagged_by": null,
    "flagged_at": null,
    "flagged_reason": null
  }
]
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 401 | Missing or invalid auth token |
| 403 | User role is not `ops_engineer`, `support_manager`, or `it_admin` |

---

### GET /api/logs/my-assigned

**Description:** Get logs assigned to a specific engineer.

**Authentication:** Required (`ops_engineer`, `support_manager`, `it_admin`)

**Path/Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `engineer` | string | Yes | Engineer name (e.g., `alice`, `bob`, `carol`) |

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/logs/my-assigned?engineer=alice" \
  -H "Authorization: Bearer token-alice"
```

**Example Response (200 OK):**

```json
[
  {
    "log_id": 12,
    "timestamp": "2026-05-17T14:30:22.123456Z",
    "service": "checkout-service",
    "level": "ERROR",
    "message": "Payment gateway timeout after 30s retry on SKU-4521",
    "anomaly_score": 94,
    "assigned_to": "alice",
    "status": "in_review",
    "is_flagged": 0
  }
]
```

---

### GET /api/logs/stats

**Description:** Get team workload summary (total high-anomaly, unassigned, unreviewed, in review, resolved counts).

**Authentication:** Required (`ops_engineer`, `support_manager`, `it_admin`)

**Example Request:**

```bash
curl -X GET http://localhost:8000/api/logs/stats \
  -H "Authorization: Bearer token-manager"
```

**Example Response (200 OK):**

```json
{
  "total_high_anomaly": 45,
  "unassigned_count": 12,
  "unreviewed_count": 8,
  "in_review_count": 18,
  "resolved_count": 7
}
```

---

### POST /api/logs/{log_id}/assign

**Description:** Assign a log to an engineer and optionally set status. Only managers can reassign.

**Authentication:** Required (`support_manager`, `it_admin`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `log_id` | integer | Log ID |

**Request Body:**

```json
{
  "assigned_to": "alice",
  "status": "in_review"
}
```

| Field | Type | Optional | Description |
|-------|------|----------|-------------|
| `assigned_to` | string | No | Engineer name to assign to (or `null` to unassign) |
| `status` | string | Yes | New status: `unreviewed`, `in_review`, or `resolved` |

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/logs/12/assign \
  -H "Authorization: Bearer token-manager" \
  -H "Content-Type: application/json" \
  -d '{
    "assigned_to": "alice",
    "status": "in_review"
  }'
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "log": {
    "log_id": 12,
    "assigned_to": "alice",
    "status": "in_review",
    "anomaly_score": 94,
    ...
  }
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Only `support_manager` or `it_admin` can reassign logs |
| 404 | Log with `log_id` not found |

---

### PATCH /api/logs/{log_id}/status

**Description:** Update the triage status of a log.

**Authentication:** Required (`ops_engineer`, `support_manager`, `it_admin`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `log_id` | integer | Log ID |

**Request Body:**

```json
{
  "status": "resolved"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | One of: `unreviewed`, `in_review`, `resolved` |

**Example Request:**

```bash
curl -X PATCH http://localhost:8000/api/logs/12/status \
  -H "Authorization: Bearer token-alice" \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved"}'
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "log": {
    "log_id": 12,
    "status": "resolved",
    ...
  }
}
```

---

### PATCH /api/logs/{log_id}/flag

**Description:** Flag a log for escalation. Ops engineers can only flag logs assigned to them; managers can flag any log.

**Authentication:** Required (`ops_engineer`, `support_manager`, `it_admin`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `log_id` | integer | Log ID |

**Request Body:**

```json
{
  "flagged": true,
  "reason": "Potential data exfiltration",
  "engineer": "alice"
}
```

| Field | Type | Optional | Description |
|-------|------|----------|-------------|
| `flagged` | boolean | No | `true` to flag, `false` to unflag |
| `reason` | string | Yes | Reason for flag (e.g., "escalate to security team") |
| `engineer` | string | Yes | Engineer name (used as fallback if token actor not found) |

**Example Request:**

```bash
curl -X PATCH http://localhost:8000/api/logs/12/flag \
  -H "Authorization: Bearer token-alice" \
  -H "Content-Type: application/json" \
  -d '{
    "flagged": true,
    "reason": "Investigating potential DDoS pattern"
  }'
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "log": {
    "log_id": 12,
    "is_flagged": 1,
    "flagged_by": "alice",
    "flagged_at": "2026-05-17T14:35:00.000000Z",
    "flagged_reason": "Investigating potential DDoS pattern",
    ...
  }
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | `ops_engineer` tried to flag a log not assigned to them |
| 404 | Log not found |

---

### GET /api/logs/{log_id}/explain

**Description:** Get AI-powered explanation of a high-anomaly log. Anomaly score must exceed 75.

**Authentication:** Required (`ops_engineer`, `it_admin`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `log_id` | integer | Log ID |

**Query Parameters:**

| Param | Type | Optional | Description |
|-------|------|----------|-------------|
| `engineer` | string | Yes | Engineer name (optional context) |
| `safe_mode` | boolean | Yes | If `true` (default), PII is redacted before sending to AI |

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/logs/12/explain?safe_mode=true" \
  -H "Authorization: Bearer token-alice"
```

**Example Response (200 OK):**

```json
{
  "explanation": "Payment gateway is experiencing prolonged timeouts on retry attempts. This typically indicates a cascading failure in downstream systems or network saturation. Recommend: 1) Check payment service status page, 2) Review retry backoff config, 3) Escalate to payments team if persists >5 min.",
  "anomaly_score": 94,
  "safe_mode": true
}
```

**Special Response (Low Anomaly):**

If anomaly_score ≤ 75, the response is:

```json
{
  "explanation": "Anomaly score too low for explanation",
  "anomaly_score": 65,
  "safe_mode": true
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Only `ops_engineer` or `it_admin` can request explanations |
| 404 | Log not found |

---

### POST /api/logs/demo/anomaly

**Description:** Create a synthetic high-anomaly log for testing and demo scenarios.

**Authentication:** Required (`support_manager`, `it_admin`)

**Request Body (all optional):**

```json
{
  "service": "checkout-service",
  "message": "DEMO: sustained error burst detected in payment path",
  "anomaly_score": 92
}
```

| Field | Type | Default | Constraints |
|-------|------|---------|-------------|
| `service` | string | `api-service` | Service name |
| `message` | string | `DEMO: sustained error burst detected in checkout path` | Will include "DEMO:" prefix for cleanup filtering |
| `anomaly_score` | integer | `96` | Clamped to 76-100 (high anomaly range) |

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/logs/demo/anomaly \
  -H "Authorization: Bearer token-manager" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "payment-gateway",
    "message": "DEMO: Sustained 50% error rate across all checkout flows",
    "anomaly_score": 98
  }'
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "log": {
    "log_id": 999,
    "timestamp": "2026-05-17T14:40:00.000000Z",
    "service": "payment-gateway",
    "level": "ERROR",
    "message": "DEMO: Sustained 50% error rate across all checkout flows",
    "anomaly_score": 98,
    "assigned_to": null,
    "status": "unreviewed",
    "is_flagged": 0
  }
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Only `support_manager` or `it_admin` can create demo logs |

---

### DELETE /api/logs/demo/cleanup

**Description:** Delete all synthetic (DEMO:) logs. Useful for resetting test state.

**Authentication:** Required (`support_manager`, `it_admin`)

**Example Request:**

```bash
curl -X DELETE http://localhost:8000/api/logs/demo/cleanup \
  -H "Authorization: Bearer token-manager"
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "deleted": 5
}
```

---

## Data Schema

### Log Record

| Field | Type | Description |
|-------|------|-------------|
| `log_id` | integer | Unique identifier (PK) |
| `timestamp` | string | ISO 8601 timestamp (UTC) |
| `service` | string | Service/component name |
| `level` | string | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `message` | string | Log message body |
| `anomaly_score` | integer | 0-100 (75+ is high anomaly) |
| `assigned_to` | string | Engineer name or `null` if unassigned |
| `status` | string | `unreviewed`, `in_review`, or `resolved` |
| `is_flagged` | integer | 1 if flagged, 0 otherwise |
| `flagged_by` | string | Who flagged it (engineer/manager name) or `null` |
| `flagged_at` | string | ISO 8601 timestamp when flagged, or `null` |
| `flagged_reason` | string | Reason for flag or `null` |

---

## RBAC Restrictions

| Action | Allowed Roles |
|--------|---------------|
| List team logs | `ops_engineer`, `support_manager`, `it_admin` |
| Assign/reassign logs | `support_manager`, `it_admin` |
| Update status | `ops_engineer`, `support_manager`, `it_admin` |
| Flag log (own assignment) | `ops_engineer`, `support_manager`, `it_admin` |
| Flag log (any) | `support_manager`, `it_admin` |
| Request explanation | `ops_engineer`, `it_admin` |
| Create/cleanup demo logs | `support_manager`, `it_admin` |

---

## See Also

- [Master API Reference](../API.md)
- [QA Analyzer API](qa-analyzer.md)
- [Support Tickets API](support-tickets.md)
- [Log Analyzer Frontend](../../web/app/log-analyzer/) (Next.js UI)
