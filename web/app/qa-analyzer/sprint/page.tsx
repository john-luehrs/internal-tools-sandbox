"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  addQADefectNote,
  assignQADefect,
  approveQADuplicateMergeRequest,
  createQADuplicateMergeRequest,
  getQAHeatmap,
  getQADefectNotes,
  getQADefects,
  listQADuplicateMergeRequests,
  getQASprints,
  runQACluster,
  runQADuplicateDetection,
  rejectQADuplicateMergeRequest,
  updateQADefectStatus,
  getQAReportExportUrl,
} from "@/lib/api";
import {
  QAClusterResult,
  QADefect,
  QADuplicateMergeRequestItem,
  QADuplicateResult,
  QAHeatmapPoint,
  QANote,
  QASprint,
} from "@/lib/types";
import { useRoleContext } from "@/lib/RoleContext";

const QA_ROLES = new Set(["qa_engineer", "qa_lead", "qa_manager"]);
const QA_ANALYSIS_ROLES = new Set(["qa_lead", "qa_manager"]);
const QA_MERGE_REVIEW_ROLES = new Set(["qa_lead", "qa_manager"]);
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

function getErrorText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function getSeverityBadgeStyle(severity: "critical" | "high" | "medium" | "low") {
  if (severity === "critical") {
    return { background: "rgba(220,38,38,0.16)", border: "1px solid rgba(248,113,113,0.35)", color: "#fecaca" };
  }
  if (severity === "high") {
    return { background: "rgba(234,88,12,0.16)", border: "1px solid rgba(251,146,60,0.35)", color: "#fdba74" };
  }
  if (severity === "medium") {
    return { background: "rgba(202,138,4,0.16)", border: "1px solid rgba(250,204,21,0.35)", color: "#fde68a" };
  }
  return { background: "rgba(22,163,74,0.16)", border: "1px solid rgba(74,222,128,0.35)", color: "#bbf7d0" };
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
  const [duplicateCanonicalByIndex, setDuplicateCanonicalByIndex] = useState<Record<number, number>>({});
  const [duplicateFocusDefectIds, setDuplicateFocusDefectIds] = useState<number[] | null>(null);
  const [analysisHasRun, setAnalysisHasRun] = useState(false);
  const [analysisMinimized, setAnalysisMinimized] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [mergeRequests, setMergeRequests] = useState<QADuplicateMergeRequestItem[]>([]);
  const [leadQueueError, setLeadQueueError] = useState("");
  const [leadQueueOpen, setLeadQueueOpen] = useState(false);
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
  const canRunDuplicateDetection = isQaRole;
  const canSubmitDuplicateMergeRequest = isQaRole;
  const canApproveDuplicateMergeRequest = QA_MERGE_REVIEW_ROLES.has(role);

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

  useEffect(() => {
    setDuplicateCanonicalByIndex((prev) => {
      const next: Record<number, number> = { ...prev };
      duplicateResults.forEach((group, idx) => {
        const exists = next[idx] && group.items.some((item) => item.defect_id === next[idx]);
        if (!exists && group.items.length) next[idx] = group.items[0].defect_id;
      });
      Object.keys(next).forEach((key) => {
        if (Number(key) >= duplicateResults.length) delete next[Number(key)];
      });
      return next;
    });
  }, [duplicateResults]);

  const loadMergeRequests = async () => {
    if (!canApproveDuplicateMergeRequest) {
      setMergeRequests([]);
      setLeadQueueError("");
      return;
    }
    try {
      const requests = await listQADuplicateMergeRequests("pending", token);
      setMergeRequests(requests);
      setLeadQueueError("");
    } catch (err) {
      setMergeRequests([]);
      setLeadQueueError(getErrorText(err, "Failed to load lead merge queue"));
    }
  };

  useEffect(() => {
    void loadMergeRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);

  useEffect(() => {
    if (!canApproveDuplicateMergeRequest) {
      setLeadQueueOpen(false);
    }
  }, [canApproveDuplicateMergeRequest]);

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

  const selectedDuplicateCanonicalId = useMemo(() => {
    return duplicateCanonicalByIndex[selectedDuplicateIndex] ?? selectedDuplicateGroup?.items[0]?.defect_id ?? null;
  }, [duplicateCanonicalByIndex, selectedDuplicateGroup, selectedDuplicateIndex]);

  const selectedPendingMergeRequest = useMemo(() => {
    if (!selectedDuplicateGroup || !selectedDuplicateCanonicalId || !mergeRequests.length) return null;
    const groupDefectIds = selectedDuplicateGroup.items
      .map((item) => item.defect_id)
      .sort((a, b) => a - b);

    return (
      mergeRequests.find((request) => {
        const requestDefectIds = [request.canonical_defect_id, ...request.source_defect_ids].sort((a, b) => a - b);
        return JSON.stringify(requestDefectIds) === JSON.stringify(groupDefectIds);
      }) ?? null
    );
  }, [mergeRequests, selectedDuplicateCanonicalId, selectedDuplicateGroup]);

  const visibleDefects = useMemo(() => {
    if (!duplicateFocusDefectIds?.length) return defects;
    const idSet = new Set(duplicateFocusDefectIds);
    return defects.filter((defect) => idSet.has(defect.defect_id));
  }, [defects, duplicateFocusDefectIds]);

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

  const runDuplicates = async (forceRefresh = false) => {
    try {
      const result = await runQADuplicateDetection(filters.sprints, { forceRefresh }, token);
      const nextGroups = result.groups || [];
      const nextSelectedIndex = 0;
      const nextCanonicalByIndex: Record<number, number> = {};
      nextGroups.forEach((group, idx) => {
        if (group.items.length) nextCanonicalByIndex[idx] = group.items[0].defect_id;
      });
      setDuplicateResults(nextGroups);
      setSelectedDuplicateIndex(0);
      setDuplicateCanonicalByIndex(nextCanonicalByIndex);
      setDuplicateFocusDefectIds(null);
      setAnalysisHasRun(true);
      setAnalysisError("");
      if (result.cached) {
        setMessage("Loaded cached duplicate scan results.");
      }
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
      if (canApproveDuplicateMergeRequest) {
        await loadMergeRequests();
      }
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Failed to run duplicate detection";
      setDuplicateResults([]);
      setSelectedDuplicateIndex(0);
      setDuplicateFocusDefectIds(null);
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

  const submitSelectedDuplicateMergeRequest = async () => {
    if (!selectedDuplicateGroup) return;

    const canonicalId = selectedDuplicateCanonicalId;
    if (!canonicalId) {
      setAnalysisError("Select a canonical defect before merging.");
      return;
    }

    const sourceIds = selectedDuplicateGroup.items
      .map((item) => item.defect_id)
      .filter((id) => id !== canonicalId);

    if (!sourceIds.length) {
      setAnalysisError("At least one non-canonical defect is required to merge.");
      return;
    }

    const approved = window.confirm(
      `Submit merge request for ${sourceIds.length} defect(s) into canonical #${canonicalId}?`
    );
    if (!approved) return;

    try {
      await createQADuplicateMergeRequest(
        canonicalId,
        sourceIds,
        selectedDuplicateGroup.confidence,
        selectedDuplicateGroup.rationale,
        token
      );
      setMessage(`Merge request submitted for ${sourceIds.length} defect(s) into #${canonicalId}.`);
      setAnalysisError("");
      if (canApproveDuplicateMergeRequest) {
        await loadMergeRequests();
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to submit merge request");
    }
  };

  const approveMergeRequest = async (request: QADuplicateMergeRequestItem) => {
    if (!canApproveDuplicateMergeRequest) return;

    const approved = window.confirm(
      `Approve request #${request.request_id} and merge ${request.source_defect_ids.length} defect(s) into #${request.canonical_defect_id}?`
    );
    if (!approved) return;

    try {
      await approveQADuplicateMergeRequest(request.request_id, token);
      setMessage(`Approved request #${request.request_id}. Duplicates merged into #${request.canonical_defect_id}.`);
      setAnalysisError("");
      await loadData();
      await runDuplicates(true);
      await loadMergeRequests();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to approve merge request");
    }
  };

  const rejectMergeRequest = async (request: QADuplicateMergeRequestItem) => {
    if (!canApproveDuplicateMergeRequest) return;

    const reason = window.prompt(`Decline request #${request.request_id}? Optional reason for the audit trail:`) ?? "";

    try {
      await rejectQADuplicateMergeRequest(request.request_id, reason.trim() || undefined, token);
      setMessage(`Rejected request #${request.request_id}.`);
      setAnalysisError("");
      await loadData();
      await runDuplicates(true);
      await loadMergeRequests();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to reject merge request");
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
          {canRunAnalysis ? (
            <>
              <button className="button" onClick={runCluster}>Run AI Clustering</button>
            </>
          ) : null}
          {canRunDuplicateDetection ? <button className="button" onClick={() => runDuplicates(false)}>Find Duplicates</button> : null}
          {canRunAnalysis && analysisHasRun ? (
            <button className="button" onClick={() => setAnalysisMinimized((prev) => !prev)}>
              {analysisMinimized ? "Show Analysis" : "Minimize Analysis"}
            </button>
          ) : null}
          {canApproveDuplicateMergeRequest ? (
            <button
              type="button"
              className="button"
              onClick={() => {
                setLeadQueueOpen(true);
                void loadMergeRequests();
              }}
              style={{ position: "relative", paddingRight: mergeRequests.length ? 44 : undefined }}
            >
              Lead Merge Queue
              {mergeRequests.length ? (
                <span
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    minWidth: 24,
                    height: 24,
                    padding: "0 7px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
                    color: "#f8fafc",
                    fontSize: 11,
                    fontWeight: 800,
                    boxShadow: "0 10px 20px rgba(37, 99, 235, 0.28)",
                    border: "1px solid rgba(191, 219, 254, 0.28)",
                  }}
                  aria-label={`${mergeRequests.length} pending merge requests`}
                >
                  {mergeRequests.length}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>

        {canRunAnalysis || canRunDuplicateDetection ? (
          <div style={{ marginBottom: 12, color: "var(--muted)", fontSize: 12 }}>
            <p style={{ margin: "0 0 4px 0" }}>
              AI Clustering groups defect descriptions into recurring issue themes to reduce manual review time.
            </p>
            <p style={{ margin: 0 }}>
              Duplicate Detection identifies near-duplicate defects using semantic similarity (or deterministic mock fallback when no API key is set).
            </p>
          </div>
        ) : null}

        {(canRunAnalysis || canRunDuplicateDetection) && !analysisMinimized ? (
          <div className="analysis-results-wrap">
            {analysisError ? <p className="analysis-error">{analysisError}</p> : null}

            {canRunAnalysis && clusterResults.length ? (
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

            {canRunDuplicateDetection && duplicateResults.length ? (
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
                          onClick={() => {
                            const groupIds = group.items.map((item) => item.defect_id);
                            setSelectedDuplicateIndex(idx);
                            setDuplicateFocusDefectIds(groupIds);
                          }}
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

                      {canSubmitDuplicateMergeRequest ? (
                        <div style={{ display: "grid", gap: 8, marginTop: 10, marginBottom: 10 }}>
                          <label className="filter-label" style={{ marginBottom: 0 }}>Canonical Defect</label>
                          <select
                            className="filter-select"
                            value={selectedDuplicateCanonicalId ?? ""}
                            onChange={(e) => {
                              const nextCanonical = Number(e.target.value);
                              setDuplicateCanonicalByIndex((prev) => ({ ...prev, [selectedDuplicateIndex]: nextCanonical }));
                            }}
                          >
                            {selectedDuplicateGroup.items.map((item) => (
                              <option key={item.defect_id} value={item.defect_id}>
                                #{item.defect_id} - {item.component || "unknown component"}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="button button-small"
                            onClick={submitSelectedDuplicateMergeRequest}
                            disabled={Boolean(selectedPendingMergeRequest)}
                            title={selectedPendingMergeRequest ? `Request #${selectedPendingMergeRequest.request_id} is already pending` : undefined}
                          >
                            {selectedPendingMergeRequest ? `Request #${selectedPendingMergeRequest.request_id} Pending` : "Submit Merge Request"}
                          </button>
                        </div>
                      ) : (
                        <p className="analysis-rationale" style={{ marginTop: 10 }}>
                          Merge requests are available to QA roles.
                        </p>
                      )}

                      {selectedPendingMergeRequest ? (
                        <div
                          style={{
                            marginBottom: 10,
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid rgba(59,130,246,0.35)",
                            background: "rgba(37,99,235,0.10)",
                          }}
                        >
                          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#bfdbfe", textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Pending Approval
                          </p>
                          <p className="analysis-rationale" style={{ margin: 0 }}>
                            Request #{selectedPendingMergeRequest.request_id} already covers this canonical/source combination.
                          </p>
                        </div>
                      ) : null}

                      <p className="analysis-detail-heading">Full rationale</p>
                      <p className="analysis-rationale">{selectedDuplicateGroup.rationale}</p>
                    </article>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {canApproveDuplicateMergeRequest && leadQueueOpen ? (
          <>
            <div
              onClick={() => setLeadQueueOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.45)",
                zIndex: 30,
              }}
            />
            <aside
              aria-live="polite"
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                width: "min(420px, 100vw)",
                height: "100vh",
                zIndex: 31,
                background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))",
                borderLeft: "1px solid rgba(148,163,184,0.18)",
                boxShadow: "-18px 0 48px rgba(15, 23, 42, 0.42)",
                padding: 18,
                overflowY: "auto",
                display: "grid",
                alignContent: "start",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: "#93c5fd", fontWeight: 800 }}>
                    Lead Action Center
                  </p>
                  <h3 className="card-title" style={{ margin: "4px 0 0" }}>Merge Requests</h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="analysis-chip">{mergeRequests.length} pending</span>
                  <button type="button" className="button button-small" onClick={() => setLeadQueueOpen(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(59,130,246,0.28)",
                  background: "rgba(37,99,235,0.10)",
                }}
              >
                <p style={{ margin: 0, color: "var(--text)", fontWeight: 600 }}>
                  {mergeRequests.length ? `${mergeRequests.length} merge request${mergeRequests.length === 1 ? "" : "s"} waiting for approval.` : "Queue is clear."}
                </p>
                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>
                  Use this sidebar whenever the action-bar badge shows pending work.
                </p>
                {leadQueueError ? (
                  <p style={{ margin: "8px 0 0", color: "#fca5a5", fontSize: 12 }}>
                    {leadQueueError}
                  </p>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="button button-small" onClick={() => void loadMergeRequests()}>
                    Refresh Queue
                  </button>
                </div>
              </div>

              {mergeRequests.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {mergeRequests.map((request) => (
                    <div
                      key={request.request_id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 12,
                        background: "rgba(15,23,42,0.28)",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <p className="analysis-defect-ids" style={{ margin: 0 }}>
                            Request #{request.request_id}: #{request.canonical_defect_id} ← {request.source_defect_ids.map((id) => `#${id}`).join(", ")}
                          </p>
                          <p className="analysis-rationale" style={{ margin: "6px 0 0" }}>
                            By {formatDisplayLabel(request.requested_by)} on {formatDate(request.created_at)}
                          </p>
                        </div>
                        <span className="analysis-chip">Pending</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {request.confidence_score !== null ? (
                          <span className={`analysis-chip analysis-chip-${getConfidenceLabel(request.confidence_score)}`}>
                            {(request.confidence_score * 100).toFixed(0)}% match
                          </span>
                        ) : null}
                        {request.canonical_defect?.sprint_id ? (
                          <span className="analysis-chip">Sprint {request.canonical_defect.sprint_id}</span>
                        ) : null}
                        <span className="analysis-chip">{request.source_defects.length} incoming</span>
                      </div>
                      {request.reason ? <p className="analysis-rationale" style={{ margin: 0 }}>{request.reason}</p> : null}
                      {request.canonical_defect ? (
                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid rgba(59,130,246,0.22)",
                            background: "rgba(37,99,235,0.08)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#93c5fd", fontWeight: 800 }}>
                              Canonical Ticket
                            </span>
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, ...getSeverityBadgeStyle(request.canonical_defect.severity) }}>
                              {formatDisplayLabel(request.canonical_defect.severity)}
                            </span>
                            <span className="analysis-chip">{formatDisplayLabel(request.canonical_defect.status)}</span>
                          </div>
                          <p style={{ margin: 0, color: "var(--text)", fontWeight: 700 }}>
                            #{request.canonical_defect.defect_id} {request.canonical_defect.title}
                          </p>
                          <p className="analysis-rationale" style={{ margin: 0 }}>
                            {formatDisplayLabel(request.canonical_defect.component)} | Assignee: {request.canonical_defect.assignee ? formatDisplayLabel(request.canonical_defect.assignee) : "Unassigned"}
                          </p>
                        </div>
                      ) : null}
                      {request.source_defects.length ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", fontWeight: 700 }}>
                            Incoming Duplicates
                          </p>
                          {request.source_defects.map((defect) => (
                            <div
                              key={defect.defect_id}
                              style={{
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid rgba(148,163,184,0.14)",
                                background: "rgba(15,23,42,0.22)",
                                display: "grid",
                                gap: 5,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                <p style={{ margin: 0, color: "var(--text)", fontWeight: 600 }}>
                                  #{defect.defect_id} {defect.title}
                                </p>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, ...getSeverityBadgeStyle(defect.severity) }}>
                                    {formatDisplayLabel(defect.severity)}
                                  </span>
                                  <span className="analysis-chip">{formatDisplayLabel(defect.status)}</span>
                                </div>
                              </div>
                              <p className="analysis-rationale" style={{ margin: 0 }}>
                                {formatDisplayLabel(defect.component)} | Assignee: {defect.assignee ? formatDisplayLabel(defect.assignee) : "Unassigned"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="button button-small" onClick={() => approveMergeRequest(request)}>
                          Approve Merge
                        </button>
                        <button type="button" className="button button-small" onClick={() => rejectMergeRequest(request)}>
                          Decline Merge
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analysis-rationale" style={{ margin: 0 }}>
                  No pending merge requests.
                </p>
              )}
            </aside>
          </>
        ) : null}

        {(canRunAnalysis || canRunDuplicateDetection) && analysisMinimized && (clusterResults.length || duplicateResults.length || analysisError) ? (
          <p className="analysis-minimized-note">Analysis results minimized. Click "Show Analysis" to expand.</p>
        ) : null}

        {duplicateFocusDefectIds?.length ? (
          <div className="card" style={{ marginBottom: 12, padding: 12 }}>
            <p style={{ margin: "0 0 8px 0" }}>
              Showing defects for selected duplicate group: <strong>{duplicateFocusDefectIds.map((id) => `#${id}`).join(", ")}</strong>
            </p>
            <button type="button" className="button button-small" onClick={() => setDuplicateFocusDefectIds(null)}>
              Clear Duplicate Group Filter
            </button>
          </div>
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
              {visibleDefects.map((defect) => (
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
