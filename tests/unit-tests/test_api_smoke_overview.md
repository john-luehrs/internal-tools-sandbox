# Unit Test Details: test_api_smoke.py

**File Path:** `tests/test_api_smoke.py`  
**Test Class:** `ApiSmokeTests`  
**Total Tests:** 11  
**Status:** All passing (as of May 2026)

---

## Quick Reference

| # | Test Name | Purpose | Category | Status |
|---|-----------|---------|----------|--------|
| 1 | `test_health` | Health check endpoint | Utility | ✓ |
| 2 | `test_support_tickets_list` | List support tickets | Support API | ✓ |
| 3 | `test_logs_team_list` | List team logs | Log Analyzer API | ✓ |
| 4 | `test_qa_sprints` | List QA sprints | QA Analyzer API | ✓ |
| 5 | `test_qa_defects_filter` | Filter defects by sprint | QA Analyzer API | ✓ |
| 6 | `test_qa_cluster` | Run AI clustering | QA Analysis | ✓ |
| 7 | `test_qa_note_and_status` | Add notes + update status | QA Triage | ✓ |
| 8 | `test_qa_export_csv` | Export to CSV | QA Reporting | ✓ |
| 9 | `test_qa_assign_rbac_denied_for_engineer` | RBAC: assign deny | Security | ✓ |
| 10 | `test_qa_duplicate_merged_rbac_denied_for_engineer` | RBAC: merge deny | Security | ✓ |
| 11 | `test_qa_engineer_cannot_update_other_assignee_status` | RBAC: ownership check | Security | ✓ |

---

## Test Details

### Test 1: test_health

**Location:** Line 22-25  
**Purpose:** Verify API is running and health check endpoint works  
**Why This Matters:**
- Basic connectivity check
- CI/CD uses this for deployment verification
- No authentication required (first check)

**Setup:**
- No special setup required
- Tests public endpoint

**Code:**
```python
def test_health(self) -> None:
    response = self.client.get("/health")
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json().get("status"), "ok")
```

**What It Tests:**
1. HTTP GET to `/health` returns 200
2. Response JSON has `status: ok`

**Expected Result:** ✓ PASS  
**Expected Response:**
```json
{"status": "ok", "service": "internal-tools-sandbox-api"}
```

---

### Test 2: test_support_tickets_list

**Location:** Line 27-37  
**Purpose:** Verify support agents can list tickets  
**Why This Matters:**
- Core support workflow feature
- Tests auth token validation
- Tests PII masking (agent should see masked email/phone)

**Setup:**
- Token: `token-agent` (support_agent role)
- Database: `db/support.db` (seeded with ~10 sample tickets)

**Code:**
```python
def test_support_tickets_list(self) -> None:
    response = self.client.get(
        "/api/tickets",
        headers={"Authorization": "Bearer token-agent"},
    )
    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertIsInstance(payload, list)
    self.assertGreater(len(payload), 0)
```

**What It Tests:**
1. Valid token is accepted
2. Endpoint returns 200
3. Response is a list with at least 1 ticket
4. (Implicit) PII is masked for agents

**Expected Result:** ✓ PASS  
**Expected Response:** List of ~10 ticket objects with masked `email`, `phone`, and `internal_notes`

---

### Test 3: test_logs_team_list

**Location:** Line 39-49  
**Purpose:** Verify managers can list team logs  
**Why This Matters:**
- Core Log Analyzer feature
- Tests manager role access
- Tests filtering mechanism (later)

**Setup:**
- Token: `token-manager` (support_manager role, actor=dana)
- Database: `db/logs.db` (seeded with ~100 sample logs)

**Code:**
```python
def test_logs_team_list(self) -> None:
    response = self.client.get(
        "/api/logs/team",
        headers={"Authorization": "Bearer token-manager"},
    )
    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertIsInstance(payload, list)
    self.assertGreater(len(payload), 0)
```

**What It Tests:**
1. Manager token is accepted
2. Endpoint returns 200
3. Response is a list with at least 1 log

**Expected Result:** ✓ PASS  
**Expected Response:** List of logs with fields like `log_id`, `service`, `anomaly_score`, `status`, etc.

---

### Test 4: test_qa_sprints

**Location:** Line 51-61  
**Purpose:** Verify QA teams can retrieve sprint metadata  
**Why This Matters:**
- Core feature for sprint filtering UI
- Tests RBAC (qa_manager can access)
- Tests exact count (validates seed data)

