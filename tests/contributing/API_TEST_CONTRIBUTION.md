# API & Test Contribution Guidelines

**Scope:** This guide applies to all API endpoints and unit tests in the Internal Tools Sandbox  
**Effective:** May 2026  
**Last Updated:** May 2026

---

## Overview

This document establishes standards for adding or modifying APIs and unit tests. Documentation must evolve alongside code to maintain accuracy and serve as the source of truth for the platform.

---

## Core Principles

1. **Documentation First:** Any new or modified API requires updated documentation before merging
2. **RBAC by Default:** All new endpoints must implement and document role-based access control
3. **Test Coverage:** New endpoints require corresponding unit tests (happy path + RBAC denials)
4. **Single Source of Truth:** API docs + test docs are the canonical reference for behavior

---

## Checklist: Adding a New API Endpoint

### Step 1: Design & Specification

- [ ] Define endpoint path, HTTP method, parameters
- [ ] Identify required roles (RBAC)
- [ ] Determine request/response schemas
- [ ] List error cases and HTTP status codes
- [ ] Plan security implications

### Step 2: Implement Endpoint in `services/api.py`

- [ ] Add function with proper RBAC check (`role: str = Depends(get_role)`)
- [ ] Validate input parameters
- [ ] Handle errors with appropriate HTTP status codes
- [ ] Log action to audit trail (if state-changing)
- [ ] Return consistent JSON response format

**Example:**
```python
@app.patch("/api/qa/defects/{defect_id}/status")
def update_qa_status(
    defect_id: int,
    req: StatusRequest,
    role: str = Depends(get_role),
) -> dict:
    # 1. RBAC check
    if role not in QA_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")
    
    # 2. Validate input
    if req.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # 3. Business logic
    ...
    
    # 4. Audit log (if modifying state)
    log_action(actor=..., action="qa_status_updated", ...)
    
    # 5. Return response
    return {"success": True, "data": ...}
```

### Step 3: Add Unit Tests

**Minimum required tests:**

1. **Happy Path** — Authorized user succeeds
2. **RBAC Denial** — Unauthorized role gets 403
3. **Error Case** — Invalid input gets 400

**Add to `tests/test_api_smoke.py`:**

```python
def test_new_endpoint_happy_path(self) -> None:
    """Verify authorized users can call new endpoint."""
    response = self.client.get(
        "/api/new/endpoint",
        headers={"Authorization": "Bearer token-authorized"},
    )
    self.assertEqual(response.status_code, 200)
    # Additional assertions...

def test_new_endpoint_rbac_denied(self) -> None:
    """Verify unauthorized role is denied."""
    response = self.client.get(
        "/api/new/endpoint",
        headers={"Authorization": "Bearer token-unauthorized"},
    )
    self.assertEqual(response.status_code, 403)

def test_new_endpoint_invalid_input(self) -> None:
    """Verify invalid input returns 400."""
    response = self.client.post(
        "/api/new/endpoint",
        headers={"Authorization": "Bearer token-authorized"},
        json={"invalid_field": "value"},
    )
    self.assertEqual(response.status_code, 400)
```

### Step 4: Update API Documentation

**If adding a new tool endpoint (e.g., new `/api/reports/*`):**

1. Create new file: `docs/api/<tool-name>.md`
2. Include sections:
   - Overview
   - Endpoints (all methods for that tool)
   - Data schema
   - RBAC restrictions
   - Example requests/responses

**If adding endpoint to existing tool:**

1. Update relevant file: `docs/api/<tool>.md`
2. Add to endpoints section
3. Update "Endpoints Summary" in `docs/API.md`

**Template:**

```markdown
### GET /api/new/endpoint

**Description:** Clear, concise description of what this does.

**Authentication:** Required (`role1`, `role2`)

**Query/Path Parameters:**

| Param | Type | Optional | Description |
|-------|------|----------|-------------|
| `param_name` | string | No | Description |

**Request Body:** (if POST/PATCH)

```json
{
  "field": "value"
}
```

**Example Request:**

```bash
curl -X GET http://localhost:8000/api/new/endpoint \
  -H "Authorization: Bearer token-authorized"
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "data": {...}
}
```

**Error Cases:**

| Status | Reason |
|--------|--------|
| 403 | Unauthorized role |
| 400 | Invalid input |
```

