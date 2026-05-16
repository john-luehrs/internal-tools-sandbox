# Changelog

## 2.0.0 - 2026-05-16

- Added persona-based demo authentication for Alice, Bob, Carol, Dana, and Evan.
- Centralized frontend auth hydration with RoleContext so role-gated UI renders consistently.
- Split role behavior so ops engineers can update status while managers and admins handle assignment and reassignment.
- Added manager-only workload surfaces including sidebar staffing stats, quick assignment controls, and the AI-generated Manager Ops Brief.
- Added a top-of-page manager timeline chart with stacked volume and level trend modes.
- Tuned team dashboard stat cards so ops users see personal triage metrics while retaining the shared team log table.
- Updated the My Logs experience to follow the signed-in persona instead of a manual engineer selector.
- Preserved safe AI explanation flows with redaction and audit logging.
- Documented the current v2.0 release surface ahead of the anomaly flagging workflow.