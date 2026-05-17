# Unit Test Overview

**Module:** `tests/test_api_smoke.py`  
**Framework:** Python `unittest`  
**Test Database:** SQLite (reseeded for each test run)  
**Last Updated:** May 2026

---

## Purpose

The smoke test suite validates core API functionality, RBAC enforcement, and data integrity. Tests are designed to be:

- **Deterministic:** Reseed databases before each run
- **Fast:** No external dependencies (mock data only)
- **Comprehensive:** Cover happy paths, RBAC denials, and edge cases
- **Maintainable:** Document why each test matters

Tests use `TestClient` from FastAPI to call endpoints directly without HTTP overhead.

---

## Running Tests

### Run All Tests

```bash
cd /path/to/sandbox
python -m unittest discover -s tests -v
```

Expected output:
```
test_health (test_api_smoke.ApiSmokeTests) ... ok
test_support_tickets_list (test_api_smoke.ApiSmokeTests) ... ok
...
Ran 11 tests in 0.234s
OK
```

### Run Specific Test

```bash
python -m unittest tests.test_api_smoke.ApiSmokeTests.test_qa_cluster -v
```

### Run with Coverage (optional)

```bash
pip install coverage
coverage run -m unittest discover -s tests -v
coverage report -m
```

---

## Test Suite: ApiSmokeTests

### Test Setup

**`setUpClass()` method:**
- Reseeds all databases: `seed_support()`, `seed_logs()`, `seed_qa()`
- Creates `TestClient` pointing to FastAPI app
- Runs once before all tests

**Database State:**
- Support tickets: ~10 sample tickets
- Logs: ~100 sample logs with various anomaly scores
- QA Defects: 103 defects across 5 sprints (S510–S514)

---

## Test Catalog

### 1. test_health

**Purpose:** Verify API health check endpoint (no auth required)  
**Category:** Utility  
**Why:** Baseline connectivity test; CI/CD expects `/health` to be available

**Code:**
```python
def test_health(self) -> None:
    response = self.client.get("/health")
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json().get("status"), "ok")
```

**Assertions:**
- HTTP status is 200
- Response contains `{"status": "ok", ...}`

**Expected Result:** ✓ PASS

---

### 2. test_support_tickets_list

**Purpose:** Validate support ticket listing for authorized users  
**Category:** Support API — Happy Path  
**Why:** Core feature; agents must be able to list and filter tickets

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

**Assertions:**
- HTTP status is 200
- Response is a list
- List contains at least 1 ticket

**Auth Token:** `token-agent` (support_agent role)

**Expected Result:** ✓ PASS

---

### 3. test_logs_team_list

**Purpose:** Validate log listing for ops/manager users  
**Category:** Log Analyzer API — Happy Path  
**Why:** Core feature; managers must be able to view team workload

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

**Assertions:**
- HTTP status is 200
- Response is a list
- List contains at least 1 log

**Auth Token:** `token-manager` (support_manager role, actor=dana)

**Expected Result:** ✓ PASS

---

### 4. test_qa_sprints

**Purpose:** Validate QA sprint metadata retrieval  
**Category:** QA Analyzer API — Happy Path  
**Why:** Core feature; QA teams must be able to list sprints for filtering

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

**Assertions:**
- HTTP status is 200
- Response is a list of exactly 5 sprints (S510–S514)

**Auth Token:** `token-qa-manager` (qa_manager role, actor=morgan)

**Data:** Sprints seeded in `scripts/seed_qa.py`

**Expected Result:** ✓ PASS

---

### 5. test_qa_defects_filter

**Purpose:** Validate QA defect filtering by sprint  
**Category:** QA Analyzer API — Happy Path & Filtering  
**Why:** Critical feature; filtering is core to defect triage workflow

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

**Assertions:**
- HTTP status is 200
- Sprint S510 contains exactly 18 defects (seeded)

**Parameters:** `sprints=S510` (comma-separated list of sprint IDs)

**Expected Result:** ✓ PASS

---

### 6. test_qa_cluster

**Purpose:** Validate AI clustering on defect descriptions  
**Category:** QA Analyzer API — Analysis Feature  
**Why:** Phase 1 feature; clustering reduces manual review time

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

**Assertions:**
- HTTP status is 200
- Input count matches defect count (18 for S510)
- Response includes `clusters` field (list of grouped patterns)

**RBAC:** Only `qa_lead` and `qa_manager` can run clustering

**Expected Result:** ✓ PASS

---

### 7. test_qa_note_and_status

**Purpose:** Comprehensive test of triage note creation, retrieval, and status update  
**Category:** QA Analyzer API — Triage Workflow  
**Why:** Phase 1 core feature; engineers need to add notes and update status

**Code:**
```python
def test_qa_note_and_status(self) -> None:
    # 1. Add note to defect
    note_response = self.client.post(
        "/api/qa/defects/1/notes",
        headers={"Authorization": "Bearer token-qa-manager"},
        json={"note_body": "Smoke triage note"},
    )
    self.assertEqual(note_response.status_code, 200)
    self.assertTrue(note_response.json().get("success"))

    # 2. Retrieve notes
    notes_response = self.client.get(
        "/api/qa/defects/1/notes",
        headers={"Authorization": "Bearer token-qa-manager"},
    )
    self.assertEqual(notes_response.status_code, 200)
    notes_payload = notes_response.json()
    self.assertIsInstance(notes_payload, list)
    self.assertGreaterEqual(len(notes_payload), 1)
    self.assertEqual(notes_payload[0].get("defect_id"), 1)

    # 3. Update status
    status_response = self.client.patch(
        "/api/qa/defects/1/status",
        headers={"Authorization": "Bearer token-qa-manager"},
        json={"status": "resolved", "resolution_reason": "fixed"},
    )
    self.assertEqual(status_response.status_code, 200)
    self.assertTrue(status_response.json().get("success"))
    self.assertEqual(status_response.json().get("defect", {}).get("status"), "resolved")
```

