"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import LogTable from "@/components/LogTable";
import LogDetail from "@/components/LogDetail";
import Filters from "@/components/Filters";
import AssignmentPanel from "@/components/AssignmentPanel";
import ManagerTimelineChart from "@/components/ManagerTimelineChart";
import { getTeamLogs, assignLog, updateLogStatus, updateLogFlag, explainLog, getOpsBrief } from "@/lib/api";
import {
  TEAM_WORKLOAD_UPDATED_EVENT,
  MTTD_DEMO_NOTIFICATION_EVENT,
  MTTD_DEMO_CLEAR_EVENT,
} from "@/lib/events";
import { useRoleContext } from "@/lib/RoleContext";
import { Log } from "@/lib/types";

function buildTeamStats(logs: Log[]) {
  const high = logs.filter((l) => l.anomaly_score > 75);
  const flagged = logs.filter((l) => l.is_flagged === 1 || l.is_flagged === true);
  return {
    total_high_anomaly: high.length,
    unassigned_count: high.filter((l) => !l.assigned_to).length,
    unreviewed_count: high.filter((l) => l.status === "unreviewed" && !!l.assigned_to).length,
    in_review_count: high.filter((l) => l.status === "in_review").length,
    resolved_count: high.filter((l) => l.status === "resolved").length,
    flagged_count: flagged.length,
  };
}

function buildMyStats(logs: Log[], username: string) {
  const mine = logs.filter((l) => l.assigned_to === username);
  const myFlagged = mine.filter((l) => l.is_flagged === 1 || l.is_flagged === true);
  return {
    total_high_anomaly: mine.filter((l) => l.anomaly_score > 75).length,
    unassigned_count: 0,
    unreviewed_count: mine.filter((l) => l.status === "unreviewed").length,
    in_review_count: mine.filter((l) => l.status === "in_review").length,
    resolved_count: mine.filter((l) => l.status === "resolved").length,
    flagged_count: myFlagged.length,
  };
}