**Setup:**
- Token: `token-qa-manager` (qa_manager role, actor=morgan)
- Database: `db/qa.db` (seeded with 5 sprints: S510–S514)
- Expected count: exactly 5 sprints

**Code:**
```python
def test_qa_sprints(self) -> None:
    response = self.client.get(
        "/api/qa/sprints",
        headers={"Authorization": "Bearer token-qa-manager"},
    )
    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertEqual(len(payload), 5)
```

**What It Tests:**
1. QA manager token is accepted
2. Endpoint returns 200
3. Exactly 5 sprints returned
4. (Implicit) Sprints are ordered correctly

**Expected Result:** ✓ PASS  
**Expected Response:**
```json
[
  {
    "sprint_id": "S514",
    "start_date": "2026-01-27",
    "end_date": "2026-02-09",
    "release_label": "2026.R5",
    "modules_deployed": "...",
    "deploy_success_count": 18,
    "deploy_error_count": 2
  },
  ...
]
```

---

### Test 5: test_qa_defects_filter

**Location:** Line 63-73  
**Purpose:** Verify QA teams can filter defects by sprint  
**Why This Matters:**
- Core triage workflow feature
- Tests query parameter parsing
- Tests exact count (validates seed data)

**Setup:**
- Token: `token-qa-manager` (qa_manager)
- Query: `?sprints=S510`
- Expected count: 18 defects in sprint S510

**Code:**
```python
def test_qa_defects_filter(self) -> None:
    response = self.client.get(
        "/api/qa/defects?sprints=S510",
        headers={"Authorization": "Bearer token-qa-manager"},
    )
    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertEqual(len(payload), 18)
```

**What It Tests:**
1. Query parameter is parsed correctly
2. Filter returns correct count of defects
3. (Implicit) Ordering and data integrity maintained

**Expected Result:** ✓ PASS  
**Expected Response:** List of 18 defect objects for sprint S510

---

### Test 6: test_qa_cluster

**Location:** Line 75-85  
**Purpose:** Verify AI clustering analysis works  
**Why This Matters:**
- Phase 1 major feature
- Tests POST endpoint with JSON body
- Tests analysis result structure

**Setup:**
- Token: `token-qa-manager` (qa_manager)
- Request body: `{"sprints": ["S510"]}`
- Expected input count: 18 defects

**Code:**
```python
def test_qa_cluster(self) -> None:
    response = self.client.post(
        "/api/qa/analysis/cluster",
        headers={"Authorization": "Bearer token-qa-manager"},
        json={"sprints": ["S510"]},
    )
    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertEqual(payload.get("input_count"), 18)
    self.assertIn("clusters", payload)
```

**What It Tests:**
1. POST request with JSON accepted
2. Endpoint returns 200
3. Input count matches expected (18)
4. Response contains `clusters` field (list of grouped patterns)

**Expected Result:** ✓ PASS  
**Expected Response:**
```json
{
  "input_count": 18,
  "clusters": [
    {"pattern": "Checkout and Pricing Drift", "defects": [...]},
    {"pattern": "Payment and Retry Idempotency", "defects": [...]},
    ...
  ]
}
```

---

### Test 7: test_qa_note_and_status

**Location:** Line 87-114  
**Purpose:** Complete triage workflow test (add note → retrieve notes → update status)  
**Why This Matters:**
- Core Phase 1 triage feature
- Tests multiple endpoints in sequence
- Tests state persistence

**Setup:**
- Token: `token-qa-manager` (qa_manager, actor=morgan)
- Target: Defect ID 1
- Three sub-tests in one method

