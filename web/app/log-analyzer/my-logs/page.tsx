"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import LogTable from "@/components/LogTable";
import LogDetail from "@/components/LogDetail";
import { getAssignedLogs, updateLogStatus, explainLog } from "@/lib/api";
import { TEAM_WORKLOAD_UPDATED_EVENT } from "@/lib/events";
import { useRoleContext } from "@/lib/RoleContext";
import { Log } from "@/lib/types";

export default function MyLogsDashboard() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [safeMode, setSafeMode] = useState(true);
  const { token, username } = useRoleContext();
  const engineer = username;
  const resolvedToken = token ?? undefined;
  useEffect(() => {
    const loadLogs = async () => {
      try {
        setLoading(true);
        const logsData = await getAssignedLogs(engineer, resolvedToken);
        setLogs(logsData);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logs");
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [engineer, resolvedToken]);

  const handleExplain = async () => {
    if (!selectedLog) return;

    try {
      setExplainLoading(true);
      const response = await explainLog(selectedLog.log_id, engineer, safeMode, resolvedToken);
      setExplanation(response.explanation);
    } catch (err) {
      setExplanation(`Error: ${err instanceof Error ? err.message : "Failed to get explanation"}`);
    } finally {
      setExplainLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedLog) return;
    setStatusError("");
    try {
      setStatusLoading(true);
      const result = await updateLogStatus(selectedLog.log_id, status, resolvedToken);

      if (result.success && result.log) {
        setLogs((prevLogs) =>
          prevLogs.map((log) => (log.log_id === selectedLog.log_id ? result.log : log))
        );
        setSelectedLog(result.log);
        window.dispatchEvent(new Event(TEAM_WORKLOAD_UPDATED_EVENT));
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  };

  const stats = {
    resolved: logs.filter((l) => l.status === "resolved").length,
    in_review: logs.filter((l) => l.status === "in_review").length,
    unreviewed: logs.filter((l) => l.status === "unreviewed").length,
    avg_anomaly:
      logs.length > 0
        ? Math.round(logs.reduce((sum, l) => sum + l.anomaly_score, 0) / logs.length)
        : 0,
  };

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 8px 0" }}>📋 Log Analyzer — My Logs</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Track your assigned logs and resolve anomalies. <Link href="/log-analyzer/team" style={{ color: "#3b82f6" }}>← Back to team view</Link>
        </p>
      </div>

      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <label style={{ color: "var(--muted)", fontSize: "12px", textTransform: "uppercase" }}>
            Engineer:
          </label>
          <span style={{ fontSize: "14px", fontWeight: 600 }}>{engineer}</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{stats.resolved}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Review</div>
          <div className="stat-value">{stats.in_review}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unreviewed</div>
          <div className="stat-value">{stats.unreviewed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Anomaly</div>
          <div className="stat-value">{stats.avg_anomaly}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            Assigned Logs ({logs.length} {loading ? "loading..." : "found"})
          </h3>
        </div>
        <LogTable logs={logs} onSelectLog={(log) => {
          setSelectedLog(log);
          setExplanation(null);
        }} />
      </div>

      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Log {selectedLog.log_id} — Status Update</h2>
            </div>

            <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ color: "var(--muted)", fontSize: "12px" }}>Message</label>
                <p style={{ margin: "4px 0 0 0", wordBreak: "break-word" }}>{selectedLog.message}</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ color: "var(--muted)", fontSize: "12px" }}>Service</label>
                  <p style={{ margin: "4px 0 0 0" }}>{selectedLog.service}</p>
                </div>
                <div>
                  <label style={{ color: "var(--muted)", fontSize: "12px" }}>Anomaly</label>
                  <p style={{ margin: "4px 0 0 0", fontSize: "16px", fontWeight: "bold" }}>
                    {selectedLog.anomaly_score}
                  </p>
                </div>
              </div>

              <div>
                <label style={{ color: "var(--muted)", fontSize: "12px", display: "block", marginBottom: "8px" }}>
                  Status
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {["unreviewed", "in_review", "resolved"].map((status) => (
                    <button
                      key={status}
                      className={`button button-${selectedLog.status === status ? "primary" : "secondary"} button-small`}
                      onClick={() => handleStatusChange(status)}
                      disabled={statusLoading || selectedLog.status === status}
                    >
                      {status.replace("_", " ")}
                    </button>
                  ))}
                </div>
                {statusError && (
                  <p style={{ color: "var(--color-error)", fontSize: "12px", margin: "6px 0 0 0" }}>
                    {statusError}
                  </p>
                )}
              </div>

              {explanation && (
                <div
                  style={{
                    background: "var(--border)",
                    padding: "12px",
                    borderRadius: "8px",
                    marginTop: "12px",
                  }}
                >
                  <label style={{ color: "var(--muted)", fontSize: "12px", display: "block" }}>
                    AI Explanation
                  </label>
                  <p style={{ margin: "8px 0 0 0", fontSize: "13px" }}>{explanation}</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {selectedLog.anomaly_score > 75 && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--muted)", fontSize: "12px" }}>
                    <input
                      type="checkbox"
                      checked={safeMode}
                      onChange={(e) => setSafeMode(e.target.checked)}
                    />
                    Safe AI mode (redact sensitive fields)
                  </label>
                  <button
                    className="button button-primary button-small"
                    onClick={handleExplain}
                    disabled={explainLoading}
                  >
                    {explainLoading ? "Loading..." : "Get AI Explanation"}
                  </button>
                </>
              )}
              <button className="button button-secondary button-small" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