export default function TeamDashboard() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState({ total_high_anomaly: 0, unassigned_count: 0, unreviewed_count: 0, in_review_count: 0, resolved_count: 0, flagged_count: 0 });
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
  const [activeMetric, setActiveMetric] = useState<"anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved" | "flagged" | null>(null);

  const [assignLoading, setAssignLoading] = useState(false);
  const [flagLoading, setFlagLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const saveMessageTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { role, token, username, isManager } = useRoleContext();
  const resolvedToken = token ?? undefined;
  const canChangeWorkflow = role !== "infrastructure_developer";

  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [demoToast, setDemoToast] = useState<{ tone: "warn" | "critical"; message: string } | null>(null);
  const [demoBanner, setDemoBanner] = useState<string | null>(null);

  if (!["ops_engineer", "support_manager", "it_admin", "infrastructure_developer"].includes(role)) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Log Analyzer</h2>
        </div>
        <p>This page is available to Ops and Support personas only.</p>
      </div>
    );
  }

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

    const handleWorkloadUpdate = () => {
      void loadData();
    };

    void loadData();
    window.addEventListener(TEAM_WORKLOAD_UPDATED_EVENT, handleWorkloadUpdate);
    return () => {
      window.removeEventListener(TEAM_WORKLOAD_UPDATED_EVENT, handleWorkloadUpdate);
    };
  }, [resolvedToken, isManager, username]);

  useEffect(() => {
    const handleDemoNotification = (event: Event) => {
      const custom = event as CustomEvent<{ tone: "warn" | "critical" | "escalated"; message: string; banner?: boolean }>;
      const detail = custom.detail;
      if (!detail) return;

      if (detail.banner || detail.tone === "escalated") {
        setDemoBanner(detail.message);
        setDemoToast(null);
        return;
      }

      setDemoBanner(null);
      setDemoToast({ tone: detail.tone, message: detail.message });
    };

    const handleDemoClear = () => {
      setDemoToast(null);
      setDemoBanner(null);
    };

    window.addEventListener(MTTD_DEMO_NOTIFICATION_EVENT, handleDemoNotification as EventListener);
    window.addEventListener(MTTD_DEMO_CLEAR_EVENT, handleDemoClear);

    return () => {
      window.removeEventListener(MTTD_DEMO_NOTIFICATION_EVENT, handleDemoNotification as EventListener);
      window.removeEventListener(MTTD_DEMO_CLEAR_EVENT, handleDemoClear);
    };
  }, []);

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
        case "flagged":
          return isManager
            ? log.is_flagged === 1 || log.is_flagged === true
            : log.assigned_to === username && (log.is_flagged === 1 || log.is_flagged === true);
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
    if (!canChangeWorkflow) {
      setSaveMessage({ text: "Infrastructure Developer is read-only in this tool.", type: "error" });
      return;
    }
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
        const updatedLog = result.log;
        setLogs((prevLogs) =>
          prevLogs.map((log) => (log.log_id === logId ? updatedLog : log))
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

  const handleFlag = async (logId: number, flagged: boolean, reason?: string) => {
    if (!canChangeWorkflow) {
      setSaveMessage({ text: "Infrastructure Developer is read-only in this tool.", type: "error" });
      return;
    }
    try {
      setFlagLoading(true);
      const result = await updateLogFlag(logId, flagged, reason, username, resolvedToken);
      if (result.success && result.log) {
        const updatedLog = result.log;
        setLogs((prevLogs) =>
          prevLogs.map((log) => (log.log_id === logId ? updatedLog : log))
        );
        setSaveMessage({ text: flagged ? "Anomaly flagged" : "Flag removed", type: "success" });
      }
    } catch (err) {
      setSaveMessage({ text: err instanceof Error ? err.message : "Failed to update flag", type: "error" });
    } finally {
      setFlagLoading(false);
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

  const flaggedOpenWatchlist = logs
    .filter((l) => (l.is_flagged === 1 || l.is_flagged === true) && l.status !== "resolved")
    .sort((a, b) => {
      const ageDelta = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (ageDelta !== 0) return ageDelta;
      return b.anomaly_score - a.anomaly_score;
    })
    .slice(0, 10);

  const formatAge = (isoString: string) => {
    const deltaMinutes = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 60000));
    if (deltaMinutes < 60) return `${deltaMinutes}m`;
    const hours = Math.floor(deltaMinutes / 60);
    const minutes = deltaMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const ageMinutes = (isoString: string) => {
    return Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 60000));
  };

  const watchlistSeverity = (isoString: string): "normal" | "warn" | "critical" => {
    const mins = ageMinutes(isoString);
    if (mins >= 60) return "critical";
    if (mins >= 30) return "warn";
    return "normal";
  };

  const activeFilterChips: string[] = [];
  if (activeMetric) {
    activeFilterChips.push(
      `priority: ${activeMetric.replace("_", " ")}`
    );
  }
  if (filters.level) activeFilterChips.push(`level: ${filters.level}`);
  if (filters.service) activeFilterChips.push(`service: ${filters.service}`);
  if (filters.status) activeFilterChips.push(`status: ${filters.status.replace("_", " ")}`);
  if (filters.anomaly_only) activeFilterChips.push("high anomaly only");
  if (filters.sort === "anomaly") activeFilterChips.push("sort: anomaly");

  const handleMetricClick = (metric: "anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved" | "flagged") => {
    setActiveMetric((current) => (current === metric ? null : metric));
  };

  const isMetricActive = (metric: "anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved" | "flagged") => {
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

      {demoBanner && (
        <div
          style={{
            position: "fixed",
            top: "12px",
            right: "18px",
            zIndex: 60,
            maxWidth: "680px",
            width: "min(680px, calc(100vw - 36px))",
            padding: "12px 14px",
            borderRadius: "10px",
            background: "#450a0a",
            color: "#fee2e2",
            fontWeight: 600,
            border: "1px solid #b91c1c",
            boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
          }}
        >
          {demoBanner}
        </div>
      )}

      {demoToast?.tone === "warn" && (
        <div style={{ position: "sticky", top: 8, zIndex: 40, display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
          <div
            style={{
              maxWidth: "460px",
              padding: "8px 10px",
              borderRadius: "10px",
              border: "1px solid #facc15",
              background: "#fef9c3",
              color: "#713f12",
              fontSize: "12px",
              fontWeight: 600,
              boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
            }}
          >
            {demoToast.message}
          </div>
        </div>
      )}

      {demoToast?.tone === "critical" && (
        <div
          style={{
            position: "sticky",
            top: 8,
            zIndex: 45,
            marginBottom: "12px",
            padding: "12px 14px",
            borderRadius: "10px",
            border: "1px solid #ef4444",
            background: "#7f1d1d",
            color: "#fee2e2",
            fontSize: "13px",
            fontWeight: 700,
            boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
          }}
        >
          {demoToast.message}
        </div>
      )}

      {isManager && <ManagerTimelineChart logs={filteredLogs} />}

      <div className="stats-grid stats-grid-team">
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("anomaly") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("anomaly")}
        >
          <div className="stat-label">{isManager ? "High Anomaly Logs" : "My High Anomaly"}</div>
          <div className="stat-value">{stats.total_high_anomaly}</div>
          <div className="stat-subtext">Immediate triage candidates</div>
        </button>
        {isManager && (
          <button
            type="button"
            className={`stat-card stat-card-interactive ${isMetricActive("unassigned") ? "stat-card-active" : ""}`}
            onClick={() => handleMetricClick("unassigned")}
          >
            <div className="stat-label">Unassigned</div>
            <div className="stat-value">{(stats as ReturnType<typeof buildTeamStats>).unassigned_count}</div>
            <div className="stat-subtext">Needs an owner</div>
          </button>
        )}
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("unreviewed") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("unreviewed")}
        >
          <div className="stat-label">{isManager ? "Unreviewed" : "My Unreviewed"}</div>
          <div className="stat-value">{stats.unreviewed_count}</div>
          <div className="stat-subtext">Awaiting acknowledgement</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("in_review") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("in_review")}
        >
          <div className="stat-label">{isManager ? "In Review" : "My In Review"}</div>
          <div className="stat-value">{stats.in_review_count}</div>
          <div className="stat-subtext">Actively investigated</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("resolved") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("resolved")}
        >
          <div className="stat-label">{isManager ? "Resolved" : "My Resolved"}</div>
          <div className="stat-value">{stats.resolved_count}</div>
          <div className="stat-subtext">Closed incidents</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("flagged") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("flagged")}
        >
          <div className="stat-label">{isManager ? "Flagged" : "My Flagged"}</div>
          <div className="stat-value">{stats.flagged_count}</div>
          <div className="stat-subtext">Manager attention queue</div>
        </button>
      </div>

      {isManager && (
        <div className="manager-insight-grid" style={{ marginTop: "20px", marginBottom: "16px" }}>
          <div className="card manager-panel">
            <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="card-title" style={{ margin: 0 }}>🚩 Flagged Watchlist (Open)</h3>
              <span style={{ color: "var(--muted)", fontSize: "12px" }}>
                Top {flaggedOpenWatchlist.length} oldest flagged
              </span>
            </div>
            {flaggedOpenWatchlist.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
                No open flagged logs right now.
              </p>
            ) : (
              <div className="manager-watchlist-table-wrap" style={{ overflowX: "auto" }}>
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Log</th>
                      <th>Service</th>
                      <th>Anomaly</th>
                      <th>Age</th>
                      <th>Flagged By</th>
                      <th>Assigned</th>
                      <th>Status</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedOpenWatchlist.map((log) => (
                      <tr
                        key={`watch-${log.log_id}`}
                        onClick={() => {
                          setSelectedLog(log);
                          setExplanation(null);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <td>#{log.log_id}</td>
                        <td>{log.service}</td>
                        <td>{log.anomaly_score}</td>
                        <td>{formatAge(log.timestamp)}</td>
                        <td>{log.flagged_by || "-"}</td>
                        <td>{log.assigned_to || "-"}</td>
                        <td>{log.status.replace("_", " ")}</td>
                        <td>
                          {watchlistSeverity(log.timestamp) === "critical" ? (
                            <span className="badge badge-risk-critical">60m+</span>
                          ) : watchlistSeverity(log.timestamp) === "warn" ? (
                            <span className="badge badge-risk-warn">30m+</span>
                          ) : (
                            <span className="badge badge-risk-normal">normal</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card manager-panel">
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
              <div className="manager-brief-content" style={{ fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap", paddingTop: "4px" }}>
                {briefText}
              </div>
            )}
            {!briefText && !briefLoading && (
              <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
                Click Generate Brief for an AI-powered summary of current queue health and team workload.
              </p>
            )}
          </div>
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

      {activeFilterChips.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginTop: "-8px",
            marginBottom: "14px",
          }}
        >
          <span style={{ color: "var(--muted)", fontSize: "12px", fontWeight: 600 }}>Active view:</span>
          {activeFilterChips.map((chip) => (
            <span key={chip} className="active-filter-chip">{chip}</span>
          ))}
          <button
            className="button button-secondary button-small"
            onClick={() => {
              setActiveMetric(null);
              setFilters({ level: "", service: "", status: "", anomaly_only: false, sort: "timestamp" });
            }}
          >
            Clear all
          </button>
        </div>
      )}

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
          onToggleFlag={handleFlag}
          isFlagLoading={flagLoading}
          saveMessage={saveMessage}
          safeMode={safeMode}
          onSafeModeChange={setSafeMode}
          isLoading={explainLoading}
          explanation={explanation || undefined}
          isManager={isManager}
          canFlag={canChangeWorkflow && (isManager || selectedLog.assigned_to === username)}
        />
      )}
    </div>
  );
}