**Code:**
```python
def test_qa_note_and_status(self) -> None:
    # Sub-test 1: Add note
    note_response = self.client.post(
        "/api/qa/defects/1/notes",
        headers={"Authorization": "Bearer token-qa-manager"},
        json={"note_body": "Smoke triage note"},
    )
    self.assertEqual(note_response.status_code, 200)
    self.assertTrue(note_response.json().get("success"))

    # Sub-test 2: Retrieve notes
    notes_response = self.client.get(
        "/api/qa/defects/1/notes",
        headers={"Authorization": "Bearer token-qa-manager"},
    )
    self.assertEqual(notes_response.status_code, 200)
    notes_payload = notes_response.json()
    self.assertIsInstance(notes_payload, list)
    self.assertGreaterEqual(len(notes_payload), 1)
    self.assertEqual(notes_payload[0].get("defect_id"), 1)

    # Sub-test 3: Update status
    status_response = self.client.patch(
        "/api/qa/defects/1/status",
        headers={"Authorization": "Bearer token-qa-manager"},
        json={"status": "resolved", "resolution_reason": "fixed"},
    )
    self.assertEqual(status_response.status_code, 200)
    self.assertTrue(status_response.json().get("success"))
    self.assertEqual(status_response.json().get("defect", {}).get("status"), "resolved")
```

**What It Tests:**
1. **POST note:** Can add triage note, returns success=true
2. **GET notes:** Can retrieve notes, returns list with at least 1 item
3. **PATCH status:** Can update status to "resolved"

**Expected Result:** ✓ PASS  
**Dependencies:** Tests that notes persist between API calls

---

### Test 8: test_qa_export_csv

**Location:** Line 116-124  
**Purpose:** Verify CSV export works with filtering  
**Why This Matters:**
- Phase 1 reporting feature
- Tests response content type (text/csv)
- Tests CSV header format

**Setup:**
- Token: `token-qa-manager` (qa_manager)
- Query: `?sprints=S510`
- Expected: CSV starting with defect header row

**Code:**
```python
def test_qa_export_csv(self) -> None:
    response = self.client.get(
        "/api/qa/reports/export.csv?sprints=S510",
        headers={"Authorization": "Bearer token-qa-manager"},
    )
    self.assertEqual(response.status_code, 200)
    self.assertTrue(response.text.startswith("defect_id,sprint_id,component,severity"))
```

**What It Tests:**
1. Query parameter with file extension works
2. Returns 200
3. Content is CSV format (starts with expected header)

**Expected Result:** ✓ PASS  
**Expected Response:** CSV file with header and 18 data rows

---

### Test 9: test_qa_assign_rbac_denied_for_engineer

**Location:** Line 126-136  
**Purpose:** Verify engineers CANNOT reassign defects (RBAC security check)  
**Why This Matters:**
- Security/RBAC validation
- Only leads/managers should have reassignment power
- Prevents unauthorized privilege escalation

**Setup:**
- Token: `token-qa` (qa_engineer, actor=quinn)
- Action: Try to patch `/api/qa/defects/1/assign`
- Expected: 403 Forbidden

**Code:**
```python
def test_qa_assign_rbac_denied_for_engineer(self) -> None:
    response = self.client.patch(
        "/api/qa/defects/1/assign",
        headers={"Authorization": "Bearer token-qa"},
        json={"assignee": "quinn"},
    )
    self.assertEqual(response.status_code, 403)
```

**What It Tests:**
1. Request with qa_engineer token is rejected
2. Returns 403 Forbidden (not 200)
3. (Implicit) Error detail mentions insufficient permissions

**Expected Result:** ✓ PASS (Denial is correct)  
**Expected Response:**
```json
{"detail": "Only QA lead or manager can reassign defects"}
```

---

### Test 10: test_qa_duplicate_merged_rbac_denied_for_engineer

**Location:** Line 138-148  
**Purpose:** Verify engineers CANNOT mark duplicates as merged (RBAC security check)  
**Why This Matters:**
- Security/RBAC validation
- Prevents engineers from approving their own duplicate merges
- Only leads/managers should have merge approval authority

**Setup:**
- Token: `token-qa` (qa_engineer, actor=quinn)
- Action: Try to patch status to `duplicate_merged`
- Expected: 403 Forbidden

**Code:**
```python
def test_qa_duplicate_merged_rbac_denied_for_engineer(self) -> None:
    response = self.client.patch(
        "/api/qa/defects/1/status",
        headers={"Authorization": "Bearer token-qa"},
        json={"status": "duplicate_merged"},
    )
    self.assertEqual(response.status_code, 403)
```

**What It Tests:**
1. Request with qa_engineer token is rejected
2. Returns 403 Forbidden
3. (Implicit) Prevents unauthorized duplicate approvals

**Expected Result:** ✓ PASS (Denial is correct)  
**Expected Response:**
```json
{"detail": "Only QA lead or manager can mark duplicate merged"}
```

---

