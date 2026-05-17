# QA Analyzer API Reference

**Tool:** QA Defect Pattern Analyzer (Tool 2)  
**Module:** `services/api.py` (`/api/qa/*`)  
**Roles Required:** `qa_engineer`, `qa_lead`, `qa_manager`  

---

## Overview

The QA Analyzer API manages sprint-based defect triage, clustering, and duplicate detection. Defects are stored in SQLite (`db/qa.db`) with rich metadata (component, severity, status, triage notes). QA teams use this API to:

1. Browse and filter defects by sprint, component, severity, and status
2. Add investigation notes and update defect status
3. Run AI-powered clustering and duplicate detection analysis
4. Assign defects to team members (lead/manager only)
5. Export defect reports as CSV

**Key Concepts:**
- **Sprint:** Logical grouping of defects by release cycle (e.g., S510, S511)
- **Defect Status:** `open`, `investigating`, `escalated`, `resolved`, `duplicate_pending`, `duplicate_merged`
- **Severity:** `critical`, `high`, `medium`, `low`
- **Notes:** Triage investigation log with timestamps and author
- **Confidence:** Duplicate detection confidence (0.0-1.0)

---

## Endpoints

### GET /api/qa/sprints

**Description:** List all QA sprint metadata (dates, modules deployed, success/error counts).

**Authentication:** Required (`qa_engineer`, `qa_lead`, `qa_manager`)

**Query Parameters:** None

**Example Request:**

```bash
curl -X GET http://localhost:8000/api/qa/sprints \
  -H "Authorization: Bearer token-qa-manager"
```

**Example Response (200 OK):**

```json
[
  {
    "sprint_id": "S514",
    "start_date": "2026-01-27",
    "end_date": "2026-02-09",
    "release_label": "2026.R5",
    "modules_deployed": "checkout,promotions_engine,order_events",
    "deploy_success_count": 18,
    "deploy_error_count": 2
  },
  {
    "sprint_id": "S513",
    "start_date": "2026-01-20",
    "end_date": "2026-02-02",
    "release_label": "2026.R4",
    "modules_deployed": "payment_gateway,inventory_service,fulfillment_pipeline",
    "deploy_success_count": 23,
    "deploy_error_count": 5
  }
]
```

---

### GET /api/qa/defects

**Description:** List defects with optional filtering by sprint, severity, component, status, or assignee.

**Authentication:** Required (`qa_engineer`, `qa_lead`, `qa_manager`)

**Query Parameters:**

| Param | Type | Optional | Description |
|-------|------|----------|-------------|
| `sprints` | string | Yes | Comma-separated sprint IDs (e.g., `S510,S511`) |
| `severity` | string | Yes | Filter by severity: `critical`, `high`, `medium`, `low` |
| `component` | string | Yes | Filter by component name |
| `status` | string | Yes | Filter by status: `open`, `investigating`, `escalated`, `resolved`, `duplicate_pending`, `duplicate_merged` |
| `assignee` | string | Yes | Filter by assignee name |

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/qa/defects?sprints=S510,S511&severity=high&status=open" \
  -H "Authorization: Bearer token-qa"
```

**Example Response (200 OK):**

```json
[
  {
    "defect_id": 5,
    "sprint_id": "S511",
    "component": "checkout",
    "severity": "high",
    "status": "investigating",
    "resolution_reason": null,
    "assignee": "quinn",
    "reporter": "qa_automation",
    "title": "Tax total mismatch between cart and checkout - edge case (S511-5)",
    "description": "Cart total differs from final checkout total when shipping ZIP is changed late in flow. Correlates with elevated retry traffic.",
    "repro_steps": "Using a previously saved cart, Add taxable items; apply shipping address change at payment step; compare totals.",
    "expected_result": "Checkout and cart totals stay consistent after recalculation.",
    "actual_result": "Checkout total recalculates, cart summary remains stale.",
    "customer_impact": "Customer confusion and cart abandonment risk.",
    "tags": "checkout,tax,pricing",
    "created_at": "2026-01-20T09:05:00.000000Z",
    "updated_at": "2026-05-17T14:30:22.000000Z",
    "canonical_defect_id": null
  }
]
```

---

### GET /api/qa/trends/heatmap

**Description:** Get defect distribution by component and severity across sprints (useful for dashboard heatmaps).

**Authentication:** Required (`qa_engineer`, `qa_lead`, `qa_manager`)

**Query Parameters:**

| Param | Type | Optional | Description |
|-------|------|----------|-------------|
| `sprints` | string | Yes | Comma-separated sprint IDs (e.g., `S510,S511`) |

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/qa/trends/heatmap?sprints=S510" \
  -H "Authorization: Bearer token-qa-manager"
```

