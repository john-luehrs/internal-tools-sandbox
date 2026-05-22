import {
  Log,
  LogStats,
  ExplanationResponse,
  QASprint,
  QAHeatmapPoint,
  QADefect,
  QANote,
  QAClusterResult,
  QADuplicateResult,
  QADuplicateMergeResult,
  QADuplicateMergeRequestItem,
} from "./types";

const API_BASE = "/api";
const DEFAULT_TOKEN = "Bearer token-ops"; // Overridden by role context in pages

interface FetchOptions {
  token?: string;
  method?: string;
  body?: any;
}

async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token = DEFAULT_TOKEN, method = "GET", body } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: token,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, fetchOptions);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

// Logs API
export async function getTeamLogs(
  filters?: {
    level?: string;
    service?: string;
    status?: string;
    anomaly_only?: boolean;
    sort?: string;
  },
  token?: string
): Promise<Log[]> {
  const params = new URLSearchParams();
  if (filters?.level) params.append("level", filters.level);
  if (filters?.service) params.append("service", filters.service);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.anomaly_only) params.append("anomaly_only", "true");
  if (filters?.sort) params.append("sort", filters.sort);

  const query = params.toString();
  const endpoint = `/logs/team${query ? `?${query}` : ""}`;

  return apiFetch<Log[]>(endpoint, { token });
}

export async function getAssignedLogs(engineer: string, token?: string): Promise<Log[]> {
  return apiFetch<Log[]>(`/logs/my-assigned?engineer=${engineer}`, { token });
}

export async function getLogStats(token?: string): Promise<LogStats> {
  return apiFetch<LogStats>("/logs/stats", { token });
}

export async function assignLog(
  logId: number,
  assignedTo: string | null,
  status?: string,
  token?: string
): Promise<{ success: boolean; log: Log | null }> {
  return apiFetch(`/logs/${logId}/assign`, {
    token,
    method: "POST",
    body: {
      assigned_to: assignedTo,
      status,
    },
  });
}

export async function updateLogStatus(
  logId: number,
  status: string,
  token?: string
): Promise<{ success: boolean; log: Log | null }> {
  return apiFetch(`/logs/${logId}/status`, {
    token,
    method: "PATCH",
    body: {
      status,
    },
  });
}

export async function updateLogFlag(
  logId: number,
  flagged: boolean,
  reason?: string,
  engineer?: string,
  token?: string
): Promise<{ success: boolean; log: Log | null }> {
  return apiFetch(`/logs/${logId}/flag`, {
    token,
    method: "PATCH",
    body: {
      flagged,
      reason,
      engineer,
    },
  });
}

export async function explainLog(
  logId: number,
  engineer?: string,
  safeMode: boolean = true,
  token?: string
): Promise<ExplanationResponse> {
  const params = new URLSearchParams();
  if (engineer) params.append("engineer", engineer);
  params.append("safe_mode", String(safeMode));
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ExplanationResponse>(`/logs/${logId}/explain${query}`, { token });
}

export async function getOpsBrief(
  token?: string
): Promise<{ brief: string; generated_at: string }> {
  return apiFetch("/logs/ops-brief", { token });
}

export async function createDemoAnomalyLog(
  payload: { service?: string; message?: string; anomaly_score?: number } = {},
  token?: string
): Promise<{ success: boolean; log: Log | null }> {
  return apiFetch("/logs/demo/anomaly", {
    token,
    method: "POST",
    body: payload,
  });
}

export async function cleanupDemoLogs(
  token?: string
): Promise<{ success: boolean; deleted: number }> {
  return apiFetch("/logs/demo/cleanup", {
    token,
    method: "DELETE",
  });
}

// QA API
export async function getQASprints(token?: string): Promise<QASprint[]> {
  return apiFetch<QASprint[]>("/qa/sprints", { token });
}

export async function getQADefects(
  filters: {
    sprints?: string[];
    severity?: string;
    component?: string;
    status?: string;
    assignee?: string;
  } = {},
  token?: string
): Promise<QADefect[]> {
  const params = new URLSearchParams();
  if (filters.sprints?.length) params.append("sprints", filters.sprints.join(","));
  if (filters.severity) params.append("severity", filters.severity);
  if (filters.component) params.append("component", filters.component);
  if (filters.status) params.append("status", filters.status);
  if (filters.assignee) params.append("assignee", filters.assignee);

  const query = params.toString();
  return apiFetch<QADefect[]>(`/qa/defects${query ? `?${query}` : ""}`, { token });
}

export async function getQAHeatmap(
  sprints: string[] = [],
  token?: string
): Promise<QAHeatmapPoint[]> {
  const params = new URLSearchParams();
  if (sprints.length) params.append("sprints", sprints.join(","));
  const query = params.toString();
  return apiFetch<QAHeatmapPoint[]>(`/qa/trends/heatmap${query ? `?${query}` : ""}`, { token });
}

