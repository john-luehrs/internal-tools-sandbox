# Security Guidelines
This document outlines the security expectations for all tools, services, datasets, and workflows in the Internal Tools Sandbox.

These guidelines simulate real enterprise security practices used in internal tooling, DevEx, and AI‑assisted engineering environments.

---

# 🔐 1. Authentication & Authorization

## Role-Based Access Control (RBAC)
Each tool must implement RBAC appropriate to its domain.

**Common Roles:**
- `support_agent`  
- `support_manager`  
- `qa_engineer`  
- `ops_engineer`  
- `hr_admin`  
- `it_admin`  

**Requirements:**
- Restrict sensitive data by role  
- Mask restricted fields for unauthorized users  
- Enforce role checks at API and UI layers  

---

# 🔏 2. PII Handling

## PII Must Never:
- Appear in logs  
- Be sent to external AI APIs  
- Be included in error messages  
- Be stored in plaintext outside SQLite  

## PII Must:
- Be masked in UI when appropriate  
- Be scrubbed before AI processing  
- Be accessed only by authorized roles  

---

# 🧹 3. Logging & Audit Trails

## Logs Must:
- Exclude PII and restricted fields  
- Include timestamps  
- Include user/role identifiers  
- Capture important actions (triage, onboarding steps, etc.)  

## Audit Logs Required For:
- AI summary generation  
- Onboarding workflow actions  
- Access to restricted data  

---

# 🔒 4. Secrets Management

## Secrets Must:
- Be stored in `.env` files (ignored by Git)  
- Never be committed to the repository  
- Be accessed via environment variables  
- Be rotated if accidentally exposed  

---

# 🛡️ 5. AI Safety Requirements

## Before sending text to AI:
- Scrub PII  
- Redact restricted fields  
- Remove operational metadata  
- Validate input length  

## AI Output Must:
- Be checked for hallucinations  
- Avoid leaking internal notes  
- Be logged in audit logs (not raw text)  

---

# 🔧 6. API Security

## All APIs Must:
- Require authentication  
- Validate all inputs  
- Reject missing or invalid tokens  
- Avoid returning sensitive fields unless authorized  
- Use consistent error messages (no data leakage)  

---

# 🗄️ 7. Data Storage

## SQLite Databases Must:
- Store only synthetic data  
- Follow data‑classification rules  
- Use separate DB files per tool  
- Avoid storing secrets or tokens  

---

# 🧪 8. Testing Security

## Tests Should Validate:
- RBAC enforcement  
- PII masking  
- AI scrubbing logic  
- API input validation  
- Error handling without leakage  

---

# ✔️ Summary

These guidelines ensure the sandbox:
- Mirrors real enterprise security practices  
- Demonstrates your ability to handle sensitive data  
- Shows you can build secure internal tools  
- Prepares you for interviews in regulated industries  

All tools in this sandbox must follow these guidelines.
