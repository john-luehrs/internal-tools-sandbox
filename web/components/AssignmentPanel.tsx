"use client";

import React, { useState } from "react";

interface AssignmentPanelProps {
  onAssign?: (logId: number, assignedTo: string | null, status?: string) => void;
  isLoading?: boolean;
}

const TEAM_MEMBERS = ["alice", "bob", "carol", "david"];

export default function AssignmentPanel({ onAssign, isLoading }: AssignmentPanelProps) {
  const [logId, setLogId] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const handleSubmit = () => {
    if (!logId) {
      alert("Please enter a log ID");
      return;
    }

    onAssign?.(
      parseInt(logId),
      assignedTo || null,
      status || undefined
    );

    setLogId("");
    setAssignedTo("");
    setStatus("");
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Quick Assign</h3>
      </div>

      <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="filter-group">
          <label className="filter-label">Log ID</label>
          <input
            type="number"
            className="filter-input"
            placeholder="e.g., 42"
            value={logId}
            onChange={(e) => setLogId(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Assign To</label>
          <select
            className="filter-select"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Unassigned</option>
            {TEAM_MEMBERS.map((member) => (
              <option key={member} value={member}>
                {member}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select
            className="filter-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={isLoading}
          >
            <option value="">No Change</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="in_review">In Review</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            className="button button-primary"
            onClick={handleSubmit}
            disabled={isLoading}
            style={{ width: "100%" }}
          >
            {isLoading ? "Updating..." : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
