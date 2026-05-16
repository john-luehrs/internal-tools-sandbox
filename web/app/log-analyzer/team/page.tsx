"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import LogTable from "@/components/LogTable";
import LogDetail from "@/components/LogDetail";
import Filters from "@/components/Filters";
import AssignmentPanel from "@/components/AssignmentPanel";
import ManagerTimelineChart from "@/components/ManagerTimelineChart";
import { getTeamLogs, assignLog, updateLogStatus, explainLog, getOpsBrief } from "@/lib/api";
import { TEAM_WORKLOAD_UPDATED_EVENT } from "@/lib/events";
import { useRoleContext } from "@/lib/RoleContext";
import { Log } from "@/lib/types";

function buildTeamStats(logs: Log[]) {
  const high = logs.filter((l) => l.anomaly_score > 75);
  return {
    total_high_anomaly: high.length,
    unassigned_count: high.filter((l) => !l.assigned_to).length,
    unreviewed_count: high.filter((l) => l.status === "unreviewed" && !!l.assigned_to).length,
    in_review_count: high.filter((l) => l.status === "in_review").length,
    resolved_count: high.filter((l) => l.status === "resolved").length,
  };
}

function buildMyStats(logs: Log[], username: string) {
  const mine = logs.filter((l) => l.assigned_to === username);
  return {
    total_high_anomaly: mine.filter((l) => l.anomaly_score > 75).length,
    unreviewed_count: mine.filter((l) => l.status === "unreviewed").length,
    in_review_count: mine.filter((l) => l.status === "in_review").length,
    resolved_count: mine.filter((l) => l.status === "resolved").length,
  };
}

