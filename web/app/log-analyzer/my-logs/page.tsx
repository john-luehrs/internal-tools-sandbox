"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LogTable from "@/components/LogTable";
import LogDetail from "@/components/LogDetail";
import { getAssignedLogs, updateLogStatus, updateLogFlag, explainLog } from "@/lib/api";
import { TEAM_WORKLOAD_UPDATED_EVENT } from "@/lib/events";
import { useRoleContext } from "@/lib/RoleContext";
import { Log } from "@/lib/types";

const TEAM_MEMBERS = ["alice", "bob", "carol", "david"];

export default function MyLogsDashboard() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [flagLoading, setFlagLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [safeMode, setSafeMode] = useState(true);
  const searchParams = useSearchParams();
  const { token, username, isManager, role } = useRoleContext();
  const selectedEngineer = (searchParams.get("engineer") || "").toLowerCase();
  const engineer = isManager && TEAM_MEMBERS.includes(selectedEngineer) ? selectedEngineer : username;
  const resolvedToken = token ?? undefined;

  if (!["ops_engineer", "support_manager", "it_admin"].includes(role)) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Log Analyzer - My Logs</h2>
        </div>
        <p>This page is available to Ops and Support personas only.</p>
      </div>
    );
  }

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
        const updatedLog = result.log;
        setLogs((prevLogs) =>
          prevLogs.map((log) => (log.log_id === selectedLog.log_id ? updatedLog : log))
        );
        setSelectedLog(updatedLog);
        window.dispatchEvent(new Event(TEAM_WORKLOAD_UPDATED_EVENT));
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleToggleFlag = async (flagged: boolean, reason?: string) => {
    if (!selectedLog) return;
    setStatusError("");
    try {
      setFlagLoading(true);
      const result = await updateLogFlag(selectedLog.log_id, flagged, reason, engineer, resolvedToken);
      if (result.success && result.log) {
        const updatedLog = result.log;
        setLogs((prevLogs) =>
          prevLogs.map((log) => (log.log_id === selectedLog.log_id ? updatedLog : log))
        );
        setSelectedLog(updatedLog);
        window.dispatchEvent(new Event(TEAM_WORKLOAD_UPDATED_EVENT));
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to update flag");
    } finally {
      setFlagLoading(false);
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
        <LogDetail
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onExplain={handleExplain}
          onUpdateAssignment={(logId, _assignedTo, status) => handleStatusChange(status)}
          onToggleFlag={(logId, flagged, reason) => handleToggleFlag(flagged, reason)}
          isAssignmentLoading={statusLoading}
          isFlagLoading={flagLoading}
          saveMessage={statusError ? { text: statusError, type: "error" } : null}
          safeMode={safeMode}
          onSafeModeChange={setSafeMode}
          isLoading={explainLoading}
          explanation={explanation || undefined}
          isManager={false}
        />
      )}
    </div>
  );
}
