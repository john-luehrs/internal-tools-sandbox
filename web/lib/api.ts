import { Log, LogStats, ExplanationResponse } from "./types";

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