### Step 5: Update Test Overview Documentation

In `tests/unit-tests/test_api_smoke_overview.md`:

- [ ] Add test to "Test Catalog" section
- [ ] Include test name, purpose, category
- [ ] Document what it tests and why it matters
- [ ] Include code snippet
- [ ] List assertions and expected results
- [ ] Update "Test Coverage Matrix" section

In `tests/TEST_OVERVIEW.md`:

- [ ] Update test summary table
- [ ] Update test count (e.g., "Total Tests: 12" if adding one test)

### Step 6: Create PR and Verify

Before submitting PR:

- [ ] `python -m unittest discover -s tests -v` passes all tests
- [ ] `cd web; npm run build` succeeds (if UI changes)
- [ ] API docs validate (no broken links, consistent schemas)
- [ ] Commit message follows convention: `feat: add new endpoint` or `docs: update API docs`

---

## Checklist: Modifying an Existing Endpoint

### If Changing Behavior

- [ ] Update API documentation to reflect new behavior
- [ ] Update test expectations if response changes
- [ ] Add new test for new behavior (if applicable)
- [ ] Verify RBAC still enforced correctly
- [ ] Run full test suite

### If Changing Request/Response Schema

- [ ] Update all references in `docs/api/*.md`
- [ ] Update `web/lib/types.ts` if frontend-facing
- [ ] Update `web/lib/api.ts` if frontend-facing
- [ ] Update test assertions
- [ ] Document breaking changes (if backward incompatible)

### If Changing RBAC

- [ ] Update RBAC section in API docs
- [ ] Add/modify RBAC test cases
- [ ] Test that previously allowed roles are still allowed
- [ ] Test that newly restricted roles are denied
- [ ] Document migration path (if roles added/removed)

---

## Checklist: Creating a New Tool

### Phase 1: Planning

- [ ] Define tool purpose and user workflows
- [ ] List all required endpoints
- [ ] Design request/response schemas
- [ ] Plan RBAC model (who can do what)
- [ ] Create tool RFC / spec document

### Phase 2: Backend Implementation

- [ ] Implement `services/api.py` endpoints
- [ ] Implement SQLite schema (if data storage needed)
- [ ] Add seed script `scripts/seed_<tool>.py`
- [ ] Write unit tests in `tests/test_api_smoke.py`
- [ ] Create API documentation: `docs/api/<tool>.md`

### Phase 3: Frontend Implementation

- [ ] Create Next.js page(s) under `web/app/<tool>/`
- [ ] Implement type definitions in `web/lib/types.ts`
- [ ] Add API client methods in `web/lib/api.ts`
- [ ] Add auth role checks in page components
- [ ] Test full end-to-end workflow

### Phase 4: Documentation

- [ ] Update master API docs: `docs/API.md`
- [ ] Update test overview: `tests/TEST_OVERVIEW.md`
- [ ] Update root `README.md` (status, run instructions)
- [ ] Update `web/README.md` (frontend details)
- [ ] Create `app/<tool>/README.md` (tool-specific guidance)

### Phase 5: Validation & Release

- [ ] All tests pass
- [ ] Web build succeeds
- [ ] Manual testing complete
- [ ] Documentation reviewed and approved
- [ ] Create release commit with Phase 1/2/etc. tag

---

## Documentation Standards

### API Documentation

- **Audience:** Developers integrating with the API
- **Format:** Markdown with tables, code blocks, curl examples
- **Completeness:** Every endpoint must have:
  - Description (1-2 sentences)
  - Authentication requirements (roles)
  - Parameters with types and constraints
  - Example request and response
  - Error cases with HTTP status codes
  - RBAC restrictions

### Test Documentation

- **Audience:** QA engineers, developers maintaining tests
- **Format:** Markdown with code snippets, tables
- **Completeness:** Every test must have:
  - Purpose (what does it validate?)
  - Category (feature, RBAC, error handling, etc.)
  - Why it matters (business/security justification)
  - Code snippet
  - Assertions and expected results

### Code Comments