**Assertions:**
- POST note succeeds, returns success=true
- GET notes returns list with at least 1 note
- Note's defect_id matches requested defect_id
- PATCH status succeeds and status changes to "resolved"

**Why:** Tests the complete triage workflow (add note → retrieve notes → update status)

**Expected Result:** ✓ PASS

---

### 8. test_qa_export_csv

**Purpose:** Validate CSV export with filtering  
**Category:** QA Analyzer API — Reporting  
**Why:** Phase 1 feature; CSV export enables offline analysis and sharing

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

**Assertions:**
- HTTP status is 200
- Response content type is text/csv (or compatible)
- CSV starts with expected header row

**Parameters:** `sprints=S510` filters to single sprint

**Expected Result:** ✓ PASS

---

### 9. test_qa_assign_rbac_denied_for_engineer

**Purpose:** Validate RBAC denial — engineers cannot reassign defects  
**Category:** RBAC / Security  
**Why:** Critical; only leads/managers should reassign work

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

**Assertions:**
- HTTP status is 403 (Forbidden)

**Auth Token:** `token-qa` (qa_engineer, actor=quinn)

**Expected Behavior:** Request denied

**Expected Result:** ✓ PASS

---

### 10. test_qa_duplicate_merged_rbac_denied_for_engineer

**Purpose:** Validate RBAC denial — engineers cannot mark duplicates as merged  
**Category:** RBAC / Security  
**Why:** Critical; only leads/managers should approve duplicate merges

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

**Assertions:**
- HTTP status is 403 (Forbidden)

**Auth Token:** `token-qa` (qa_engineer, actor=quinn)

**Why:** Prevents engineers from approving duplicate merges without lead/manager review

**Expected Result:** ✓ PASS

---

### 11. test_qa_engineer_cannot_update_other_assignee_status

**Purpose:** Validate RBAC constraint — engineers can only update unassigned or self-assigned defects  
**Category:** RBAC / Security  
**Why:** Phase 1 feature; engineers should not be able to modify work assigned to others

**Code:**
```python
def test_qa_engineer_cannot_update_other_assignee_status(self) -> None:
    # 1. Assign defect to taylor (qa_manager reassigns)
    assign_response = self.client.patch(
        "/api/qa/defects/1/assign",
        headers={"Authorization": "Bearer token-qa-manager"},
        json={"assignee": "taylor"},
    )
    self.assertEqual(assign_response.status_code, 200)

    # 2. Try to update status as different engineer (quinn)
    status_response = self.client.patch(
        "/api/qa/defects/1/status",
        headers={"Authorization": "Bearer token-qa"},
        json={"status": "investigating"},
    )
    self.assertEqual(status_response.status_code, 403)
```

**Assertions:**
- First PATCH (assign) succeeds (200)
- Second PATCH (status as quinn, but assigned to taylor) denied (403)

**Auth Tokens:** 
- `token-qa-manager` (morgan, qa_manager) — can reassign
- `token-qa` (quinn, qa_engineer) — cannot update taylor's defect

**Why:** Tests ownership check in status update endpoint

**Expected Result:** ✓ PASS

---

## RBAC Test Strategy

Tests validate the following RBAC rules:

| Rule | Test |
|------|------|
| Only qa_lead/qa_manager can run clustering | test_qa_cluster (happy path), test_qa_assign_rbac_denied_for_engineer (implicit) |
| Only qa_lead/qa_manager can reassign | test_qa_assign_rbac_denied_for_engineer |
| Only qa_lead/qa_manager can merge duplicates | test_qa_duplicate_merged_rbac_denied_for_engineer |
| qa_engineer can only update own/unassigned | test_qa_engineer_cannot_update_other_assignee_status |

---

## Known Limitations

1. **No concurrent tests:** Tests are run sequentially (not parallel)
2. **Deterministic seed:** Same seed data every run; no randomization
3. **No integration tests:** Tests use TestClient; no actual HTTP server
4. **Limited coverage:** 11 tests cover core paths; edge cases and error handling could be expanded

---

## Future Test Coverage

Recommended additions:

1. **Error handling:** Invalid input, missing fields, boundary conditions
2. **Performance:** Response time for large datasets
3. **Concurrency:** Multiple simultaneous requests
4. **Migration:** Database schema changes and backfill
5. **Integration:** Full end-to-end flows (web UI → API → DB)

---

## Maintenance

### When Adding a New Endpoint

1. **Add test case** to `ApiSmokeTests`
2. **Test happy path** (200 response, correct data)
3. **Test RBAC** (403 for unauthorized roles)
4. **Test error cases** (400, 404, validation errors)
5. **Update this doc** (`TEST_OVERVIEW.md`)

### When Modifying an Endpoint

1. **Re-run tests** to ensure no regressions
2. **Update test expectations** if behavior changed
3. **Document changes** in test comments

---

## Contributing

See [API & Test Contribution Guidelines](contributing/API_TEST_CONTRIBUTION.md) for full workflow.