export async function addQADefectNote(
  defectId: number,
  noteBody: string,
  token?: string
): Promise<{ success: boolean; note: QANote | null }> {
  return apiFetch(`/qa/defects/${defectId}/notes`, {
    token,
    method: "POST",
    body: { note_body: noteBody },
  });
}

export async function getQADefectNotes(
  defectId: number,
  token?: string
): Promise<QANote[]> {
  return apiFetch<QANote[]>(`/qa/defects/${defectId}/notes`, { token });
}

export async function updateQADefectStatus(
  defectId: number,
  status: string,
  resolutionReason?: string,
  token?: string
): Promise<{ success: boolean; defect: QADefect | null }> {
  return apiFetch(`/qa/defects/${defectId}/status`, {
    token,
    method: "PATCH",
    body: {
      status,
      resolution_reason: resolutionReason,
    },
  });
}

export async function assignQADefect(
  defectId: number,
  assignee: string | null,
  token?: string
): Promise<{ success: boolean; defect: QADefect | null }> {
  return apiFetch(`/qa/defects/${defectId}/assign`, {
    token,
    method: "PATCH",
    body: { assignee },
  });
}

export async function runQACluster(
  sprints: string[],
  token?: string
): Promise<QAClusterResult> {
  return apiFetch<QAClusterResult>("/qa/analysis/cluster", {
    token,
    method: "POST",
    body: { sprints },
  });
}

export async function runQADuplicateDetection(
  sprints: string[],
  options?: { forceRefresh?: boolean },
  token?: string
): Promise<QADuplicateResult> {
  return apiFetch<QADuplicateResult>("/qa/analysis/duplicates", {
    token,
    method: "POST",
    body: {
      sprints,
      force_refresh: options?.forceRefresh ?? false,
    },
  });
}

export async function mergeQADuplicates(
  canonicalDefectId: number,
  sourceDefectIds: number[],
  confidenceScore?: number,
  reason?: string,
  token?: string
): Promise<QADuplicateMergeResult> {
  return apiFetch<QADuplicateMergeResult>("/qa/analysis/duplicates/merge", {
    token,
    method: "POST",
    body: {
      canonical_defect_id: canonicalDefectId,
      source_defect_ids: sourceDefectIds,
      confidence_score: confidenceScore,
      reason,
    },
  });
}

export async function createQADuplicateMergeRequest(
  canonicalDefectId: number,
  sourceDefectIds: number[],
  confidenceScore?: number,
  reason?: string,
  token?: string
): Promise<{ success: boolean; request: QADuplicateMergeRequestItem | null }> {
  return apiFetch<{ success: boolean; request: QADuplicateMergeRequestItem | null }>("/qa/analysis/duplicates/requests", {
    token,
    method: "POST",
    body: {
      canonical_defect_id: canonicalDefectId,
      source_defect_ids: sourceDefectIds,
      confidence_score: confidenceScore,
      reason,
    },
  });
}

export async function listQADuplicateMergeRequests(
  status: "pending" | "approved" | "rejected" | "all" = "pending",
  token?: string
): Promise<QADuplicateMergeRequestItem[]> {
  const params = new URLSearchParams();
  params.append("status", status);
  return apiFetch<QADuplicateMergeRequestItem[]>(`/qa/analysis/duplicates/requests?${params.toString()}`, { token });
}

export async function approveQADuplicateMergeRequest(
  requestId: number,
  token?: string
): Promise<{ success: boolean; request_id: number; merge: QADuplicateMergeResult }> {
  return apiFetch<{ success: boolean; request_id: number; merge: QADuplicateMergeResult }>(
    `/qa/analysis/duplicates/requests/${requestId}/approve`,
    {
      token,
      method: "POST",
    }
  );
}

export async function rejectQADuplicateMergeRequest(
  requestId: number,
  reason?: string,
  token?: string
): Promise<{ success: boolean; request_id: number }> {
  return apiFetch<{ success: boolean; request_id: number }>(`/qa/analysis/duplicates/requests/${requestId}/reject`, {
    token,
    method: "POST",
    body: {
      reason,
    },
  });
}

export function getQAReportExportUrl(filters: {
  sprints?: string[];
  severity?: string;
  component?: string;
  status?: string;
  assignee?: string;
} = {}): string {
  const params = new URLSearchParams();
  if (filters.sprints?.length) params.append("sprints", filters.sprints.join(","));
  if (filters.severity) params.append("severity", filters.severity);
  if (filters.component) params.append("component", filters.component);
  if (filters.status) params.append("status", filters.status);
  if (filters.assignee) params.append("assignee", filters.assignee);
  const query = params.toString();
  return `/api/qa/reports/export.csv${query ? `?${query}` : ""}`;
}
