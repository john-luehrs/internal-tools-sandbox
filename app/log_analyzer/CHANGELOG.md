# Changelog

## 3.0.0 - 2026-05-16

- Added anomaly flagging workflow with RBAC: ops engineers can flag their own assigned logs; managers and admins can flag any log.
- Added flag/unflag controls in the log detail modal with a 2-line scrollable reason textarea.
- Added Flagged stat card to the team dashboard with click-to-filter behavior.
- Added manager-only Flagged Watchlist with aging risk badges (recent / aging / overdue).
- Implemented MTTD Notification Demo: demo log creation, +5/+10/+15 minute escalation controls, and one-click cleanup.
- Added audible 3-beep sequence at the +10 critical and +15 escalated thresholds.
- Added viewport-pinned escalation banner at the +15 threshold.
- Implemented acknowledgment-based notification suppression: banner and toasts clear automatically when a log is set to In Review or Resolved.
- Demo cleanup auto-clears all UI state after 4 seconds.
- Wired cross-component notification events via a CustomEvent bridge between the sidebar and team page.
- Fixed My Logs so managers viewing a team member via a sidebar link honor the ?engineer= query param.
- Made the demo module collapsible to reduce sidebar clutter.
- Pinned the sidebar with sticky layout for long team queue scrolling.
- Organized manager insight sections into a two-column grid.
- Added stat card subtexts, active filter chips, and a clear-all filter control.
- Expanded Demo Path documentation into four distinct demo paths (MTTD, role contrast, flagging workflow, AI explanation).
- Added recruiter snapshot, Why This Matters, and Mermaid architecture flow to the tool README.

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