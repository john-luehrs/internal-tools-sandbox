export interface Log {
  log_id: number;
  timestamp: string;
  service: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  message: string;
  anomaly_score: number;
  assigned_to: string | null;
  status: "unreviewed" | "in_review" | "resolved";
  is_flagged?: number;
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
