"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import LogTable from "@/components/LogTable";
import LogDetail from "@/components/LogDetail";
import Filters from "@/components/Filters";
import AssignmentPanel from "@/components/AssignmentPanel";
import { getTeamLogs, getLogStats, assignLog, explainLog } from "@/lib/api";
import { Log } from "@/lib/types";

export default function TeamDashboard() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState({ total_high_anomaly: 0, unassigned_count: 0, unreviewed_count: 0, in_review_count: 0, resolved_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const [filters, setFilters] = useState({
    level: "",
    service: "",
    status: "",
    anomaly_only: false,
    unassigned_only: false,
    sort: "timestamp",
  });

  const [assignLoading, setAssignLoading] = useState(false);

  // Load logs and stats
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [logsData, statsData] = await Promise.all([getTeamLogs(), getLogStats()]);
        setLogs(logsData);
        setStats(statsData);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logs");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = logs;

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
    if (filters.unassigned_only) {
      filtered = filtered.filter((l) => l.anomaly_score > 75 && !l.assigned_to);
    }

    if (filters.sort === "anomaly") {
      filtered.sort((a, b) => b.anomaly_score - a.anomaly_score);
    } else {
      filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    setFilteredLogs(filtered);
  }, [logs, filters]);

  const handleExplain = async () => {
    if (!selectedLog) return;

    try {
      setExplainLoading(true);
      const response = await explainLog(selectedLog.log_id);
      setExplanation(response.explanation);
    } catch (err) {
      setExplanation(`Error: ${err instanceof Error ? err.message : "Failed to get explanation"}`);
    } finally {
      setExplainLoading(false);
    }
  };

  const handleAssign = async (logId: number, assignedTo: string | null, status?: string) => {
    try {
      setAssignLoading(true);
      const result = await assignLog(logId, assignedTo, status);

      if (result.success && result.log) {
        setLogs((prevLogs) =>
          prevLogs.map((log) => (log.log_id === logId ? result.log : log))
        );
        alert("Log updated successfully");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to assign log");
    } finally {
      setAssignLoading(false);
    }
  };

  const services = Array.from(new Set(logs.map((l) => l.service)));
  const levels = ["ERROR", "WARN", "INFO", "DEBUG"];

  const handleMetricClick = (metric: "anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved") => {
    setFilters((current) => {
      if (metric === "anomaly") {
        const nextAnomalyOnly = !current.anomaly_only;
        return {
          ...current,
          anomaly_only: nextAnomalyOnly,
          unassigned_only: false,
          status: "",
          sort: nextAnomalyOnly ? "anomaly" : "timestamp",
        };
      }

      if (metric === "unassigned") {
        const nextUnassignedOnly = !current.unassigned_only;
        return {
          ...current,
          unassigned_only: nextUnassignedOnly,
          anomaly_only: nextUnassignedOnly,
          status: "",
          sort: nextUnassignedOnly ? "anomaly" : "timestamp",
        };
      }

      const nextStatus = current.status === metric ? "" : metric;
      return {
        ...current,
        status: nextStatus,
        unassigned_only: false,
      };
    });
  };

  const isMetricActive = (metric: "anomaly" | "unassigned" | "unreviewed" | "in_review" | "resolved") => {
    if (metric === "unassigned") {
      return filters.unassigned_only;
    }

    if (metric === "anomaly") {
      return filters.anomaly_only && !filters.unassigned_only;
    }

    return filters.status === metric;
  };

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 8px 0" }}>📊 Log Analyzer — Team Dashboard</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Catch anomalies, assign to team members, track resolution. <Link href="/log-analyzer/my-logs" style={{ color: "#3b82f6" }}>View Team Workload →</Link>
        </p>
      </div>

      {error && (
        <div style={{ padding: "12px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <div className="stats-grid">
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("anomaly") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("anomaly")}
        >
          <div className="stat-label">High Anomaly Logs</div>
          <div className="stat-value">{stats.total_high_anomaly}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("unassigned") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("unassigned")}
        >
          <div className="stat-label">Unassigned</div>
          <div className="stat-value">{stats.unassigned_count}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("unreviewed") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("unreviewed")}
        >
          <div className="stat-label">Unreviewed</div>
          <div className="stat-value">{stats.unreviewed_count}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("in_review") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("in_review")}
        >
          <div className="stat-label">In Review</div>
          <div className="stat-value">{stats.in_review_count}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-interactive ${isMetricActive("resolved") ? "stat-card-active" : ""}`}
          onClick={() => handleMetricClick("resolved")}
        >
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{stats.resolved_count}</div>
        </button>
      </div>

      <Filters
        levels={levels}
        services={services}
        anomalyOnly={filters.anomaly_only}
        onLevelChange={(level) => setFilters((current) => ({ ...current, level }))}
        onServiceChange={(service) => setFilters((current) => ({ ...current, service }))}
        onStatusChange={(status) => setFilters((current) => ({ ...current, status, unassigned_only: false }))}
        onAnomalyOnlyChange={(anomaly_only) =>
          setFilters((current) => ({
            ...current,
            anomaly_only,
            unassigned_only: anomaly_only ? current.unassigned_only : false,
            sort: anomaly_only ? current.sort : "timestamp",
          }))
        }
        onSortChange={(sort) => setFilters((current) => ({ ...current, sort }))}
      />

      <AssignmentPanel onAssign={handleAssign} isLoading={assignLoading} />

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
          isLoading={explainLoading}
          explanation={explanation || undefined}
        />
      )}
    </div>
  );
}
