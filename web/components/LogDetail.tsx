"use client";

import React, { useEffect, useState } from "react";
import { Log } from "@/lib/types";

interface LogDetailProps {
  log: Log | null;
  onClose?: () => void;
  onExplain?: () => void;
  onUpdateAssignment?: (logId: number, assignedTo: string | null, status: string) => void;
  onToggleFlag?: (logId: number, flagged: boolean, reason?: string) => void;
  isAssignmentLoading?: boolean;
  isFlagLoading?: boolean;
  saveMessage?: { text: string; type: "success" | "error" } | null;
  safeMode?: boolean;
  onSafeModeChange?: (value: boolean) => void;
  isLoading?: boolean;
  explanation?: string;
  isManager?: boolean;
  canFlag?: boolean;
}

const TEAM_MEMBERS = ["alice", "bob", "carol", "david"];

export default function LogDetail({
  log,
  onClose,
  onExplain,
  onUpdateAssignment,
  onToggleFlag,
  isAssignmentLoading,
  isFlagLoading,
  saveMessage,
  safeMode = true,
  onSafeModeChange,
  isLoading,
  explanation,
  isManager = false,
  canFlag = true,
}: LogDetailProps) {
  if (!log) return null;

  const currentlyFlagged = log.is_flagged === 1 || log.is_flagged === true;
  const [assignedToValue, setAssignedToValue] = useState(log.assigned_to || "");
  const [statusValue, setStatusValue] = useState(log.status);
  const [flagReason, setFlagReason] = useState(log.flagged_reason || "");

  useEffect(() => {
    setAssignedToValue(log.assigned_to || "");
    setStatusValue(log.status);
    setFlagReason(log.flagged_reason || "");
  }, [log.log_id, log.assigned_to, log.status, log.flagged_reason]);

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

          {log.anomaly_score > 75 && (
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ color: "var(--muted)", fontSize: "12px" }}>Anomaly Flag</label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span className={currentlyFlagged ? "badge badge-warn" : "badge badge-info"}>
                  {currentlyFlagged ? "Flagged" : "Not flagged"}
                </span>
                <button
                  className={`button button-${currentlyFlagged ? "secondary" : "primary"} button-small`}
                  onClick={() => onToggleFlag?.(log.log_id, !currentlyFlagged, currentlyFlagged ? undefined : flagReason)}
                  disabled={isFlagLoading || !canFlag}
                >
                  {isFlagLoading ? "Saving..." : currentlyFlagged ? "Remove Flag" : "Flag Anomaly"}
                </button>
              </div>
              {!canFlag && (
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
                  Only the assigned engineer or manager/admin can flag this log.
                </p>
              )}
              {!currentlyFlagged && (
                <textarea
                  className="filter-select"
                  placeholder="Optional reason for flag"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  disabled={isFlagLoading || !canFlag}
                  rows={2}
                  style={{ resize: "vertical", overflowY: "auto", minHeight: "52px", maxHeight: "120px" }}
                />
              )}
              {currentlyFlagged && (
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
                  {log.flagged_reason ? `Reason: ${log.flagged_reason}` : "No reason provided"}
                  {log.flagged_by ? ` • by ${log.flagged_by}` : ""}
                </p>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ color: "var(--muted)", fontSize: "12px", display: "block", marginBottom: "6px" }}>
                Assign To
              </label>
              {isManager ? (
                <select
                  className="filter-select"
                  value={assignedToValue}
                  onChange={(e) => setAssignedToValue(e.target.value)}
                  disabled={isAssignmentLoading}
                >
                  <option value="">Unassigned</option>
                  {TEAM_MEMBERS.map((member) => (
                    <option key={member} value={member}>
                      {member}
                    </option>
                  ))}
                </select>
              ) : (
                <p style={{ margin: "4px 0 0 0" }}>{log.assigned_to || "Unassigned"}</p>
              )}
            </div>
            <div>
              <label style={{ color: "var(--muted)", fontSize: "12px", display: "block", marginBottom: "6px" }}>
                Status
              </label>
              <select
                className="filter-select"
                value={statusValue}
                onChange={(e) => setStatusValue(e.target.value as Log["status"])}
                disabled={isAssignmentLoading}
              >
                <option value="unreviewed">Unreviewed</option>
                <option value="in_review">In Review</option>
                <option value="resolved">Resolved</option>
              </select>
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
            <>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--muted)", fontSize: "12px" }}>
                <input
                  type="checkbox"
                  checked={safeMode}
                  onChange={(e) => onSafeModeChange?.(e.target.checked)}
                />
                Safe AI mode (redact sensitive fields)
              </label>
              <button className="button button-primary button-small" onClick={onExplain} disabled={isLoading}>
                {isLoading ? "Loading..." : "Get AI Explanation"}
              </button>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {saveMessage && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: saveMessage.type === "success" ? "var(--color-success)" : "var(--color-error)",
                }}
              >
                {saveMessage.text}
              </span>
            )}
            <button
              className="button button-primary button-small"
              onClick={() => onUpdateAssignment?.(log.log_id, assignedToValue || null, statusValue)}
              disabled={isAssignmentLoading || isFlagLoading}
            >
              {isAssignmentLoading ? "Saving..." : "Save Assignment"}
            </button>
          </div>
          <button className="button button-secondary button-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
