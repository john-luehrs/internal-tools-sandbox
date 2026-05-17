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

export interface QASprint {
  sprint_id: string;
  start_date: string;
  end_date: string;
  release_label: string;
  modules_deployed?: string | null;
  deploy_success_count?: number;
  deploy_error_count?: number;
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
}
