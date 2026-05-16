"use client";

import React from "react";
import { Log } from "@/lib/types";

interface LogTableProps {
  logs: Log[];
  onSelectLog?: (log: Log) => void;
}

export default function LogTable({ logs, onSelectLog }: LogTableProps) {
  const isFlagged = (log: Log) => log.is_flagged === 1 || log.is_flagged === true;

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case "ERROR":
        return "badge badge-error";
      case "WARN":
        return "badge badge-warn";
      case "INFO":
        return "badge badge-info";
      case "DEBUG":
        return "badge badge-debug";
      default:
        return "badge";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "unreviewed":
        return "badge badge-unreviewed";
      case "in_review":
        return "badge badge-in-review";
      case "resolved":
        return "badge badge-resolved";
      default:
        return "badge";
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="table-container">
      <table className="log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Service</th>
            <th>Level</th>
            <th>Message</th>
            <th>Anomaly</th>
            <th>Flag</th>
            <th>Assigned To</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>
                No logs found
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr
                key={log.log_id}
                onClick={() => onSelectLog?.(log)}
                style={{ cursor: onSelectLog ? "pointer" : "default" }}
                className={log.anomaly_score > 75 ? "anomaly-high" : ""}
              >
                <td>{formatTime(log.timestamp)}</td>
                <td>{log.service}</td>
                <td>
                  <span className={getLevelBadgeClass(log.level)}>{log.level}</span>
                </td>
                <td style={{ maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.message}
                </td>
                <td style={{ fontWeight: log.anomaly_score > 75 ? "bold" : "normal" }}>
                  {log.anomaly_score}
                </td>
                <td>
                  {isFlagged(log) ? (
                    <span className="badge badge-warn">flagged</span>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: "12px" }}>-</span>
                  )}
                </td>
                <td>{log.assigned_to || "—"}</td>
                <td>
                  <span className={getStatusBadgeClass(log.status)}>
                    {log.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