export default function TeamDashboard() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState({ total_high_anomaly: 0, unassigned_count: 0, unreviewed_count: 0, in_review_count: 0, resolved_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [safeMode, setSafeMode] = useState(true);

  const [filters, setFilters] = useState({
    level: "",
    service: "",
    status: "",
    anomaly_only: false,
    sort: "timestamp",
  });
  const [activeMetric, setActiveMetric] = useState<"anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved" | null>(null);

  const [assignLoading, setAssignLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const saveMessageTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { role, token, username, isManager } = useRoleContext();
  const resolvedToken = token ?? undefined;

  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Load logs and stats
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const logsData = await getTeamLogs(undefined, resolvedToken);
        setLogs(logsData);
        setStats(isManager ? buildTeamStats(logsData) : buildMyStats(logsData, username));
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logs");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [resolvedToken]);

  // Keep stat cards in sync with live log updates (assignments/status changes).
  useEffect(() => {
    setStats(isManager ? buildTeamStats(logs) : buildMyStats(logs, username));
  }, [logs, isManager, username]);

  useEffect(() => {
    if (!selectedLog) return;
    const latest = logs.find((log) => log.log_id === selectedLog.log_id);
    if (latest) {
      setSelectedLog(latest);
    }
  }, [logs, selectedLog]);

  // Apply filters
  useEffect(() => {
    let filtered = [...logs];

    if (filters.level) {
      filtered = filtered.filter((l) => l.level === filters.level);
    }
    if (filters.service) {
      filtered = filtered.filter((l) => l.service === filters.service);
    }
    if (filters.status) {
      filtered = filtered.filter((l) => l.status === filters.status);
    }
    if (filters.anomaly_only) {
      filtered = filtered.filter((l) => l.anomaly_score > 75);
    }

    const isPriorityMatch = (log: Log) => {
      switch (activeMetric) {
        case "anomaly":
          return isManager
            ? log.anomaly_score > 75
            : log.assigned_to === username && log.anomaly_score > 75;
        case "unassigned":
          return log.anomaly_score > 75 && !log.assigned_to;
        case "unreviewed":
          return isManager
            ? log.status === "unreviewed" && !!log.assigned_to
            : log.assigned_to === username && log.status === "unreviewed";
        case "in_review":
          return isManager
            ? log.status === "in_review"
            : log.assigned_to === username && log.status === "in_review";
        case "resolved":
          return isManager
            ? log.status === "resolved"
            : log.assigned_to === username && log.status === "resolved";
        default:
          return false;
      }
    };

    filtered.sort((a, b) => {
      if (activeMetric) {
        const priorityDelta = Number(isPriorityMatch(b)) - Number(isPriorityMatch(a));
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
      }

      if (filters.sort === "anomaly") {
        return b.anomaly_score - a.anomaly_score;
      }

      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    setFilteredLogs(filtered);
  }, [logs, filters, activeMetric, isManager, username]);

  const handleExplain = async () => {
    if (!selectedLog) return;

    try {
      setExplainLoading(true);
      const response = await explainLog(selectedLog.log_id, undefined, safeMode, resolvedToken);
      setExplanation(response.explanation);
    } catch (err) {
      setExplanation(`Error: ${err instanceof Error ? err.message : "Failed to get explanation"}`);
    } finally {
      setExplainLoading(false);
    }
  };

  const handleAssign = async (logId: number, assignedTo: string | null, status?: string) => {
    const previousLog = logs.find((log) => log.log_id === logId);
    const normalizedAssignedTo = assignedTo ?? null;
    const normalizedStatus = status ?? previousLog?.status;

    const assignmentChanged = (previousLog?.assigned_to ?? null) !== normalizedAssignedTo;
    const statusChanged = (previousLog?.status ?? null) !== (normalizedStatus ?? null);

    if (!assignmentChanged && !statusChanged) {
      setSaveMessage({ text: "No changes to save", type: "success" });
      if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current);
      saveMessageTimerRef.current = setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    try {
      setAssignLoading(true);
      const result = isManager
        ? await assignLog(logId, assignedTo, status, resolvedToken)
        : await updateLogStatus(logId, normalizedStatus ?? "unreviewed", resolvedToken);

      if (result.success && result.log) {
        setLogs((prevLogs) =>
          prevLogs.map((log) => (log.log_id === logId ? result.log : log))
        );
        window.dispatchEvent(new Event(TEAM_WORKLOAD_UPDATED_EVENT));
        let successText = "Saved";
        if (assignmentChanged && statusChanged) {
          successText = "Assignment and review status saved";
        } else if (assignmentChanged) {
          successText = "Assignment saved";
        } else if (statusChanged) {
          successText = "Review status saved";
        }
        setSaveMessage({ text: successText, type: "success" });
      }
    } catch (err) {
      setSaveMessage({ text: err instanceof Error ? err.message : "Failed to assign log", type: "error" });
    } finally {
      setAssignLoading(false);
      if (saveMessageTimerRef.current) clearTimeout(saveMessageTimerRef.current);
      saveMessageTimerRef.current = setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const [briefCollapsed, setBriefCollapsed] = useState(false);

  const handleOpsBrief = async () => {
    try {
      setBriefLoading(true);
      const res = await getOpsBrief(resolvedToken);
      setBriefText(res.brief);
    } catch (err) {
      setBriefText(`Error: ${err instanceof Error ? err.message : "Failed to generate brief"}`);
    } finally {
      setBriefLoading(false);
    }
  };

  const services = Array.from(new Set(logs.map((l) => l.service)));
  const levels = ["ERROR", "WARN", "INFO", "DEBUG"];

  const handleMetricClick = (metric: "anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved") => {
    setActiveMetric((current) => (current === metric ? null : metric));
  };

  const isMetricActive = (metric: "anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved") => {
    return activeMetric === metric;
  };

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 8px 0" }}>📊 Log Analyzer — Team Dashboard</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Catch anomalies, assign to team members, track resolution.
        </p>
      </div>

      {error && (
        <div style={{ padding: "12px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {isManager && <ManagerTimelineChart logs={filteredLogs} />}

      <div className="stats-grid">
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("anomaly") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("anomaly")}
        >
          <div className="stat-label">{isManager ? "High Anomaly Logs" : "My High Anomaly"}</div>
          <div className="stat-value">{stats.total_high_anomaly}</div>
        </button>
        {isManager && (
          <button
            type="button"
            className={`stat-card stat-card-interactive ${isMetricActive("unassigned") ? "stat-card-active" : ""}`}
            onClick={() => handleMetricClick("unassigned")}
          >
            <div className="stat-label">Unassigned</div>
            <div className="stat-value">{(stats as ReturnType<typeof buildTeamStats>).unassigned_count}</div>
          </button>
        )}
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("unreviewed") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("unreviewed")}
        >
          <div className="stat-label">{isManager ? "Unreviewed" : "My Unreviewed"}</div>
          <div className="stat-value">{stats.unreviewed_count}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("in_review") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("in_review")}
        >
          <div className="stat-label">{isManager ? "In Review" : "My In Review"}</div>
          <div className="stat-value">{stats.in_review_count}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("resolved") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("resolved")}
        >
          <div className="stat-label">{isManager ? "Resolved" : "My Resolved"}</div>
          <div className="stat-value">{stats.resolved_count}</div>
        </button>
      </div>

      {isManager && (
        <div className="card manager-panel" style={{ marginTop: "20px" }}>
          <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              type="button"
              onClick={() => briefText && setBriefCollapsed((c) => !c)}
              style={{ background: "none", border: "none", padding: 0, cursor: briefText ? "pointer" : "default", display: "flex", alignItems: "center", gap: "8px", color: "inherit" }}
            >
              <h3 className="card-title" style={{ margin: 0 }}>🧠 Manager Ops Brief</h3>
              {briefText && (
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{briefCollapsed ? "▶ show" : "▼ hide"}</span>
              )}
            </button>
            <button
              className="button button-primary button-small"
              onClick={handleOpsBrief}
              disabled={briefLoading}
            >
              {briefLoading ? "Generating..." : briefText ? "Refresh" : "Generate Brief"}
            </button>
          </div>
          {!briefCollapsed && briefText && (
            <div style={{ fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap", paddingTop: "4px" }}>
              {briefText}
            </div>
          )}
          {!briefText && !briefLoading && (
            <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
              Click Generate Brief for an AI-powered summary of current queue health and team workload.
            </p>
          )}
        </div>
      )}

      <Filters
        levels={levels}
        services={services}
        anomalyOnly={filters.anomaly_only}
        onLevelChange={(level) => setFilters((current) => ({ ...current, level }))}
        onServiceChange={(service) => setFilters((current) => ({ ...current, service }))}
        onStatusChange={(status) =>
          setFilters((current) => ({
            ...current,
            status,
          }))
        }
        onAnomalyOnlyChange={(anomaly_only) =>
          setFilters((current) => ({
            ...current,
            anomaly_only,
            sort: anomaly_only ? current.sort : "timestamp",
          }))
        }
        onSortChange={(sort) => setFilters((current) => ({ ...current, sort }))}
      />

      {isManager && <AssignmentPanel onAssign={handleAssign} isLoading={assignLoading} />}

      <div className="card" style={{ marginTop: "20px" }}>
        <div className="card-header">
          <h3 className="card-title">
            Logs ({filteredLogs.length} {loading ? "loading..." : "found"})
          </h3>
        </div>
        <LogTable logs={filteredLogs} onSelectLog={(log) => {
          setSelectedLog(log);
          setExplanation(null);
        }} />
      </div>

      {selectedLog && (
        <LogDetail
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onExplain={handleExplain}
          onUpdateAssignment={handleAssign}
          isAssignmentLoading={assignLoading}
          saveMessage={saveMessage}
          safeMode={safeMode}
          onSafeModeChange={setSafeMode}
          isLoading={explainLoading}
          explanation={explanation || undefined}
           isManager={isManager}
        />
      )}
    </div>
  );
}
