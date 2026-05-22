"use client";

import React, { useEffect, useMemo, useState } from "react";
import { QA_SIDEBAR_CONTEXT_EVENT } from "@/lib/events";

type SeverityKey = "critical" | "high" | "medium" | "low";

type HeatmapRow = {
  component: string;
  counts: Record<SeverityKey, number>;
  total: number;
};

type SprintMeta = {
  sprint_id: string;
  release_label: string;
  start_date: string;
  end_date: string;
  modules_deployed?: string;
  deploy_success_count?: number;
  deploy_error_count?: number;
};

type QASidebarContextPayload = {
  sprintMeta: SprintMeta | null;
  heatmapRows: HeatmapRow[];
};

const STORAGE_KEY = "qa_sidebar_context";
const SEVERITY_ORDER: SeverityKey[] = ["critical", "high", "medium", "low"];

function normalizePayload(raw: unknown): QASidebarContextPayload {
  if (!raw || typeof raw !== "object") {
    return { sprintMeta: null, heatmapRows: [] };
  }

  const data = raw as Partial<QASidebarContextPayload>;
  const sprintMeta = data.sprintMeta ?? null;
  const heatmapRows = Array.isArray(data.heatmapRows) ? data.heatmapRows : [];
  return { sprintMeta, heatmapRows };
}

export default function QASidebarContext() {
  const [context, setContext] = useState<QASidebarContextPayload>({ sprintMeta: null, heatmapRows: [] });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setContext(normalizePayload(JSON.parse(saved)));
      }
    } catch {
      // Ignore localStorage parse errors.
    }

    const onUpdate = (event: Event) => {
      const custom = event as CustomEvent<QASidebarContextPayload>;
      const next = normalizePayload(custom.detail);
      setContext(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage write errors.
      }
    };

    window.addEventListener(QA_SIDEBAR_CONTEXT_EVENT, onUpdate as EventListener);
    return () => {
      window.removeEventListener(QA_SIDEBAR_CONTEXT_EVENT, onUpdate as EventListener);
    };
  }, []);

  const heatmapRows = context.heatmapRows;
  const deployedModules = (context.sprintMeta?.modules_deployed || "")
    .split(",")
    .map((moduleName) => moduleName.trim())
    .filter(Boolean);

  const severityDistribution = useMemo(() => {
    const totals: Record<SeverityKey, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const row of heatmapRows) {
      for (const severity of SEVERITY_ORDER) {
        totals[severity] += row.counts[severity];
      }
    }

    return SEVERITY_ORDER.map((severity) => ({ severity, count: totals[severity] }));
  }, [heatmapRows]);

  const maxSeverityCount = useMemo(
    () => severityDistribution.reduce((max, item) => Math.max(max, item.count), 0),
    [severityDistribution]
  );

  return (
    <div className="sidebar-section qa-sidebar-context">
      <h2 className="sidebar-title">QA Context</h2>

      <div className="qa-sidebar-panel">
        {context.sprintMeta ? (
          <>
            <p className="qa-sidebar-panel-title">Sprint {context.sprintMeta.sprint_id}</p>
            <p className="qa-sidebar-panel-meta">{context.sprintMeta.release_label}</p>
            <p className="qa-sidebar-panel-meta">
              {context.sprintMeta.start_date} to {context.sprintMeta.end_date}
            </p>
            <p className="qa-sidebar-panel-meta">
              {context.sprintMeta.deploy_success_count ?? 0} ok / {context.sprintMeta.deploy_error_count ?? 0} errors
            </p>
          </>
        ) : (
          <p className="qa-sidebar-panel-meta">Select a sprint in QA Analyzer to pin context.</p>
        )}
      </div>

      <div className="qa-sidebar-panel">
        <p className="qa-sidebar-panel-title">Modules Deployed</p>
        {context.sprintMeta ? (
          deployedModules.length ? (
            <div className="qa-sidebar-module-list">
              {deployedModules.map((moduleName) => (
                <span key={moduleName} className="qa-sidebar-module-chip">
                  {moduleName}
                </span>
              ))}
            </div>
          ) : (
            <p className="qa-sidebar-panel-meta">No modules listed for the selected sprint.</p>
          )
        ) : (
          <p className="qa-sidebar-panel-meta">Select a sprint to view deployed modules.</p>
        )}
      </div>

      <div className="qa-sidebar-panel">
        <p className="qa-sidebar-panel-title">Severity Distribution</p>
        {severityDistribution.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {severityDistribution.map((item) => {
              const color = item.severity === "critical" ? "#dc2626" : item.severity === "high" ? "#ea580c" : item.severity === "medium" ? "#ca8a04" : "#16a34a";
              const pct = maxSeverityCount > 0 ? Math.max(0, (item.count / maxSeverityCount) * 100) : 0;
              return (
                <button
                  key={item.severity}
                  type="button"
                  style={{ background: "none", border: "none", padding: 0, textAlign: "left", color: "var(--text)", cursor: "default" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, textTransform: "capitalize" }}>{item.severity}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>{item.count}</span>
                  </div>
                  <div style={{ background: "rgba(148,163,184,0.15)", borderRadius: 6, overflow: "hidden", height: 5 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.3s" }} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="qa-sidebar-panel-meta">Severity data appears when QA data loads.</p>
        )}
      </div>
    </div>
  );
}
