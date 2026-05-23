"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getSupportTickets } from "@/lib/api";
import { useRoleContext } from "@/lib/RoleContext";
import { SupportTicket } from "@/lib/types";

type AgeBySla = {
  slaTier: string;
  avgHours: number;
  oldestHours: number;
  count: number;
};

type SlaRiskTone = "safe" | "warn" | "critical";

function getAgeHours(ticket: SupportTicket): number | null {
  if (!ticket.created_at) return null;
  const createdTs = Date.parse(ticket.created_at);
  if (Number.isNaN(createdTs)) return null;

  const nowTs = Date.now();
  const state = (ticket.sla_state || "active").toLowerCase();
  let endTs = nowTs;

  if (state === "paused" && ticket.sla_paused_at) {
    const pausedTs = Date.parse(ticket.sla_paused_at);
    if (!Number.isNaN(pausedTs)) {
      endTs = pausedTs;
    }
  } else if (state === "met" && ticket.sla_met_at) {
    const metTs = Date.parse(ticket.sla_met_at);
    if (!Number.isNaN(metTs)) {
      endTs = metTs;
    }
  }

  const elapsedSeconds = Math.max(0, (endTs - createdTs) / 1000);
  const pausedSeconds = Math.max(0, ticket.sla_pause_total_seconds || 0);
  const effectiveSeconds = Math.max(0, elapsedSeconds - pausedSeconds);
  return effectiveSeconds / 3600;
}

function formatAge(hours: number): string {
  if (hours < 1) return "<1h";
  const totalHours = Math.floor(hours);
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  if (days === 0) return `${remHours}h`;
  if (remHours === 0) return `${days}d`;
  return `${days}d ${remHours}h`;
}

export default function SupportSidebarContext() {
  const { token } = useRoleContext();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const data = await getSupportTickets(token ?? undefined);
        if (!mounted) return;
        setTickets(data);
        setError("");
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load age stats");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const ageStats = useMemo(() => {
    const withAge = tickets
      .map((ticket) => ({ ticket, ageHours: getAgeHours(ticket) }))
      .filter((entry): entry is { ticket: SupportTicket; ageHours: number } => entry.ageHours !== null);

    if (!withAge.length) {
      return {
        oldestAgeHours: null as number | null,
        averageAgeHours: null as number | null,
        bySla: [] as AgeBySla[],
      };
    }

    const oldestAgeHours = withAge.reduce((max, entry) => Math.max(max, entry.ageHours), 0);
    const averageAgeHours =
      withAge.reduce((sum, entry) => sum + entry.ageHours, 0) / withAge.length;

    const bySlaMap = new Map<string, { sum: number; oldest: number; count: number }>();
    for (const entry of withAge) {
      const key = entry.ticket.sla_tier;
      const current = bySlaMap.get(key) ?? { sum: 0, oldest: 0, count: 0 };
      current.sum += entry.ageHours;
      current.oldest = Math.max(current.oldest, entry.ageHours);
      current.count += 1;
      bySlaMap.set(key, current);
    }

    const priorityOrder = ["platinum", "gold", "silver", "bronze"];
    const bySla = Array.from(bySlaMap.entries())
      .map(([slaTier, stats]) => ({
        slaTier,
        avgHours: stats.sum / stats.count,
        oldestHours: stats.oldest,
        count: stats.count,
      }))
      .sort((a, b) => {
        const ia = priorityOrder.indexOf(a.slaTier.toLowerCase());
        const ib = priorityOrder.indexOf(b.slaTier.toLowerCase());
        if (ia === -1 && ib === -1) return a.slaTier.localeCompare(b.slaTier);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

    return { oldestAgeHours, averageAgeHours, bySla };
  }, [tickets]);

  const slaHeatmapBoxes = useMemo(() => {
    const targets: Record<string, number> = {
      platinum: 2,
      gold: 6,
      silver: 12,
      bronze: 24,
    };
    const ordered = ["platinum", "gold", "silver", "bronze"];
    const bySlaMap = new Map(ageStats.bySla.map((item) => [item.slaTier.toLowerCase(), item]));

    return ordered.map((tier) => {
      const stats = bySlaMap.get(tier);
      const avgHours = stats?.avgHours ?? 0;
      const target = targets[tier];
      const pressure = target > 0 ? avgHours / target : 0;

      let tone: SlaRiskTone = "safe";
      if (pressure > 1.2) {
        tone = "critical";
      } else if (pressure > 0.8) {
        tone = "warn";
      }

      return {
        tier,
        avgHours,
        tone,
        count: stats?.count ?? 0,
      };
    });
  }, [ageStats.bySla]);

  const overallTone = useMemo<SlaRiskTone>(() => {
    if (slaHeatmapBoxes.some((item) => item.tone === "critical" && item.count > 0)) return "critical";
    if (slaHeatmapBoxes.some((item) => item.tone === "warn" && item.count > 0)) return "warn";
    return "safe";
  }, [slaHeatmapBoxes]);

  const avgTone = useMemo<SlaRiskTone>(() => {
    if (ageStats.averageAgeHours === null) return overallTone;
    if (ageStats.averageAgeHours > 16) return "critical";
    if (ageStats.averageAgeHours > 8) return "warn";
    return "safe";
  }, [ageStats.averageAgeHours, overallTone]);

  const oldestTone = useMemo<SlaRiskTone>(() => {
    if (ageStats.oldestAgeHours === null) return overallTone;
    if (ageStats.oldestAgeHours > 24) return "critical";
    if (ageStats.oldestAgeHours > 12) return "warn";
    return "safe";
  }, [ageStats.oldestAgeHours, overallTone]);

  return (
    <div className="sidebar-section support-sidebar-context">
      <h2 className="sidebar-title">Support Queue Age</h2>

      <div className="support-sidebar-panel">
        <p className="support-sidebar-panel-title">Overall Queue Age</p>
        {loading ? (
          <p className="support-sidebar-panel-meta">Loading age tracker...</p>
        ) : error ? (
          <p className="support-sidebar-panel-meta">{error}</p>
        ) : (
          <div className="support-sidebar-overall-grid">
            <div className="support-sidebar-heatmap-item">
              <p className="support-sidebar-heatmap-title">average</p>
              <div className={`support-sidebar-heatmap-box support-sidebar-heatmap-box-${avgTone} support-sidebar-overall-box`}>
                {ageStats.averageAgeHours === null ? "N/A" : formatAge(ageStats.averageAgeHours)}
              </div>
            </div>
            <div className="support-sidebar-heatmap-item">
              <p className="support-sidebar-heatmap-title">oldest</p>
              <div className={`support-sidebar-heatmap-box support-sidebar-heatmap-box-${oldestTone} support-sidebar-overall-box`}>
                {ageStats.oldestAgeHours === null ? "N/A" : formatAge(ageStats.oldestAgeHours)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="support-sidebar-panel">
        <p className="support-sidebar-panel-title">Age by SLA</p>
        {loading ? (
          <p className="support-sidebar-panel-meta">Loading SLA breakdown...</p>
        ) : !slaHeatmapBoxes.some((item) => item.count > 0) ? (
          <p className="support-sidebar-panel-meta">No queue age data available.</p>
        ) : (
          <div className="support-sidebar-heatmap-grid">
            {slaHeatmapBoxes.map((item) => (
              <div key={item.tier} className="support-sidebar-heatmap-item">
                <p className="support-sidebar-heatmap-title">{item.tier}</p>
                <div className={`support-sidebar-heatmap-box support-sidebar-heatmap-box-${item.tone}`}>
                  {item.count > 0 ? `avg ${formatAge(item.avgHours)}` : "N/A"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