- **Inline comments:** Explain *why*, not *what* (code is self-documenting)
- **Function docstrings:** One-line purpose, then detailed description
- **RBAC checks:** Always include comment explaining the rule

**Example:**
```python
@app.patch("/api/qa/defects/{defect_id}/status")
def update_qa_status(...) -> dict:
    """
    Update defect status.
    
    RBAC: Only qa_engineer, qa_lead, qa_manager can update status.
    Ownership: qa_engineer can only update unassigned or self-assigned defects.
    """
    # Enforce base RBAC: role must be QA team
    if role not in QA_ROLES:
        raise HTTPException(status_code=403, detail="QA role required")
    
    # Enforce duplicate merge restriction: only leads/managers
    if req.status == "duplicate_merged" and role not in ("qa_lead", "qa_manager"):
        raise HTTPException(status_code=403, detail="Only QA lead/manager can merge duplicates")
    
    # ...
```

---

## Review Checklist

**Before approving PR:**

- [ ] API code implements correct RBAC
- [ ] API documentation is complete and accurate
- [ ] Unit tests cover happy path and RBAC denials
- [ ] Test documentation is clear and detailed
- [ ] All tests pass (`python -m unittest discover -s tests -v`)
- [ ] Web build passes (`cd web && npm run build`)
- [ ] No documentation conflicts or missing links
- [ ] Commit message is clear and descriptive

---

## Common Mistakes to Avoid

1. **Incomplete RBAC:** Always check role, not just token presence
2. **Missing error handling:** Anticipate invalid inputs, missing records
3. **Undocumented changes:** Never modify behavior without updating docs
4. **Tests without assertions:** Make sure assertions validate actual behavior
5. **Inconsistent naming:** Use same terminology across docs and code
6. **Forgetting audit logging:** State-changing endpoints should log to audit trail
7. **PII exposure:** Always check if endpoint returns sensitive data
8. **Broken links in docs:** Use relative paths, verify before committing

---

## Example: Complete Workflow

### Scenario: Add "duplicate_detection_run" endpoint

**1. Specification:**
- Endpoint: `POST /api/qa/analysis/duplicates`
- Roles: `qa_lead`, `qa_manager`
- Input: `{"sprints": ["S510", "S511"]}`
- Output: `{"groups": [...], "input_count": N}`

**2. Implement:**
```python
@app.post("/api/qa/analysis/duplicates")
def run_qa_duplicate_detection(req, role: str = Depends(get_role)):
    if role not in ("qa_lead", "qa_manager"):
        raise HTTPException(status_code=403, ...)
    # Business logic...
```

**3. Test:**
```python
def test_qa_duplicate_detection(self):
    response = self.client.post("/api/qa/analysis/duplicates", ...)
    self.assertEqual(response.status_code, 200)
    self.assertIn("groups", response.json())

def test_qa_duplicate_detection_rbac_denied(self):
    response = self.client.post("/api/qa/analysis/duplicates", 
                                headers={"Authorization": "Bearer token-qa"})
    self.assertEqual(response.status_code, 403)
```

**4. Document:**
```markdown
### POST /api/qa/analysis/duplicates

**Description:** Run AI-powered duplicate detection on defects.

**Authentication:** Required (`qa_lead`, `qa_manager`)

**Request Body:**
```json
{"sprints": ["S510"]}
```

**Example Response:**
```json
{"groups": [...], "input_count": 18}
```

**Error Cases:**
| Status | Reason |
|--------|--------|
| 403 | Only qa_lead or qa_manager can run analysis |
```

**5. Update overviews:**
- Add to `tests/TEST_OVERVIEW.md` summary table
- Add to `docs/api/qa-analyzer.md` endpoints section
- Add test details to `tests/unit-tests/test_api_smoke_overview.md`

**6. PR:**
- Commit with message: `feat: add duplicate detection analysis endpoint`
- Verify tests pass
- Request review

---

## Contacts & Questions

For questions about this workflow:
- Review existing code in `services/api.py`
- Check API docs in `docs/api/`
- See test examples in `tests/test_api_smoke.py`
- Refer to similar implementations for patterns

---

## Version History

| Date | Change |
|------|--------|
| May 2026 | Initial contribution guidelines created |