**Example Response (200 OK):**

```json
[
  {
    "sprint_id": "S510",
    "component": "checkout",
    "severity": "critical",
    "defect_count": 3
  },
  {
    "sprint_id": "S510",
    "component": "checkout",
    "severity": "high",
    "defect_count": 5
  },
  {
    "sprint_id": "S510",
    "component": "payment_gateway",
    "severity": "high",
    "defect_count": 2
  }
]
```

---

### GET /api/qa/defects/{defect_id}/notes

**Description:** Get triage notes history for a defect (ordered newest first).

**Authentication:** Required (`qa_engineer`, `qa_lead`, `qa_manager`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `defect_id` | integer | Defect ID |

**Example Request:**

```bash
curl -X GET http://localhost:8000/api/qa/defects/5/notes \
  -H "Authorization: Bearer token-qa"
```

**Example Response (200 OK):**

```json
[
  {
    "note_id": 3,
    "defect_id": 5,
    "author": "quinn",
    "note_body": "Reproduced in staging with ZIP code 94105. Issue is consistent.",
    "created_at": "2026-05-17T14:35:00.000000Z"
  },
  {
    "note_id": 2,
    "defect_id": 5,
    "author": "taylor",
    "note_body": "Checked database logs. Tax calculation happens before cart refresh.",
    "created_at": "2026-05-17T14:20:00.000000Z"
  },
  {
    "note_id": 1,
    "defect_id": 5,
    "author": "quinn",
    "note_body": "Initial investigation: likely race condition in checkout flow.",
    "created_at": "2026-05-17T14:10:00.000000Z"
  }
]
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 404 | Defect with `defect_id` not found |

---

### POST /api/qa/defects/{defect_id}/notes

**Description:** Add a triage note to a defect.

**Authentication:** Required (`qa_engineer`, `qa_lead`, `qa_manager`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `defect_id` | integer | Defect ID |

**Request Body:**

```json
{
  "note_body": "Reproduced in staging. Marked for escalation to platform team."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `note_body` | string | Yes | Cannot be empty; whitespace is trimmed |

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/qa/defects/5/notes \
  -H "Authorization: Bearer token-qa" \
  -H "Content-Type: application/json" \
  -d '{
    "note_body": "Reproduced in staging. Marked for escalation to platform team."
  }'
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "note": {
    "note_id": 4,
    "defect_id": 5,
    "author": "quinn",
    "note_body": "Reproduced in staging. Marked for escalation to platform team.",
    "created_at": "2026-05-17T14:40:00.000000Z"
  }
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 400 | Note body is empty or missing |
| 404 | Defect not found |

---

### PATCH /api/qa/defects/{defect_id}/status

**Description:** Update defect status. Only leads/managers can set `duplicate_merged`. Engineers can only update their own or unassigned defects.

**Authentication:** Required (`qa_engineer`, `qa_lead`, `qa_manager`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `defect_id` | integer | Defect ID |

**Request Body:**

```json
{
  "status": "resolved",
  "resolution_reason": "fixed"
}
```

| Field | Type | Required | Options |
|-------|------|----------|---------|
| `status` | string | Yes | `open`, `investigating`, `escalated`, `resolved`, `duplicate_pending`, `duplicate_merged` |
| `resolution_reason` | string | Conditional* | `fixed`, `follow_up_created`, `not_reproducible` |

*Required if `status` is `resolved`; ignored otherwise.

**Example Request:**

```bash
curl -X PATCH http://localhost:8000/api/qa/defects/5/status \
  -H "Authorization: Bearer token-qa-lead" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "duplicate_merged"
  }'
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "defect": {
    "defect_id": 5,
    "status": "duplicate_merged",
    "resolution_reason": null,
    "updated_at": "2026-05-17T14:45:00.000000Z",
    ...
  }
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 400 | Invalid status or resolution_reason missing for `resolved` |
| 403 | `qa_engineer` tried to set `duplicate_merged` (only leads/managers can) |
| 403 | `qa_engineer` tried to update defect assigned to someone else |
| 404 | Defect not found |

---

### PATCH /api/qa/defects/{defect_id}/assign

**Description:** Reassign defect to a team member. Only leads and managers can reassign.

**Authentication:** Required (`qa_lead`, `qa_manager`)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `defect_id` | integer | Defect ID |

**Request Body:**

```json
{
  "assignee": "taylor"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `assignee` | string | No | Engineer name; `null` to unassign |

**Example Request:**

```bash
curl -X PATCH http://localhost:8000/api/qa/defects/5/assign \
  -H "Authorization: Bearer token-qa-manager" \
  -H "Content-Type: application/json" \
  -d '{
    "assignee": "taylor"
  }'
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "defect": {
    "defect_id": 5,
    "assignee": "taylor",
    "updated_at": "2026-05-17T14:50:00.000000Z",
    ...
  }
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | User is not `qa_lead` or `qa_manager` |
| 404 | Defect not found |

---

### POST /api/qa/analysis/cluster

**Description:** Run AI-powered clustering on defect descriptions. Groups similar defect themes to reduce manual review time.

**Authentication:** Required (`qa_lead`, `qa_manager`)

**Request Body:**

```json
{
  "sprints": ["S510"]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sprints` | array of strings | No | Sprint IDs to cluster; if empty, uses all sprints |

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/qa/analysis/cluster \
  -H "Authorization: Bearer token-qa-lead" \
  -H "Content-Type: application/json" \
  -d '{
    "sprints": ["S510", "S511"]
  }'
```

**Example Response (200 OK):**

```json
{
  "input_count": 36,
  "clusters": [
    {
      "pattern": "Checkout and Pricing Drift",
      "defects": [
        "Cart total differs from final checkout total when shipping ZIP is changed late in flow.",
        "Discount and free-shipping coupons apply together when policy allows only one."
      ]
    },
    {
      "pattern": "Payment and Retry Idempotency",
      "defects": [
        "Gateway timeout retry path creates a second order with same payment intent.",
        "Refund status drift between UI and gateway after timeout retry."
      ]
    }
  ]
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Only `qa_lead` or `qa_manager` can run analysis |

---

### POST /api/qa/analysis/duplicates

**Description:** Run AI-powered duplicate detection. Identifies semantically similar defects and calculates confidence scores with explanation rationales.

**Authentication:** Required (`qa_lead`, `qa_manager`)

**Request Body:**

```json
{
  "sprints": ["S510"]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sprints` | array of strings | No | Sprint IDs; if empty, uses all sprints |

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/qa/analysis/duplicates \
  -H "Authorization: Bearer token-qa-manager" \
  -H "Content-Type: application/json" \
  -d '{
    "sprints": ["S510"]
  }'
```

**Example Response (200 OK):**

```json
{
  "input_count": 18,
  "groups": [
    {
      "items": [
        {
          "defect_id": 5,
          "description": "Cart total differs from final checkout total when shipping ZIP is changed late in flow.",
          "component": "checkout"
        },
        {
          "defect_id": 12,
          "description": "Checkout total recalculates, cart summary remains stale after address change.",
          "component": "checkout"
        }
      ],
      "confidence": 0.87,
      "rationale": "Repeated checkout issue signals; overlapping terms: checkout, total, change."
    },
    {
      "items": [
        {
          "defect_id": 7,
          "description": "Gateway timeout retry path creates a second order with same payment intent.",
          "component": "payment_gateway"
        },
        {
          "defect_id": 15,
          "description": "Duplicate order creation after payment retry on timeout.",
          "component": "payment_gateway"
        }
      ],
      "confidence": 0.92,
      "rationale": "Repeated payment_gateway defect pattern with similar reproduction context."
    }
  ]
}
```

**Confidence Interpretation:**

| Confidence | Label | Interpretation |
|------------|-------|-----------------|
| 0.90–0.99 | High | Likely duplicate; recommend merge |
| 0.75–0.89 | Medium | Possible duplicate; review before merge |
| 0.52–0.74 | Low | Weak signal; manual review needed |

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Only `qa_lead` or `qa_manager` can run analysis |

---

### GET /api/qa/reports/export.csv

**Description:** Export filtered defects as CSV report.

**Authentication:** Required (`qa_engineer`, `qa_lead`, `qa_manager`)

**Query Parameters:**

| Param | Type | Optional | Description |
|-------|------|----------|-------------|
| `sprints` | string | Yes | Comma-separated sprint IDs |
| `severity` | string | Yes | `critical`, `high`, `medium`, `low` |
| `component` | string | Yes | Component name |
| `status` | string | Yes | Defect status |
| `assignee` | string | Yes | Assignee name |

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/qa/reports/export.csv?sprints=S510&severity=high" \
  -H "Authorization: Bearer token-qa-manager" \
  -o qa_report.csv
```

**Example Response (200 OK):**

CSV file with columns:

```
defect_id,sprint_id,component,severity,status,resolution_reason,assignee,title,created_at
5,S510,checkout,high,investigating,,quinn,Tax total mismatch between cart and checkout - edge case (S510-5),2026-01-06T09:05:00.000000Z
7,S510,payment_gateway,high,open,,riley,Duplicate order creation after payment retry,2026-01-06T09:15:00.000000Z
```

---

## Data Schema

### Defect Record

| Field | Type | Description |
|-------|------|-------------|
| `defect_id` | integer | Unique identifier (PK) |
| `sprint_id` | string | Sprint ID (FK to sprints table) |
| `component` | string | Component/service name |
| `severity` | string | `critical`, `high`, `medium`, `low` |
| `status` | string | Triage status (see status values below) |
| `resolution_reason` | string | Why it was resolved (`fixed`, `follow_up_created`, `not_reproducible`), or `null` |
| `assignee` | string | QA engineer name or `null` |
| `reporter` | string | Who reported it (`qa_automation`, `manual_qa`, `support_triage`, etc.) |
| `title` | string | Defect title |
| `description` | string | Full description of the issue |
| `repro_steps` | string | Steps to reproduce |
| `expected_result` | string | Expected behavior |
| `actual_result` | string | Observed behavior |
| `customer_impact` | string | Business/customer impact |
| `tags` | string | Comma-separated tags (e.g., `checkout,payment,race_condition`) |
| `created_at` | string | ISO 8601 timestamp (UTC) |
| `updated_at` | string | ISO 8601 timestamp (UTC) |
| `canonical_defect_id` | integer | If merged, points to the canonical defect (null otherwise) |

### Defect Status Values

| Status | Meaning |
|--------|---------|
| `open` | New, not yet triaged |
| `investigating` | QA actively investigating |
| `escalated` | Escalated to engineering/platform team |
| `resolved` | Fixed or completed (requires `resolution_reason`) |
| `duplicate_pending` | Suspected duplicate, awaiting approval |
| `duplicate_merged` | Confirmed duplicate, merged into canonical |

### Sprint Record

| Field | Type | Description |
|-------|------|-------------|
| `sprint_id` | string | Sprint ID (PK) |
| `start_date` | string | ISO 8601 date (YYYY-MM-DD) |
| `end_date` | string | ISO 8601 date (YYYY-MM-DD) |
| `release_label` | string | Release version (e.g., `2026.R1`) |
| `modules_deployed` | string | Comma-separated modules deployed in sprint |
| `deploy_success_count` | integer | Number of successful deploys |
| `deploy_error_count` | integer | Number of deployment errors |

### Triage Note Record

| Field | Type | Description |
|-------|------|-------------|
| `note_id` | integer | Unique identifier (PK) |
| `defect_id` | integer | Defect ID (FK) |
| `author` | string | Who wrote the note (engineer name) |
| `note_body` | string | Note content |
| `created_at` | string | ISO 8601 timestamp (UTC) |

---

## RBAC Restrictions

| Action | Allowed Roles |
|--------|---------------|
| List sprints/defects | All QA roles |
| Add notes | All QA roles |
| Update own/unassigned defects | `qa_engineer` |
| Update any defect status | `qa_lead`, `qa_manager` |
| Assign/reassign defects | `qa_lead`, `qa_manager` |
| Set `duplicate_merged` status | `qa_lead`, `qa_manager` |
| Run clustering/duplicate analysis | `qa_lead`, `qa_manager` |
| Export CSV | All QA roles |

---

## See Also

- [Master API Reference](../API.md)
- [Log Analyzer API](log-analyzer.md)
- [Support Tickets API](support-tickets.md)
- [QA Analyzer Frontend](../../web/app/qa-analyzer/sprint/) (Next.js UI)
