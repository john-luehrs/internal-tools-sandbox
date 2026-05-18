"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  addQADefectNote,
  assignQADefect,
  getQAHeatmap,
  getQADefectNotes,
  getQADefects,
  getQASprints,
  runQACluster,
  runQADuplicateDetection,
  updateQADefectStatus,
  getQAReportExportUrl,
} from "@/lib/api";
import { QAClusterResult, QADefect, QADuplicateResult, QAHeatmapPoint, QANote, QASprint } from "@/lib/types";
import { useRoleContext } from "@/lib/RoleContext";

const QA_ROLES = new Set(["qa_engineer", "qa_lead", "qa_manager"]);
const QA_ANALYSIS_ROLES = new Set(["qa_lead", "qa_manager"]);
const QA_DEFAULT_ASSIGNEES = ["quinn", "riley", "taylor", "morgan"];
const SEVERITY_ORDER: Array<"critical" | "high" | "medium" | "low"> = ["critical", "high", "medium", "low"];

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
}

function formatDisplayLabel(value: string): string {
  const acronymMap: Record<string, string> = {
    qa: "QA",
    api: "API",
    ui: "UI",
    ux: "UX",
    id: "ID",
  };

  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (acronymMap[lower]) return acronymMap[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function normalizeDisplayText(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  return normalized || "-";
}

export default function QASprintPage() {
  const { role, token } = useRoleContext();
  const [sprints, setSprints] = useState<QASprint[]>([]);
  const [defects, setDefects] = useState<QADefect[]>([]);
  const [heatmapPoints, setHeatmapPoints] = useState<QAHeatmapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [heatmapBridgeLabel, setHeatmapBridgeLabel] = useState("");
  const [selected, setSelected] = useState<QADefect | null>(null);
  const [noteText, setNoteText] = useState("");
  const [statusDraft, setStatusDraft] = useState("investigating");
  const [resolutionReason, setResolutionReason] = useState("fixed");
  const [assigneeDraft, setAssigneeDraft] = useState("");
  const [message, setMessage] = useState("");
  const [modalSaveMessage, setModalSaveMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [defectNotes, setDefectNotes] = useState<QANote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [clusterResults, setClusterResults] = useState<QAClusterResult["clusters"]>([]);
  const [duplicateResults, setDuplicateResults] = useState<QADuplicateResult["groups"]>([]);
  const [selectedDuplicateIndex, setSelectedDuplicateIndex] = useState<number>(0);
  const [analysisHasRun, setAnalysisHasRun] = useState(false);
  const [analysisMinimized, setAnalysisMinimized] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisByFilter, setAnalysisByFilter] = useState<
    Record<
      string,
      {
        clusters: QAClusterResult["clusters"];
        duplicates: QADuplicateResult["groups"];
        selectedDuplicateIndex: number;
        hasRun: boolean;
        error: string;
      }
    >
  >({});

  const [filters, setFilters] = useState({
    sprints: [] as string[],
    severity: "",
    component: "",
    status: "",
    assignee: "",
  });

  const isQaRole = QA_ROLES.has(role);
  const canRunAnalysis = QA_ANALYSIS_ROLES.has(role);
  const canApproveDuplicateMerge = role === "qa_lead" || role === "qa_manager";

  const analysisFilterKey = useMemo(
    () =>
      JSON.stringify({
        sprints: [...filters.sprints].sort(),
        severity: filters.severity,
        component: filters.component,
        status: filters.status,
        assignee: filters.assignee,
      }),
    [filters.sprints, filters.severity, filters.component, filters.status, filters.assignee]
  );

  const loadData = async () => {
    if (!isQaRole) return;
    try {
      setLoading(true);
      const [sprintData, defectData, heatmapData] = await Promise.all([
        getQASprints(token),
        getQADefects(filters, token),
        getQAHeatmap(filters.sprints, token),
      ]);
      setSprints(sprintData);
      setDefects(defectData);
      setHeatmapPoints(heatmapData);
      if (selected) {
        const fresh = defectData.find((d) => d.defect_id === selected.defect_id) ?? null;
        setSelected(fresh);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load QA data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role, filters.sprints.join(","), filters.severity, filters.component, filters.status, filters.assignee]);

  useEffect(() => {
    const snapshot = analysisByFilter[analysisFilterKey];
    if (snapshot) {
      setClusterResults(snapshot.clusters);
      setDuplicateResults(snapshot.duplicates);
      setSelectedDuplicateIndex(snapshot.selectedDuplicateIndex);
      setAnalysisHasRun(snapshot.hasRun);
      setAnalysisError(snapshot.error);
      return;
    }
    setClusterResults([]);
    setDuplicateResults([]);
    setSelectedDuplicateIndex(0);
    setAnalysisHasRun(false);
    setAnalysisError("");
  }, [analysisByFilter, analysisFilterKey]);

  const availableComponents = useMemo(() => {
    const set = new Set(defects.map((d) => d.component));
    return Array.from(set).sort();
  }, [defects]);

  const availableAssignees = useMemo(() => {
    const set = new Set(defects.map((d) => d.assignee).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [defects]);

  const assigneeOptions = useMemo(() => {
    return Array.from(new Set([...QA_DEFAULT_ASSIGNEES, ...availableAssignees])).sort();
  }, [availableAssignees]);

  const selectedSprintMeta = useMemo(() => {
    if (filters.sprints.length === 1) {
      return sprints.find((s) => s.sprint_id === filters.sprints[0]) ?? null;
    }
    return null;
  }, [filters.sprints, sprints]);

  const selectedDuplicateGroup = useMemo(() => {
    if (!duplicateResults.length) return null;
    return duplicateResults[selectedDuplicateIndex] ?? duplicateResults[0];
  }, [duplicateResults, selectedDuplicateIndex]);

  const componentHeatmapRows = useMemo(() => {
    const map = new Map<string, Record<string, number>>();

    for (const point of heatmapPoints) {
      if (!map.has(point.component)) {
        map.set(point.component, {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        });
      }
      const row = map.get(point.component);
      if (row) row[point.severity] += point.defect_count;
    }

    return Array.from(map.entries())
      .map(([component, counts]) => {
        const total = SEVERITY_ORDER.reduce((sum, severity) => sum + counts[severity], 0);
        return { component, counts, total };
      })
      .sort((a, b) => b.total - a.total || a.component.localeCompare(b.component));
  }, [heatmapPoints]);

  const severityDistribution = useMemo(() => {
    const totals: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const point of heatmapPoints) {
      totals[point.severity] += point.defect_count;
    }

    return SEVERITY_ORDER.map((severity) => ({ severity, count: totals[severity] }));
  }, [heatmapPoints]);

  const maxSeverityCount = useMemo(
    () => severityDistribution.reduce((max, current) => Math.max(max, current.count), 0),
    [severityDistribution]
  );

  const maxPerSeverity = useMemo(() => {
    const m: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const row of componentHeatmapRows) {
      for (const s of SEVERITY_ORDER) m[s] = Math.max(m[s], row.counts[s]);
    }
    return m;
  }, [componentHeatmapRows]);

  const applyHeatmapFilters = (component?: string, severity?: string) => {
    setFilters((prev) => ({
      ...prev,
      component: component ?? prev.component,
      severity: severity ?? prev.severity,
    }));

    const parts = [];
    if (component) parts.push(`component: ${component}`);
    if (severity) parts.push(`severity: ${formatDisplayLabel(severity)}`);
    setHeatmapBridgeLabel(parts.join(" | "));
  };

  const clearHeatmapBridge = () => {
    setFilters((prev) => ({ ...prev, component: "", severity: "" }));
    setHeatmapBridgeLabel("");
  };

  const exportCsv = async () => {
    try {
      const url = getQAReportExportUrl(filters);
      const response = await fetch(url, {
        headers: {
          Authorization: token,
        },
      });
      if (!response.ok) throw new Error(`CSV export failed (${response.status})`);

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "qa_defects_report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      setMessage("CSV exported.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "CSV export failed");
    }
  };

  const loadDefectNotes = async (defectId: number) => {
    try {
      setNotesLoading(true);
      const notes = await getQADefectNotes(defectId, token);
      setDefectNotes(notes);
      setNotesError("");
    } catch (err) {
      setDefectNotes([]);
      setNotesError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setNotesLoading(false);
    }
  };

  const addNote = async () => {
    if (!selected || !noteText.trim()) return;
    try {
      await addQADefectNote(selected.defect_id, noteText.trim(), token);
      setNoteText("");
      setModalSaveMessage({ text: "Note added.", type: "success" });
      await loadDefectNotes(selected.defect_id);
      await loadData();
    } catch (err) {
      setModalSaveMessage({ text: err instanceof Error ? err.message : "Failed to add note", type: "error" });
    }
  };

  const updateStatus = async () => {
    if (!selected) return;
    try {
      const reason = statusDraft === "resolved" ? resolutionReason : undefined;
      await updateQADefectStatus(selected.defect_id, statusDraft, reason, token);
      setModalSaveMessage({ text: "Status updated.", type: "success" });
      await loadData();
    } catch (err) {
      setModalSaveMessage({ text: err instanceof Error ? err.message : "Failed to update status", type: "error" });
    }
  };

  const updateAssignee = async () => {
    if (!selected) return;
    try {
      await assignQADefect(selected.defect_id, assigneeDraft || null, token);
      setModalSaveMessage({ text: "Assignee updated.", type: "success" });
      await loadData();
    } catch (err) {
      setModalSaveMessage({ text: err instanceof Error ? err.message : "Failed to assign defect", type: "error" });
    }
  };

  const runCluster = async () => {
    try {
      const result = await runQACluster(filters.sprints, token);
      const nextClusters = result.clusters || [];
      setClusterResults(nextClusters);
      setAnalysisHasRun(true);
      setAnalysisError("");
      setAnalysisByFilter((prev) => ({
        ...prev,
        [analysisFilterKey]: {
          clusters: nextClusters,
          duplicates: duplicateResults,
          selectedDuplicateIndex,
          hasRun: true,
          error: "",
        },
      }));
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Failed to run clustering";
      setClusterResults([]);
      setAnalysisHasRun(true);
      setAnalysisError(nextError);
      setAnalysisByFilter((prev) => ({
        ...prev,
        [analysisFilterKey]: {
          clusters: [],
          duplicates: duplicateResults,
          selectedDuplicateIndex,
          hasRun: true,
          error: nextError,
        },
      }));
    }
  };

  const runDuplicates = async () => {
    try {
      const result = await runQADuplicateDetection(filters.sprints, token);
      const nextGroups = result.groups || [];
      const nextSelectedIndex = 0;
      setDuplicateResults(nextGroups);
      setSelectedDuplicateIndex(0);
      setAnalysisHasRun(true);
      setAnalysisError("");
      setAnalysisByFilter((prev) => ({
        ...prev,
        [analysisFilterKey]: {
          clusters: clusterResults,
          duplicates: nextGroups,
          selectedDuplicateIndex: nextSelectedIndex,
          hasRun: true,
          error: "",
        },
      }));
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Failed to run duplicate detection";
      setDuplicateResults([]);
      setSelectedDuplicateIndex(0);
      setAnalysisHasRun(true);
      setAnalysisError(nextError);
      setAnalysisByFilter((prev) => ({
        ...prev,
        [analysisFilterKey]: {
          clusters: clusterResults,
          duplicates: [],
          selectedDuplicateIndex: 0,
          hasRun: true,
          error: nextError,
        },
      }));
    }
  };

  const openDefectDetails = (defect: QADefect) => {
    setSelected(defect);
    setStatusDraft(defect.status);
    setResolutionReason(defect.resolution_reason || "fixed");
    setAssigneeDraft(defect.assignee || "");
    setModalSaveMessage(null);
    setNotesError("");
  };

  const navigateSelectedDefect = (delta: number) => {
    if (!selected || defects.length === 0) return;
    const currentIndex = defects.findIndex((defect) => defect.defect_id === selected.defect_id);
    if (currentIndex < 0) return;

    const nextIndex = (currentIndex + delta + defects.length) % defects.length;
    const nextDefect = defects[nextIndex];
    if (nextDefect) {
      openDefectDetails(nextDefect);
    }
  };

  useEffect(() => {
    if (!selected) return;

    const handleModalKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingField = Boolean(
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      );
      if (isTypingField) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        navigateSelectedDefect(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        navigateSelectedDefect(-1);
      }
    };

    window.addEventListener("keydown", handleModalKeydown);
    return () => {
      window.removeEventListener("keydown", handleModalKeydown);
    };
  }, [selected, defects]);

  useEffect(() => {
    if (!selected) {
      setDefectNotes([]);
      setNotesError("");
      setNotesLoading(false);
      return;
    }
    void loadDefectNotes(selected.defect_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.defect_id, token]);

  if (!isQaRole) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">QA Defect Pattern Analyzer</h2>
        </div>
        <p>This page is available to QA personas only. Use Quinn, Riley, or Morgan from the login selector.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch" }}>
        <div className="card" style={{ minHeight: 280, height: "100%" }}>
          <div className="card-header">
            <h2 className="card-title">QA Defect Pattern Analyzer</h2>
          </div>

          <div className="filters">
            <div className="filter-group" style={{ minWidth: 160 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="filter-label">Sprints</label>
                {filters.sprints.length > 0 && (
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, sprints: [] }))}
                    style={{ fontSize: 11, padding: "1px 6px", cursor: "pointer", background: "none", border: "1px solid var(--border)", borderRadius: 4, color: "var(--muted)", lineHeight: 1.4 }}
                    title="Clear sprint selection (show all sprints)"
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                multiple
                className="filter-select"
                value={filters.sprints}
                onChange={(e) => {
                  const selectedValues = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setFilters((prev) => ({ ...prev, sprints: selectedValues }));
                }}
                style={{ minHeight: 92 }}
              >
                {sprints.map((s) => (
                  <option key={s.sprint_id} value={s.sprint_id}>
                    {s.sprint_id} ({s.release_label})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Severity</label>
              <select className="filter-select" value={filters.severity} onChange={(e) => setFilters((p) => ({ ...p, severity: e.target.value }))}>
                <option value="">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Component</label>
              <select className="filter-select" value={filters.component} onChange={(e) => setFilters((p) => ({ ...p, component: e.target.value }))}>
                <option value="">All</option>
                {availableComponents.map((component) => (
                  <option key={component} value={component}>
                    {component}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Status</label>
              <select className="filter-select" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
                <option value="duplicate_pending">Duplicate Pending</option>
                <option value="duplicate_merged">Duplicate Merged</option>
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Assignee</label>
              <select className="filter-select" value={filters.assignee} onChange={(e) => setFilters((p) => ({ ...p, assignee: e.target.value }))}>
                <option value="">All</option>
                {availableAssignees.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {formatDisplayLabel(assignee)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <section className="card" style={{ padding: 14, minHeight: 280, height: "100%" }}>
          <h3 className="card-title" style={{ marginTop: 0, marginBottom: 4 }}>Component Heatmap</h3>
          <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 12 }}>
            Click a cell to filter by component + severity, or a label to filter by component only.
          </p>
          {componentHeatmapRows.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "max-content repeat(4, 44px)", gap: "4px 6px", width: "fit-content" }}>
              <span />
              {(["critical", "high", "medium", "low"] as const).map((s) => (
                <span key={s} style={{ fontSize: 11, textAlign: "center", color: "var(--muted)", textTransform: "capitalize", paddingBottom: 4 }}>
                  {s}
                </span>
              ))}
              {componentHeatmapRows.map((row) => (
                <React.Fragment key={row.component}>
                  <button
                    type="button"
                    onClick={() => applyHeatmapFilters(row.component, "")}
                    title={`Filter by ${row.component} (${row.total} total)`}
                    style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {row.component}
                  </button>
                  {(["critical", "high", "medium", "low"] as const).map((s) => {
                    const count = row.counts[s];
                    const max = maxPerSeverity[s];
                    const intensity = max > 0 ? 0.12 + 0.88 * (count / max) : 0;
                    const color = s === "critical" ? `rgba(220,38,38,${intensity})` : s === "high" ? `rgba(234,88,12,${intensity})` : s === "medium" ? `rgba(202,138,4,${intensity})` : `rgba(22,163,74,${intensity})`;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => count > 0 ? applyHeatmapFilters(row.component, s) : undefined}
                        title={count > 0 ? `${row.component} / ${s}: ${count} defects` : undefined}
                        style={{
                          background: count > 0 ? color : "rgba(148,163,184,0.06)",
                          border: "1px solid rgba(148,163,184,0.12)",
                          borderRadius: 4,
                          height: 26,
                          cursor: count > 0 ? "pointer" : "default",
                          fontSize: 12,
                          fontWeight: count > 0 ? 600 : 400,
                          color: count > 0 ? "var(--text)" : "transparent",
                        }}
                      >
                        {count > 0 ? count : ""}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--muted)" }}>No heatmap data for the current sprint selection.</p>
          )}
        </section>

        <section className="card" style={{ padding: 14, minHeight: 180, height: "100%" }}>
          {selectedSprintMeta ? (
            <div style={{ display: "grid", gap: 12, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h3 className="card-title" style={{ marginTop: 0, marginBottom: 4 }}>
                    Sprint {selectedSprintMeta.sprint_id}
                  </h3>
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>
                    {selectedSprintMeta.release_label}
                  </p>
                </div>
                <div style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid var(--border)", color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
                  Active sprint
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "rgba(148, 163, 184, 0.04)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Release</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedSprintMeta.release_label}</div>
                </div>

                <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "rgba(148, 163, 184, 0.04)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Date range</div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{selectedSprintMeta.start_date} → {selectedSprintMeta.end_date}</div>
                </div>

                <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "rgba(148, 163, 184, 0.04)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Deployment health</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{selectedSprintMeta.deploy_success_count ?? 0}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>ok</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>/</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{selectedSprintMeta.deploy_error_count ?? 0} errors</span>
                  </div>
                </div>

                <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "rgba(148, 163, 184, 0.04)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Modules</div>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
                    {(selectedSprintMeta.modules_deployed || "not specified")
                      .split(",")
                      .map((moduleName) => moduleName.trim())
                      .filter(Boolean).length}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>deployed</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>Modules deployed</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{selectedSprintMeta.modules_deployed ? "Listed below" : "Not specified"}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(selectedSprintMeta.modules_deployed || "not specified").split(",").map((moduleName) => (
                    <span
                      key={moduleName.trim()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "rgba(148, 163, 184, 0.10)",
                        border: "1px solid rgba(148, 163, 184, 0.14)",
                        color: "var(--text)",
                        fontSize: 11,
                        lineHeight: 1.2,
                      }}
                    >
                      {moduleName.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", placeItems: "center", height: "100%", minHeight: 120, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
              Select a sprint to see its deployment summary.
            </div>
          )}
        </section>

        <section className="card" style={{ padding: 14, minHeight: 180, height: "100%" }}>
          <h3 className="card-title" style={{ marginTop: 0, marginBottom: 4 }}>Severity Distribution</h3>
          <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 12 }}>Click a label to filter by severity.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {severityDistribution.map((item) => {
              const dotColor = item.severity === "critical" ? "#dc2626" : item.severity === "high" ? "#ea580c" : item.severity === "medium" ? "#ca8a04" : "#16a34a";
              const pct = maxSeverityCount > 0 ? Math.max(0, (item.count / maxSeverityCount) * 100) : 0;
              return (
                <button
                  key={item.severity}
                  type="button"
                  onClick={() => applyHeatmapFilters("", item.severity)}
                  title={`Filter defects by ${item.severity} severity`}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", color: "var(--text)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, textTransform: "capitalize" }}>{item.severity}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>{item.count}</span>
                  </div>
                  <div style={{ background: "rgba(148,163,184,0.15)", borderRadius: 6, overflow: "hidden", height: 6 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: dotColor, borderRadius: 6, transition: "width 0.3s" }} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Main content card: actions + defect table ── */}
      <div className="card">

        {heatmapBridgeLabel ? (
          <div className="card" style={{ marginBottom: 12, padding: 12 }}>
            <p style={{ margin: "0 0 8px 0" }}>
              Applied from heatmap: <strong>{heatmapBridgeLabel}</strong>
            </p>
            <button type="button" className="button button-small" onClick={clearHeatmapBridge}>Clear Heatmap Filter</button>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button className="button button-primary" onClick={exportCsv}>Export CSV</button>
          {canRunAnalysis && (
            <>
              <button className="button" onClick={runCluster}>Run AI Clustering</button>
              <button className="button" onClick={runDuplicates}>Find Duplicates</button>
              {analysisHasRun ? (
                <button className="button" onClick={() => setAnalysisMinimized((prev) => !prev)}>
                  {analysisMinimized ? "Show Analysis" : "Minimize Analysis"}
                </button>
              ) : null}
            </>
          )}
        </div>

        {canRunAnalysis ? (
          <div style={{ marginBottom: 12, color: "var(--muted)", fontSize: 12 }}>
            <p style={{ margin: "0 0 4px 0" }}>
              AI Clustering groups defect descriptions into recurring issue themes to reduce manual review time.
            </p>
            <p style={{ margin: 0 }}>
              Duplicate Detection identifies near-duplicate defects using semantic similarity (or deterministic mock fallback when no API key is set).
            </p>
          </div>
        ) : null}

        {canRunAnalysis && !analysisMinimized ? (
          <div className="analysis-results-wrap">
            {analysisError ? <p className="analysis-error">{analysisError}</p> : null}

            {clusterResults.length ? (
              <section className="analysis-panel">
                <h3 className="analysis-panel-title">Cluster Themes</h3>
                <div className="analysis-card-grid">
                  {clusterResults.map((cluster, idx) => (
                    <article key={`${cluster.pattern}-${idx}`} className="analysis-card">
                      <div className="analysis-card-top">
                        <span className="analysis-index">#{idx + 1}</span>
                        <span className="analysis-chip">{cluster.defects.length} defects</span>
                      </div>
                      <p className="analysis-card-title">{cluster.pattern}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {duplicateResults.length ? (
              <section className="analysis-panel">
                <h3 className="analysis-panel-title">Duplicate Groups</h3>
                <div className="duplicate-layout">
                  <div className="duplicate-list" role="list" aria-label="Duplicate groups">
                    {duplicateResults.map((group, idx) => {
                      const isActive = idx === selectedDuplicateIndex;
                      const confidenceLabel = getConfidenceLabel(group.confidence);
                      const shortRationale = group.rationale.length > 92 ? `${group.rationale.slice(0, 92)}...` : group.rationale;
                      return (
                        <button
                          key={`dup-${idx}-${group.items.map((item) => item.defect_id).join("-")}`}
                          type="button"
                          role="listitem"
                          className={`duplicate-list-item ${isActive ? "duplicate-list-item-active" : ""}`}
                          onClick={() => setSelectedDuplicateIndex(idx)}
                        >
                          <div className="analysis-card-top">
                            <span className="analysis-index">Group {idx + 1}</span>
                            <span className={`analysis-chip analysis-chip-${confidenceLabel}`}>
                              {(group.confidence * 100).toFixed(0)}% {confidenceLabel}
                            </span>
                          </div>
                          <p className="analysis-defect-ids">{group.items.length} defects: {group.items.map((item) => `#${item.defect_id}`).join(", ")}</p>
                          <p className="analysis-rationale">{shortRationale}</p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedDuplicateGroup ? (
                    <article className="analysis-card duplicate-detail" aria-live="polite">
                      <div className="analysis-card-top">
                        <span className="analysis-index">Focused Group</span>
                        <span className={`analysis-chip analysis-chip-${getConfidenceLabel(selectedDuplicateGroup.confidence)}`}>
                          {(selectedDuplicateGroup.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      <p className="analysis-detail-heading">Defect IDs</p>
                      <p className="analysis-defect-ids">{selectedDuplicateGroup.items.map((item) => `#${item.defect_id}`).join(", ")}</p>
                      <p className="analysis-detail-heading">Full rationale</p>
                      <p className="analysis-rationale">{selectedDuplicateGroup.rationale}</p>
                    </article>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {canRunAnalysis && analysisMinimized && (clusterResults.length || duplicateResults.length || analysisError) ? (
          <p className="analysis-minimized-note">Analysis results minimized. Click "Show Analysis" to expand.</p>
        ) : null}

        {loading ? <p>Loading QA defects...</p> : null}
        {error ? <p style={{ color: "#ef4444" }}>{error}</p> : null}
        {message ? <p style={{ color: "#22c55e" }}>{message}</p> : null}

        <div className="table-container">
          <table className="log-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Sprint</th>
                <th>Severity</th>
                <th>Component</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Title</th>
              </tr>
            </thead>
            <tbody>
              {defects.map((defect) => (
                <tr
                  key={defect.defect_id}
                  style={{ cursor: "pointer", background: selected?.defect_id === defect.defect_id ? "rgba(59,130,246,0.14)" : undefined }}
                  onClick={() => openDefectDetails(defect)}
                >
                  <td>{defect.defect_id}</td>
                  <td>{defect.sprint_id}</td>
                  <td>{formatDisplayLabel(defect.severity)}</td>
                  <td>{defect.component}</td>
                  <td>{formatDisplayLabel(defect.status)}</td>
                  <td>{defect.assignee ? formatDisplayLabel(defect.assignee) : "-"}</td>
                  <td>{defect.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="modal-overlay" onClick={() => {
          setSelected(null);
          setModalSaveMessage(null);
        }}>
          <div className="modal qa-defect-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header qa-defect-modal-header">
              <h3 className="modal-title">Defect #{selected.defect_id} Details</h3>
              <button className="button button-small" onClick={() => {
                setSelected(null);
                setModalSaveMessage(null);
              }}>Close</button>
            </div>
            <p className="qa-modal-keyboard-hint">
              Keyboard: Arrow Up/Down to move between defects, Esc to close.
            </p>
            {modalSaveMessage ? (
              <p className={`qa-modal-flash qa-modal-flash-${modalSaveMessage.type}`}>
                {modalSaveMessage.text}
              </p>
            ) : null}

            <section className="qa-modal-section">
              <div className="qa-defect-facts-grid">
                <div className="qa-fact qa-fact-full">
                  <span className="qa-fact-label">Title</span>
                  <p className="qa-fact-value">{normalizeDisplayText(selected.title)}</p>
                </div>
                <div className="qa-fact qa-fact-full">
                  <span className="qa-fact-label">Description</span>
                  <p className="qa-fact-value">{normalizeDisplayText(selected.description)}</p>
                </div>
                <div className="qa-fact qa-fact-full">
                  <span className="qa-fact-label">Expected</span>
                  <p className="qa-fact-value">{normalizeDisplayText(selected.expected_result)}</p>
                </div>
                <div className="qa-fact qa-fact-full">
                  <span className="qa-fact-label">Actual</span>
                  <p className="qa-fact-value">{normalizeDisplayText(selected.actual_result)}</p>
                </div>
                <div className="qa-fact">
                  <span className="qa-fact-label">Customer impact</span>
                  <p className="qa-fact-value">{normalizeDisplayText(selected.customer_impact)}</p>
                </div>
                <div className="qa-fact">
                  <span className="qa-fact-label">Created</span>
                  <p className="qa-fact-value">{formatDate(selected.created_at)}</p>
                </div>
                <div className="qa-fact">
                  <span className="qa-fact-label">Updated</span>
                  <p className="qa-fact-value">{formatDate(selected.updated_at)}</p>
                </div>
              </div>
            </section>

            <section className="qa-modal-section">
              <div className="qa-modal-actions-grid">
              <div className="filter-group">
                <label className="filter-label">Update status</label>
                <select className="filter-select" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="escalated">Escalated</option>
                  <option value="resolved">Resolved</option>
                  <option value="duplicate_pending">Duplicate Pending</option>
                  {canApproveDuplicateMerge ? <option value="duplicate_merged">Duplicate Merged</option> : null}
                </select>
                {statusDraft === "resolved" ? (
                  <select className="filter-select" value={resolutionReason} onChange={(e) => setResolutionReason(e.target.value)}>
                    <option value="fixed">Fixed</option>
                    <option value="follow_up_created">Follow Up Created</option>
                    <option value="not_reproducible">Not Reproducible</option>
                  </select>
                ) : null}
                <button className="button" onClick={updateStatus}>Save Status</button>
              </div>

              {canRunAnalysis ? (
                <div className="filter-group">
                  <label className="filter-label">Assign defect</label>
                  <select className="filter-select" value={assigneeDraft} onChange={(e) => setAssigneeDraft(e.target.value)}>
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((assignee) => (
                      <option key={assignee} value={assignee}>
                        {formatDisplayLabel(assignee)}
                      </option>
                    ))}
                  </select>
                  <button className="button" onClick={updateAssignee}>Save Assignee</button>
                </div>
              ) : null}
            </div>
            </section>

            <section className="qa-modal-section">
              <div className="filter-group">
              <label className="filter-label">Add triage note</label>
              <textarea className="filter-input" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Investigation notes, duplicate hints, escalation context..." />
              <button className="button" onClick={addNote}>Add Note</button>
            </div>
            </section>

            <section className="qa-modal-section">
              <div className="filter-group">
              <label className="filter-label">Triage Notes History</label>
              {notesLoading ? <p className="qa-modal-subtle">Loading notes...</p> : null}
              {notesError ? <p className="qa-modal-error">{notesError}</p> : null}
              {!notesLoading && !notesError && defectNotes.length === 0 ? (
                <p className="qa-modal-subtle">No notes added yet.</p>
              ) : null}
              {!notesLoading && defectNotes.length > 0 ? (
                <div className="qa-note-list">
                  {defectNotes.map((note) => (
                    <article key={note.note_id} className="qa-note-item">
                      <p className="qa-note-meta">
                        {formatDisplayLabel(note.author)} • {formatDate(note.created_at)}
                      </p>
                      <p className="qa-note-body">{note.note_body}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
