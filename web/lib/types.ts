export interface Log {
  log_id: number;
  timestamp: string;
  service: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  message: string;
  anomaly_score: number;
  assigned_to: string | null;
  status: "unreviewed" | "in_review" | "resolved";
  is_flagged?: number | boolean;
  flagged_by?: string | null;
  flagged_at?: string | null;
  flagged_reason?: string | null;
}

export interface LogStats {
  total_high_anomaly: number;
  unassigned_count: number;
  unreviewed_count: number;
  in_review_count: number;
  resolved_count: number;
}

export interface ExplanationResponse {
  explanation: string;
  anomaly_score: number;
  safe_mode?: boolean;
}

export interface SupportTicket {
  ticket_id: number;
  customer_name: string;
  customer_tier: string;
  email: string | null;
  phone: string | null;
  sla_tier: string;
  risk_score: number;
  description: string;
  internal_notes: string;
  created_at?: string | null;
  updated_at?: string | null;
  escalation_status?: "none" | "requested" | "approved" | "rejected" | null;
  escalation_target?: string | null;
  escalation_reason?: string | null;
  escalation_requested_by?: string | null;
  escalation_requested_at?: string | null;
  escalation_resolved_by?: string | null;
  escalation_resolved_at?: string | null;
  sla_state?: "active" | "paused" | "met" | null;
  sla_pause_reason?: string | null;
  sla_paused_at?: string | null;
  sla_paused_by?: string | null;
  sla_resumed_at?: string | null;
  sla_resumed_by?: string | null;
  sla_pause_total_seconds?: number | null;
  sla_met_at?: string | null;
  sla_met_by?: string | null;
}

export interface SupportSummaryResponse {
  summary: string;
  safe_mode: boolean;
}

export interface SupportEscalationRequest {
  action: "request" | "approve" | "reject" | "clear";
  reason?: string;
  target?: string;
}

export interface SupportSLAStateRequest {
  action: "pause" | "resume" | "mark_met" | "reset_active";
  reason?: string;
}

export interface SupportTicketHistoryItem {
  ticket_id: number;
  customer_name: string;
  customer_tier: string;
  sla_tier: string;
  risk_score: number;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  escalation_status?: "none" | "requested" | "approved" | "rejected" | null;
  sla_state?: "active" | "paused" | "met" | null;
  similarity_score?: number;
}

export interface SupportTicketEvent {
  event_id: number;
  event_type: string;
  actor: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface SupportTicketHistoryResponse {
  ticket_id: number;
  related_tickets: SupportTicketHistoryItem[];
  similar_tickets: SupportTicketHistoryItem[];
  events: SupportTicketEvent[];
}

export interface QASprint {
  sprint_id: string;
  start_date: string;
  end_date: string;
  release_label: string;
  modules_deployed?: string | null;
  deploy_success_count?: number;
  deploy_error_count?: number;
}

export interface QAHeatmapPoint {
  sprint_id: string;
  component: string;
  severity: "critical" | "high" | "medium" | "low";
  defect_count: number;
}

export interface QADefect {
  defect_id: number;
  sprint_id: string;
  component: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "investigating" | "escalated" | "resolved" | "duplicate_pending" | "duplicate_merged";
  resolution_reason: "fixed" | "follow_up_created" | "not_reproducible" | null;
  assignee: string | null;
  reporter: string | null;
  title: string;
  description: string;
  repro_steps: string | null;
  expected_result: string | null;
  actual_result: string | null;
  customer_impact: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  canonical_defect_id: number | null;
}

export interface QANote {
  note_id: number;
  defect_id: number;
  author: string;
  note_body: string;
  created_at: string;
}

export interface QAClusterResult {
  clusters: Array<{ pattern: string; defects: string[] }>;
  input_count: number;
}

export interface QADuplicateResult {
  groups: Array<{
    items: Array<{ defect_id: number; description: string; component?: string }>;
    confidence: number;
    rationale: string;
  }>;
  input_count: number;
  cached?: boolean;
}

export interface QADuplicateMergeResult {
  success: boolean;
  canonical_defect_id: number;
  merged_defect_ids: number[];
  merged_count: number;
}

export interface QADuplicateMergeRequestDefectSummary {
  defect_id: number;
  sprint_id: string;
  component: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "investigating" | "escalated" | "resolved" | "duplicate_pending" | "duplicate_merged";
  assignee: string | null;
  reporter: string | null;
  title: string;
  updated_at: string;
}

export interface QADuplicateMergeRequestItem {
  request_id: number;
  canonical_defect_id: number;
  source_defect_ids: number[];
  confidence_score: number | null;
  reason: string | null;
  requested_by: string;
  status: "pending" | "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  canonical_defect: QADuplicateMergeRequestDefectSummary | null;
  source_defects: QADuplicateMergeRequestDefectSummary[];
}
