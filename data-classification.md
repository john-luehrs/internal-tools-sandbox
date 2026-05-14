# Data Classification Guide
This document defines the data‑classification levels used throughout the Internal Tools Sandbox.  
All synthetic datasets follow these classifications to simulate real enterprise data‑governance practices.

---

# 📘 Classification Levels

## 1. Public
Information intended for unrestricted access.

**Examples:**
- Documentation  
- Sample code  
- Non-sensitive metadata  

**Handling Requirements:**
- No restrictions  

---

## 2. Internal
Information intended for internal use only. Not harmful if disclosed, but not meant for public distribution.

**Examples:**
- Ticket IDs  
- SLA tiers  
- Component names  
- Sprint numbers  

**Handling Requirements:**
- Do not expose in public logs  
- No external sharing  

---

## 3. Sensitive
Information that could cause operational or reputational harm if exposed.

**Examples:**
- Customer risk scores  
- Operational logs  
- Engineering defect notes  
- Onboarding workflow states  

**Handling Requirements:**
- Mask in logs  
- Restrict access by role  
- Do not send to external AI systems without redaction  

---

## 4. PII (Personally Identifiable Information)
Synthetic personal data used to simulate real-world scenarios.

**Examples:**
- Names  
- Emails  
- Phone numbers  
- Addresses  

**Handling Requirements:**
- Must be masked in logs  
- Must be scrubbed before AI processing  
- Must be stored securely  
- Must only be accessible to authorized roles  

---

## 5. Restricted
Highly sensitive internal information requiring strict access control.

**Examples:**
- Internal support notes  
- Security onboarding steps  
- High-risk customer flags  
- Engineering internal comments  

**Handling Requirements:**
- Strict RBAC enforcement  
- No external transmission  
- Audit logging required  
- Encryption recommended for storage  

---

# 📌 Summary Table

| Classification | Examples | Handling Requirements |
|----------------|----------|-----------------------|
| Public | Docs, sample code | No restrictions |
| Internal | Ticket IDs, SLAs | Internal only |
| Sensitive | Logs, risk scores | Mask logs, restrict access |
| PII | Names, emails | Mask logs, scrub before AI |
| Restricted | Internal notes | RBAC + audit logging |

---

This classification system applies to all tools, datasets, APIs, and workflows in the sandbox.
