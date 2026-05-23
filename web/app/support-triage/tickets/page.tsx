"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getSupportTicketHistory,
  getSupportTicket,
  getSupportTickets,
  summarizeSupportTicket,
  updateSupportTicketEscalation,
  updateSupportTicketSLAState,
} from "@/lib/api";
import { useRoleContext } from "@/lib/RoleContext";
import { SupportTicket, SupportTicketHistoryResponse } from "@/lib/types";

function riskBand(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function riskClass(score: number): string {
  const band = riskBand(score);
  if (band === "critical") return "badge-error";
  if (band === "high") return "badge-warn";
  if (band === "medium") return "badge-info";
  return "badge-success";
}

function escalationBadgeClass(status: SupportTicket["escalation_status"]): string {
  if (status === "requested") return "badge-warn";
  if (status === "approved") return "badge-success";
  if (status === "rejected") return "badge-error";
  return "badge-info";
}

function slaStateBadgeClass(status: SupportTicket["sla_state"]): string {
  if (status === "paused") return "badge-warn";
  if (status === "met") return "badge-success";
  return "badge-info";
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "N/A";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  return new Date(ts).toLocaleString();
}

function formatEventType(value: string): string {
  return (value || "event")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatLabel(value?: string | null): string {
  if (!value) return "N/A";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function refreshTicketHistorySafe(
  ticketId: number,
  token?: string,
  tickets?: SupportTicket[],
  fallbackTicket?: SupportTicket | null
): Promise<{ history?: SupportTicketHistoryResponse; error?: string }> {
  try {
    const history = await getSupportTicketHistory(ticketId, token ?? undefined);
    return { history };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load ticket history";
    if ((message.toLowerCase().includes("not found") || message.includes("404")) && fallbackTicket && tickets) {
      return { history: buildFallbackHistory(fallbackTicket, tickets) };
    }
    return { error: message };
  }
}

function tokenizeText(value: string): Set<string> {
  const cleaned = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  return new Set(cleaned);
}

function similarityScore(left: string, right: string): number {
  const a = tokenizeText(left);
  const b = tokenizeText(right);
  if (!a.size || !b.size) return 0;

  let overlap = 0;
  a.forEach((token) => {
    if (b.has(token)) overlap += 1;
  });
  const union = new Set([...a, ...b]).size;
  if (!union) return 0;
  return overlap / union;
}

function buildFallbackHistory(ticket: SupportTicket, allTickets: SupportTicket[]): SupportTicketHistoryResponse {
  const related = allTickets
    .filter((item) => item.ticket_id !== ticket.ticket_id && item.customer_name === ticket.customer_name)
    .slice(0, 6)
    .map((item) => ({
      ticket_id: item.ticket_id,
      customer_name: item.customer_name,
      sla_tier: item.sla_tier,
      risk_score: item.risk_score,
      description: item.description,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
      escalation_status: item.escalation_status ?? "none",
      sla_state: item.sla_state ?? "active",
    }));

  const baselineText = `${ticket.description || ""} ${ticket.internal_notes || ""}`;
  const similar = allTickets
    .filter((item) => item.ticket_id !== ticket.ticket_id)
    .map((item) => {
      const score = similarityScore(
        baselineText,
        `${item.description || ""} ${item.internal_notes || ""}`
      );
      return { item, score };
    })
    .filter((entry) => entry.score >= 0.14)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ item, score }) => ({
      ticket_id: item.ticket_id,
      customer_name: item.customer_name,
      sla_tier: item.sla_tier,
      risk_score: item.risk_score,
      description: item.description,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
      escalation_status: item.escalation_status ?? "none",
      sla_state: item.sla_state ?? "active",
      similarity_score: Number(score.toFixed(3)),
    }));

  return {
    ticket_id: ticket.ticket_id,
    related_tickets: related,
    similar_tickets: similar,
    events: [],
  };
}