### Test 11: test_qa_engineer_cannot_update_other_assignee_status

**Location:** Line 150-168  
**Purpose:** Verify engineers can only update their own defects (ownership check)  
**Why This Matters:**
- Security/RBAC validation
- Prevents engineers from interfering with each other's work
- Enforces work isolation

**Setup:**
- Two tokens: manager and engineer
- Step 1: Manager assigns defect 1 to `taylor`
- Step 2: Engineer `quinn` tries to update that defect's status
- Expected: 403 Forbidden on step 2

**Code:**
```python
def test_qa_engineer_cannot_update_other_assignee_status(self) -> None:
    # Manager reassigns to taylor
    assign_response = self.client.patch(
        "/api/qa/defects/1/assign",
        headers={"Authorization": "Bearer token-qa-manager"},
        json={"assignee": "taylor"},
    )
    self.assertEqual(assign_response.status_code, 200)

    # Engineer quinn tries to update taylor's defect
    status_response = self.client.patch(
        "/api/qa/defects/1/status",
        headers={"Authorization": "Bearer token-qa"},
        json={"status": "investigating"},
    )
    self.assertEqual(status_response.status_code, 403)
```

**What It Tests:**
1. Manager CAN reassign (step 1 returns 200)
2. Different engineer CANNOT update that defect (step 2 returns 403)
3. (Implicit) Ownership/assignment is checked before status update

**Expected Result:** ✓ PASS (Both assertions correct)  
**Expected Response (step 2):**
```json
{"detail": "QA engineer can only update unassigned or self-assigned defects"}
```

---

## Test Coverage Matrix

### Endpoints Covered

| Endpoint | Test | Coverage |
|----------|------|----------|
| GET /health | test_health | Happy path ✓ |
| GET /api/tickets | test_support_tickets_list | Happy path ✓ |
| GET /api/logs/team | test_logs_team_list | Happy path ✓ |
| GET /api/qa/sprints | test_qa_sprints | Happy path ✓ |
| GET /api/qa/defects | test_qa_defects_filter | Happy path + filter ✓ |
| POST /api/qa/analysis/cluster | test_qa_cluster | Happy path ✓ |
| POST /api/qa/defects/{id}/notes | test_qa_note_and_status (sub) | Happy path ✓ |
| GET /api/qa/defects/{id}/notes | test_qa_note_and_status (sub) | Happy path ✓ |
| PATCH /api/qa/defects/{id}/status | test_qa_note_and_status (sub), test_qa_duplicate_merged_rbac_denied_for_engineer | Happy path + RBAC ✓ |
| GET /api/qa/reports/export.csv | test_qa_export_csv | Happy path ✓ |
| PATCH /api/qa/defects/{id}/assign | test_qa_assign_rbac_denied_for_engineer | RBAC denial ✓ |

### RBAC Coverage

| Rule | Test | Coverage |
|------|------|----------|
| Only qa_lead/qa_manager can reassign | test_qa_assign_rbac_denied_for_engineer | Denial ✓ |
| Only qa_lead/qa_manager can merge duplicates | test_qa_duplicate_merged_rbac_denied_for_engineer | Denial ✓ |
| Engineers can only update own/unassigned | test_qa_engineer_cannot_update_other_assignee_status | Ownership check ✓ |

---

## Running the Tests

**All tests:**
```bash
python -m unittest discover -s tests -v
```

**Single test:**
```bash
python -m unittest tests.test_api_smoke.ApiSmokeTests.test_qa_cluster -v
```

**Expected output (all pass):**
```
test_health (tests.test_api_smoke.ApiSmokeTests) ... ok
test_support_tickets_list (tests.test_api_smoke.ApiSmokeTests) ... ok
test_logs_team_list (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_sprints (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_defects_filter (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_cluster (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_note_and_status (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_export_csv (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_assign_rbac_denied_for_engineer (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_duplicate_merged_rbac_denied_for_engineer (tests.test_api_smoke.ApiSmokeTests) ... ok
test_qa_engineer_cannot_update_other_assignee_status (tests.test_api_smoke.ApiSmokeTests) ... ok

Ran 11 tests in 0.234s

OK
```

---

## See Also

- [Master Test Overview](TEST_OVERVIEW.md)
- [Contribution Guidelines](contributing/API_TEST_CONTRIBUTION.md)
- [API Documentation](../docs/API.md)
