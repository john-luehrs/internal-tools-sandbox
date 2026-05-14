"use client";

import React from "react";
import { Log } from "@/lib/types";

interface LogDetailProps {
  log: Log | null;
  onClose?: () => void;
  onExplain?: () => void;
  isLoading?: boolean;
  explanation?: string;
}

export default function LogDetail({
  log,
  onClose,
  onExplain,
  isLoading,
  explanation,
}: LogDetailProps) {
  if (!log) return null;

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

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Log Detail — ID {log.log_id}</h2>
        </div>

        <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
          <div>
            <label style={{ color: "var(--muted)", fontSize: "12px" }}>Timestamp</label>
            <p style={{ margin: "4px 0 0 0" }}>{formatTime(log.timestamp)}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ color: "var(--muted)", fontSize: "12px" }}>Service</label>
              <p style={{ margin: "4px 0 0 0" }}>{log.service}</p>
            </div>
            <div>
              <label style={{ color: "var(--muted)", fontSize: "12px" }}>Level</label>
              <p style={{ margin: "4px 0 0 0" }}>
                <span className={getLevelBadgeClass(log.level)}>{log.level}</span>
              </p>
            </div>
          </div>

          <div>
            <label style={{ color: "var(--muted)", fontSize: "12px" }}>Message</label>
            <p style={{ margin: "4px 0 0 0", wordBreak: "break-word" }}>{log.message}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ color: "var(--muted)", fontSize: "12px" }}>Anomaly Score</label>
              <p style={{ margin: "4px 0 0 0", fontSize: "18px", fontWeight: "bold" }}>
                {log.anomaly_score}
              </p>
            </div>
            <div>
              <label style={{ color: "var(--muted)", fontSize: "12px" }}>Assigned To</label>
              <p style={{ margin: "4px 0 0 0" }}>{log.assigned_to || "Unassigned"}</p>
            </div>
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
          {log.anomaly_score > 75 && (
            <button className="button button-primary button-small" onClick={onExplain} disabled={isLoading}>
              {isLoading ? "Loading..." : "Get AI Explanation"}
            </button>
          )}
          <button className="button button-secondary button-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