export default function SupportTriagePage() {
  const { role, token } = useRoleContext();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [slaFilter, setSlaFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [escalationFilter, setEscalationFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const [safeMode, setSafeMode] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string>("");
  const [summaryError, setSummaryError] = useState<string>("");
  const [ticketHistory, setTicketHistory] = useState<SupportTicketHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [slaPauseReason, setSlaPauseReason] = useState("");
  const [slaLoading, setSlaLoading] = useState(false);
  const [slaMessage, setSlaMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [escalationTarget, setEscalationTarget] = useState("engineering_on_call");
  const [escalationReason, setEscalationReason] = useState("");
  const [escalationLoading, setEscalationLoading] = useState(false);
  const [escalationMessage, setEscalationMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [hoverTicket, setHoverTicket] = useState<SupportTicket | null>(null);
  const [hoverPreviewVisible, setHoverPreviewVisible] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const showHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailLoadSeqRef = useRef(0);
  const ticketsRef = useRef<SupportTicket[]>([]);

  const canAccess = role === "support_agent" || role === "support_manager";
  const canManageEscalation = role === "support_manager";
  const canManageSLA = role === "support_manager";

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  useEffect(() => {
    const loadTickets = async () => {
      try {
        setLoading(true);
        const data = await getSupportTickets(token ?? undefined);
        setTickets(data);
        ticketsRef.current = data;
        if (data.length) {
          setSelectedId((prev) => prev ?? data[0].ticket_id);
        }
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tickets");
      } finally {
        setLoading(false);
      }
    };

    if (canAccess) {
      void loadTickets();
    }
  }, [canAccess, token]);

  useEffect(() => {
    const loadSelected = async () => {
      if (!selectedId) {
        setSelectedTicket(null);
        setTicketHistory(null);
        return;
      }

      const loadSeq = ++detailLoadSeqRef.current;
      try {
        setHistoryLoading(true);
        const ticket = await getSupportTicket(selectedId, token ?? undefined);
        if (loadSeq !== detailLoadSeqRef.current) return;

        setSelectedTicket(ticket);
        setSummaryText("");
        setSummaryError("");

        const historyResult = await refreshTicketHistorySafe(ticket.ticket_id, token ?? undefined, ticketsRef.current, ticket);
        if (loadSeq !== detailLoadSeqRef.current) return;
        if (historyResult.history) {
          setTicketHistory(historyResult.history);
          setHistoryError("");
        } else {
          setTicketHistory(null);
          setHistoryError(historyResult.error || "Failed to load ticket history");
        }
      } catch (err) {
        if (loadSeq !== detailLoadSeqRef.current) return;

        const message = err instanceof Error ? err.message : "Failed to load ticket details";
        const notFound = message.toLowerCase().includes("ticket not found");

        if (notFound) {
          try {
            const freshTickets = await getSupportTickets(token ?? undefined);
            if (loadSeq !== detailLoadSeqRef.current) return;

            setTickets(freshTickets);
            ticketsRef.current = freshTickets;
            const fallbackId = freshTickets.find((item) => item.ticket_id !== selectedId)?.ticket_id ?? freshTickets[0]?.ticket_id ?? null;
            if (fallbackId !== null && fallbackId !== selectedId) {
              setSelectedId(fallbackId);
            }
            setSummaryError("Queue refreshed after data reseed. Re-loading selected ticket.");
            setHistoryError("");
          } catch {
            setSummaryError(message);
          }
        } else {
          setSummaryError(message);
        }
      } finally {
        if (loadSeq === detailLoadSeqRef.current) {
          setHistoryLoading(false);
        }
      }
    };

    if (canAccess) {
      void loadSelected();
    }
  }, [selectedId, canAccess, token]);

  useEffect(() => {
    if (!selectedTicket) return;
    setEscalationTarget(selectedTicket.escalation_target || "engineering_on_call");
    setEscalationReason(selectedTicket.escalation_reason || "");
    setSlaPauseReason(selectedTicket.sla_pause_reason || "");
    setEscalationMessage(null);
    setSlaMessage(null);
  }, [selectedTicket]);

  const slaOptions = useMemo(() => {
    return Array.from(new Set(tickets.map((t) => t.sla_tier))).sort();
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (slaFilter !== "all" && ticket.sla_tier !== slaFilter) return false;
      if (riskFilter !== "all" && riskBand(ticket.risk_score) !== riskFilter) return false;
      const escalationStatus = ticket.escalation_status || "none";
      if (escalationFilter !== "all" && escalationStatus !== escalationFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${ticket.customer_name} ${ticket.customer_tier} ${ticket.description}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, slaFilter, riskFilter, escalationFilter, search]);

  const stats = useMemo(() => {
    const total = filteredTickets.length;
    const critical = filteredTickets.filter((t) => riskBand(t.risk_score) === "critical").length;
    const high = filteredTickets.filter((t) => riskBand(t.risk_score) === "high").length;
    const platinum = filteredTickets.filter((t) => t.sla_tier === "platinum").length;
    return { total, critical, high, platinum };
  }, [filteredTickets]);

  useEffect(() => {
    setIsClient(true);

    return () => {
      if (showHoverTimerRef.current) {
        clearTimeout(showHoverTimerRef.current);
      }
      if (clearHoverTimerRef.current) {
        clearTimeout(clearHoverTimerRef.current);
      }
    };
  }, []);

  const floatingTooltipStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!hoverPosition) return undefined;

    const tooltipWidth = 360;
    const rightOffset = 22;
    const leftOffset = 18;
    let left = hoverPosition.x + rightOffset;
    let top = hoverPosition.y + 14;

    if (typeof window !== "undefined") {
      if (left + tooltipWidth > window.innerWidth - 12) {
        left = hoverPosition.x - tooltipWidth - leftOffset;
      }

      const maxLeft = window.innerWidth - tooltipWidth - 12;
      left = Math.max(12, Math.min(left, maxLeft));

      const maxTop = window.innerHeight - 120;
      top = Math.max(12, Math.min(top, maxTop));
    }

    return {
      left,
      top,
    };
  }, [hoverPosition]);

  const handleRowMouseEnter = (ticket: SupportTicket, event: React.MouseEvent<HTMLTableRowElement>) => {
    if (showHoverTimerRef.current) {
      clearTimeout(showHoverTimerRef.current);
    }
    if (clearHoverTimerRef.current) {
      clearTimeout(clearHoverTimerRef.current);
    }

    setHoverTicket(ticket);
    setHoverPosition({ x: event.clientX, y: event.clientY });
    setHoverPreviewVisible(false);

    showHoverTimerRef.current = setTimeout(() => {
      setHoverPreviewVisible(true);
    }, 1000);
  };

  const handleRowMouseMove = (event: React.MouseEvent<HTMLTableRowElement>) => {
    setHoverPosition({ x: event.clientX, y: event.clientY });
  };

  const handleRowMouseLeave = () => {
    if (showHoverTimerRef.current) {
      clearTimeout(showHoverTimerRef.current);
    }

    setHoverPreviewVisible(false);

    if (clearHoverTimerRef.current) {
      clearTimeout(clearHoverTimerRef.current);
    }

    clearHoverTimerRef.current = setTimeout(() => {
      setHoverTicket(null);
      setHoverPosition(null);
    }, 500);
  };

  const handleEscalation = async (action: "request" | "approve" | "reject" | "clear") => {
    if (!selectedTicket) return;

    const reason = escalationReason.trim();
    if (action === "request" && reason.length < 5) {
      setEscalationMessage({ type: "error", text: "Escalation reason must be at least 5 characters." });
      return;
    }

    try {
      setEscalationLoading(true);
      setEscalationMessage(null);

      const result = await updateSupportTicketEscalation(
        selectedTicket.ticket_id,
        {
          action,
          reason: action === "request" ? reason : undefined,
          target: action === "request" ? escalationTarget : undefined,
        },
        token ?? undefined
      );

      const updatedTicket = result.ticket;
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
        const updatedList = ticketsRef.current.map((item) => (item.ticket_id === updatedTicket.ticket_id ? updatedTicket : item));
        ticketsRef.current = updatedList;
        setTickets(updatedList);
        const historyResult = await refreshTicketHistorySafe(
          updatedTicket.ticket_id,
          token ?? undefined,
          updatedList,
          updatedTicket
        );
        if (historyResult.history) {
          setTicketHistory(historyResult.history);
          setHistoryError("");
        } else if (historyResult.error) {
          setHistoryError(historyResult.error);
        }
      }

      const messageByAction: Record<typeof action, string> = {
        request: "Escalation requested.",
        approve: "Escalation approved.",
        reject: "Escalation rejected.",
        clear: "Escalation state cleared.",
      };
      setEscalationMessage({ type: "success", text: messageByAction[action] });
    } catch (err) {
      setEscalationMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update escalation",
      });
    } finally {
      setEscalationLoading(false);
    }
  };

  const handleSLAState = async (action: "pause" | "resume" | "mark_met" | "reset_active") => {
    if (!selectedTicket) return;

    const reason = slaPauseReason.trim();
    if (action === "pause" && reason.length < 5) {
      setSlaMessage({ type: "error", text: "Pause reason must be at least 5 characters." });
      return;
    }

    try {
      setSlaLoading(true);
      setSlaMessage(null);

      const result = await updateSupportTicketSLAState(
        selectedTicket.ticket_id,
        {
          action,
          reason: action === "pause" ? reason : undefined,
        },
        token ?? undefined
      );

      const updatedTicket = result.ticket;
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
        const updatedList = ticketsRef.current.map((item) => (item.ticket_id === updatedTicket.ticket_id ? updatedTicket : item));
        ticketsRef.current = updatedList;
        setTickets(updatedList);
        const historyResult = await refreshTicketHistorySafe(
          updatedTicket.ticket_id,
          token ?? undefined,
          updatedList,
          updatedTicket
        );
        if (historyResult.history) {
          setTicketHistory(historyResult.history);
          setHistoryError("");
        } else if (historyResult.error) {
          setHistoryError(historyResult.error);
        }
      }

      const messageByAction: Record<typeof action, string> = {
        pause: "SLA paused.",
        resume: "SLA resumed.",
        mark_met: "SLA marked as met.",
        reset_active: "SLA reset to active.",
      };
      setSlaMessage({ type: "success", text: messageByAction[action] });
    } catch (err) {
      setSlaMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update SLA state",
      });
    } finally {
      setSlaLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedTicket) return;
    try {
      setSummaryLoading(true);
      setSummaryError("");
      const context = `SLA tier: ${selectedTicket.sla_tier}; risk score: ${selectedTicket.risk_score}`;
      const result = await summarizeSupportTicket(
        selectedTicket.description,
        context,
        safeMode,
        selectedTicket.ticket_id,
        token ?? undefined
      );
      setSummaryText(result.summary);
      const historyResult = await refreshTicketHistorySafe(
        selectedTicket.ticket_id,
        token ?? undefined,
        ticketsRef.current,
        selectedTicket
      );
      if (historyResult.history) {
        setTicketHistory(historyResult.history);
        setHistoryError("");
      } else if (historyResult.error) {
        setHistoryError(historyResult.error);
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Support Triage</h2>
        </div>
        <p>This page is available to support roles only.</p>
      </div>
    );
  }

  return (
    <div className="support-page">
      <div className="card">
        <div className="card-header support-header-row">
          <div>
            <h2 className="card-title">Support Ticket Triage</h2>
            <p className="sidebar-muted">Unified ticket context with safe AI-assisted response drafting.</p>
          </div>
        </div>

        <div className="stats-grid support-stats-grid">
          <button type="button" className="stat-card stat-card-interactive" onClick={() => setRiskFilter("all")}>
            <p className="stat-label">Visible Tickets</p>
            <p className="stat-value">{stats.total}</p>
          </button>
          <button type="button" className="stat-card stat-card-interactive" onClick={() => setRiskFilter("critical")}>
            <p className="stat-label">Critical Risk</p>
            <p className="stat-value">{stats.critical}</p>
          </button>
          <button type="button" className="stat-card stat-card-interactive" onClick={() => setRiskFilter("high")}>
            <p className="stat-label">High Risk</p>
            <p className="stat-value">{stats.high}</p>
          </button>
          <button type="button" className="stat-card stat-card-interactive" onClick={() => setSlaFilter("platinum")}>
            <p className="stat-label">Platinum SLA</p>
            <p className="stat-value">{stats.platinum}</p>
          </button>
        </div>

        <div className="filters">
          <div className="filter-group">
            <label className="filter-label" htmlFor="sla-filter">SLA Tier</label>
            <select
              id="sla-filter"
              className="filter-select"
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
            >
              <option value="all">All tiers</option>
              {slaOptions.map((tier) => (
                <option key={tier} value={tier}>
                  {formatLabel(tier)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="risk-filter">Risk Band</label>
            <select
              id="risk-filter"
              className="filter-select"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="all">All risk bands</option>
              <option value="critical">Critical (90-100)</option>
              <option value="high">High (75-89)</option>
              <option value="medium">Medium (50-74)</option>
              <option value="low">Low (0-49)</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="escalation-filter">Escalation</label>
            <select
              id="escalation-filter"
              className="filter-select"
              value={escalationFilter}
              onChange={(e) => setEscalationFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="none">None</option>
              <option value="requested">Requested</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="filter-group support-search-group">
            <label className="filter-label" htmlFor="support-search">Search</label>
            <input
              id="support-search"
              className="filter-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer or description"
            />
          </div>
        </div>

        {loading ? <p>Loading tickets...</p> : null}
        {error ? <p className="login-error">{error}</p> : null}

        <div className="support-layout">
          <div className="card support-list-card">
            <div className="card-header">
              <h3 className="card-title">Queue</h3>
            </div>
            <div className="table-container">
              <table className="log-table support-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Tier</th>
                    <th>SLA</th>
                    <th>Risk</th>
                    <th>Escalation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.ticket_id}
                      className={`support-row-with-tooltip${selectedId === ticket.ticket_id ? " support-row-selected" : ""}`}
                      onClick={() => setSelectedId(ticket.ticket_id)}
                      onMouseEnter={(event) => handleRowMouseEnter(ticket, event)}
                      onMouseMove={handleRowMouseMove}
                      onMouseLeave={handleRowMouseLeave}
                    >
                      <td>#{ticket.ticket_id}</td>
                      <td>{ticket.customer_name}</td>
                      <td>{formatLabel(ticket.customer_tier)}</td>
                      <td>{formatLabel(ticket.sla_tier)}</td>
                      <td>
                        <span className={`badge ${riskClass(ticket.risk_score)}`}>
                          {ticket.risk_score}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${escalationBadgeClass(ticket.escalation_status)}`}>
                          {(ticket.escalation_status || "none").toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card support-detail-card">
            <div className="card-header">
              <h3 className="card-title">Ticket Detail</h3>
            </div>

            {!selectedTicket ? (
              <p className="sidebar-muted">Select a ticket to view full context.</p>
            ) : (
              <>
                <div className="support-detail-grid">
                  <div className="support-detail-block">
                    <p><strong>Customer:</strong> {selectedTicket.customer_name}</p>
                    <p><strong>Tier:</strong> {selectedTicket.customer_tier}</p>
                    <p>
                      <strong>Email:</strong>{" "}
                      {selectedTicket.email ? (
                        <a href={`mailto:${selectedTicket.email}`}>{selectedTicket.email}</a>
                      ) : (
                        "N/A"
                      )}
                    </p>
                    <p>
                      <strong>Phone:</strong>{" "}
                      {selectedTicket.phone ? (
                        <a href={`tel:${selectedTicket.phone}`}>{selectedTicket.phone}</a>
                      ) : (
                        "N/A"
                      )}
                    </p>
                    <p><strong>SLA:</strong> {selectedTicket.sla_tier}</p>
                    <p><strong>Created:</strong> {formatTimestamp(selectedTicket.created_at)}</p>
                    <p><strong>Updated:</strong> {formatTimestamp(selectedTicket.updated_at)}</p>
                    <p>
                      <strong>Risk Score:</strong>{" "}
                      <span className={`badge ${riskClass(selectedTicket.risk_score)}`}>{selectedTicket.risk_score}</span>
                    </p>
                  </div>
                  <div className="support-detail-block">
                    <p><strong>Description</strong></p>
                    <p className="support-description">{selectedTicket.description}</p>
                    <p><strong>Internal Notes</strong></p>
                    <p className="support-description">{selectedTicket.internal_notes}</p>
                  </div>
                </div>

                <div className="support-escalation-panel">
                  <p className="support-timeline-title">Escalation</p>
                  <div className="support-escalation-status-row">
                    <span className={`badge ${escalationBadgeClass(selectedTicket.escalation_status)}`}>
                      {(selectedTicket.escalation_status || "none").toUpperCase()}
                    </span>
                    {selectedTicket.escalation_target ? (
                      <span className="support-sidebar-panel-meta">Target: {selectedTicket.escalation_target}</span>
                    ) : null}
                  </div>
                  <p className="support-sidebar-panel-meta">
                    Requested by: {selectedTicket.escalation_requested_by || "N/A"} at {formatTimestamp(selectedTicket.escalation_requested_at)}
                  </p>
                  <p className="support-sidebar-panel-meta">
                    Processed by: {selectedTicket.escalation_resolved_by || "N/A"} at {formatTimestamp(selectedTicket.escalation_resolved_at)}
                  </p>

                  <div className="support-escalation-controls">
                    <div className="filter-group">
                      <label className="filter-label" htmlFor="escalation-target">Escalation Target</label>
                      <select
                        id="escalation-target"
                        className="filter-select"
                        value={escalationTarget}
                        onChange={(e) => setEscalationTarget(e.target.value)}
                      >
                        <option value="engineering_on_call">Engineering On-Call</option>
                        <option value="billing_ops">Billing Ops</option>
                        <option value="identity_platform">Identity Platform</option>
                        <option value="support_lead">Support Lead</option>
                      </select>
                    </div>

                    <div className="filter-group">
                      <label className="filter-label" htmlFor="escalation-reason">Escalation Reason</label>
                      <textarea
                        id="escalation-reason"
                        className="filter-input support-escalation-reason"
                        value={escalationReason}
                        onChange={(e) => setEscalationReason(e.target.value)}
                        placeholder="Describe impact and why escalation is needed"
                      />
                    </div>

                    <div className="support-escalation-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void handleEscalation("request")}
                        disabled={escalationLoading}
                      >
                        {escalationLoading ? "Saving..." : "Request Escalation"}
                      </button>

                      {canManageEscalation && selectedTicket.escalation_status === "requested" ? (
                        <>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => void handleEscalation("approve")}
                            disabled={escalationLoading}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="button button-danger"
                            onClick={() => void handleEscalation("reject")}
                            disabled={escalationLoading}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}

                      {canManageEscalation && selectedTicket.escalation_status !== "none" ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => void handleEscalation("clear")}
                          disabled={escalationLoading}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {escalationMessage ? (
                    <p className={escalationMessage.type === "error" ? "login-error" : "sidebar-muted"}>
                      {escalationMessage.text}
                    </p>
                  ) : null}
                </div>

                <div className="support-timeline">
                  <p className="support-timeline-title">Triage Timeline</p>
                  <ul>
                    <li>Ticket imported into unified queue.</li>
                    <li>Risk model scored customer at {selectedTicket.risk_score}.</li>
                    <li>SLA tier mapped to {selectedTicket.sla_tier} response policy.</li>
                  </ul>
                </div>

                <div className="support-history-grid">
                  <div className="support-history-card">
                    <p className="support-timeline-title">Customer History</p>
                    {historyLoading ? <p className="sidebar-muted">Loading history...</p> : null}
                    {historyError ? <p className="login-error">{historyError}</p> : null}
                    {!historyLoading && !historyError && !ticketHistory?.related_tickets.length ? (
                      <p className="sidebar-muted">No prior tickets for this customer yet.</p>
                    ) : null}
                    {ticketHistory?.related_tickets?.length ? (
                      <ul>
                        {ticketHistory.related_tickets.map((item) => (
                          <li key={item.ticket_id}>
                            <button
                              type="button"
                              className="support-history-link"
                              onClick={() => setSelectedId(item.ticket_id)}
                            >
                              #{item.ticket_id} - {item.description}
                            </button>
                            <span className="support-history-meta">
                              {item.sla_tier} | risk {item.risk_score} | {formatTimestamp(item.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="support-history-card">
                    <p className="support-timeline-title">Similar Tickets</p>
                    {historyLoading ? <p className="sidebar-muted">Loading similar tickets...</p> : null}
                    {!historyLoading && !historyError && !ticketHistory?.similar_tickets.length ? (
                      <p className="sidebar-muted">No similar tickets crossed the confidence threshold.</p>
                    ) : null}
                    {ticketHistory?.similar_tickets?.length ? (
                      <ul>
                        {ticketHistory.similar_tickets.map((item) => (
                          <li key={item.ticket_id}>
                            <button
                              type="button"
                              className="support-history-link"
                              onClick={() => setSelectedId(item.ticket_id)}
                            >
                              #{item.ticket_id} - {item.description}
                            </button>
                            <span className="support-history-meta">
                              score {(item.similarity_score ?? 0).toFixed(2)} | {item.sla_tier} | risk {item.risk_score}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div className="support-audit-card">
                  <p className="support-timeline-title">Audit Trail</p>
                  {historyLoading ? <p className="sidebar-muted">Loading events...</p> : null}
                  {!historyLoading && !historyError && !ticketHistory?.events.length ? (
                    <p className="sidebar-muted">No events recorded for this ticket yet.</p>
                  ) : null}
                  {ticketHistory?.events?.length ? (
                    <ul className="support-audit-list">
                      {ticketHistory.events.map((event) => (
                        <li key={event.event_id}>
                          <p className="support-audit-title">{formatEventType(event.event_type)}</p>
                          <p className="support-history-meta">
                            {formatTimestamp(event.created_at)} | actor: {event.actor || "system"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="support-ai-card">
                  <div className="support-ai-header">
                    <p className="support-timeline-title">AI Triage Summary</p>
                    <label className="support-safe-toggle">
                      <input
                        type="checkbox"
                        checked={safeMode}
                        onChange={(e) => setSafeMode(e.target.checked)}
                      />
                      Safe mode (scrub PII)
                    </label>
                  </div>

                  <button
                    type="button"
                    className="button button-primary"
                    onClick={handleGenerateSummary}
                    disabled={summaryLoading}
                  >
                    {summaryLoading ? "Generating..." : "Generate summary"}
                  </button>

                  <p className="sidebar-muted support-assistive-note">
                    Assistive output only. Human review is required before sending customer-facing responses.
                  </p>

                  {summaryError ? <p className="login-error">{summaryError}</p> : null}
                  {summaryText ? <p className="support-description">{summaryText}</p> : null}
                </div>
              </>
            )}
          </div>
        </div>

        {isClient && hoverTicket && hoverPosition
          ? createPortal(
              <div
                className={`support-floating-tooltip${hoverPreviewVisible ? " visible" : ""}`}
                style={floatingTooltipStyle}
                role="tooltip"
              >
                {hoverTicket.description}
              </div>,
              document.body
            )
          : null}
      </div>
    </div>
  );
}
