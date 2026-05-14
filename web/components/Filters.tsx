"use client";

import React from "react";

interface FiltersProps {
  levels: string[];
  services: string[];
  anomalyOnly?: boolean;
  onLevelChange?: (level: string) => void;
  onServiceChange?: (service: string) => void;
  onStatusChange?: (status: string) => void;
  onAnomalyOnlyChange?: (checked: boolean) => void;
  onSortChange?: (sort: string) => void;
}

export default function Filters({
  levels,
  services,
  anomalyOnly = false,
  onLevelChange,
  onServiceChange,
  onStatusChange,
  onAnomalyOnlyChange,
  onSortChange,
}: FiltersProps) {
  return (
    <div className="filters">
      <div className="filter-group">
        <label className="filter-label">Level</label>
        <select className="filter-select" onChange={(e) => onLevelChange?.(e.target.value)}>
          <option value="">All Levels</option>
          {levels.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Service</label>
        <select className="filter-select" onChange={(e) => onServiceChange?.(e.target.value)}>
          <option value="">All Services</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Status</label>
        <select className="filter-select" onChange={(e) => onStatusChange?.(e.target.value)}>
          <option value="">All Status</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="in_review">In Review</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Sort</label>
        <select className="filter-select" onChange={(e) => onSortChange?.(e.target.value)}>
          <option value="timestamp">Newest First</option>
          <option value="anomaly">Highest Anomaly</option>
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label" style={{ visibility: "hidden" }}>
          •
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={anomalyOnly}
            onChange={(e) => onAnomalyOnlyChange?.(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          High Anomaly Only
        </label>
      </div>
    </div>
  );
}
