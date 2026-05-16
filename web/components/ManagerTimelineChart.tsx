"use client";

import React, { useMemo, useState } from "react";
import { Log } from "@/lib/types";

type Props = {
  logs: Log[];
};

const LEVEL_COLORS: Record<string, string> = {
  ERROR: "#ef4444",
  WARN: "#f59e0b",
  INFO: "#3b82f6",
  DEBUG: "#10b981",
};

const PLOT_LEFT = 2.5;
const PLOT_RIGHT = 99;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;

const STACK_ORDER = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
type LevelName = (typeof STACK_ORDER)[number];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function chooseNiceStepMs(spanMs: number): number {
  const steps = [
    5 * 60 * 1000,
    10 * 60 * 1000,
    15 * 60 * 1000,
    30 * 60 * 1000,
    60 * 60 * 1000,
    2 * 60 * 60 * 1000,
    3 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
    12 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
    2 * 24 * 60 * 60 * 1000,
  ];
  const minTicks = 4;
  const maxTicks = 9;

  // Prefer a rounded step that yields a readable number of ticks.
  for (const step of steps) {
    const tickCount = Math.floor(spanMs / step) + 1;
    if (tickCount >= minTicks && tickCount <= maxTicks) {
      return step;
    }
  }

  // Fallback: closest to target density when span is unusual.
  const target = spanMs / 6;
  let best = steps[0];
  let bestDist = Math.abs(best - target);
  for (const step of steps) {
    const dist = Math.abs(step - target);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

function safeLevel(level: string): LevelName {
  if (level === "ERROR" || level === "WARN" || level === "INFO" || level === "DEBUG") {
    return level;
  }
  return "INFO";
}

export default function ManagerTimelineChart({ logs }: Props) {
  const [viewMode, setViewMode] = useState<"stacked" | "line">("stacked");
  const [collapsed, setCollapsed] = useState(false);
  const [visibleLevels, setVisibleLevels] = useState<Record<LevelName, boolean>>({
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: true,
  });

  const sortedLogs = useMemo(() => {
    return [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [logs]);

  const points = useMemo(() => {
    const sorted = sortedLogs;

    if (sorted.length === 0) return [];

    const minTs = new Date(sorted[0].timestamp).getTime();
    const maxTs = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const span = Math.max(maxTs - minTs, 1);

    return sorted.map((log) => {
      const ts = new Date(log.timestamp).getTime();
      const x = PLOT_LEFT + ((ts - minTs) / span) * PLOT_WIDTH;
      const y = 100 - clamp(log.anomaly_score, 0, 100);
      return {
        id: log.log_id,
        x,
        y,
        level: log.level,
        anomaly: log.anomaly_score,
        service: log.service,
        status: log.status,
        timestamp: log.timestamp,
      };
    });
  }, [sortedLogs]);

  const buckets = useMemo(() => {
    if (sortedLogs.length === 0) return [];

    const minTs = new Date(sortedLogs[0].timestamp).getTime();
    const maxTs = new Date(sortedLogs[sortedLogs.length - 1].timestamp).getTime();
    const span = Math.max(maxTs - minTs, 1);
    const bucketCount = clamp(Math.ceil(sortedLogs.length / 10), 8, 20);

    const tmp = Array.from({ length: bucketCount }, () => ({
      tsMin: Infinity,
      tsMax: -Infinity,
      total: 0,
      anomalySum: 0,
      levels: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 },
    }));

    for (const log of sortedLogs) {
      const ts = new Date(log.timestamp).getTime();
      const idx = Math.min(
        bucketCount - 1,
        Math.floor(((ts - minTs) / span) * bucketCount)
      );
      const b = tmp[idx];
      b.tsMin = Math.min(b.tsMin, ts);
      b.tsMax = Math.max(b.tsMax, ts);
      b.total += 1;
      b.anomalySum += log.anomaly_score;
      b.levels[safeLevel(log.level)] += 1;
    }

    return tmp.map((b, i) => {
      const x =
        bucketCount === 1
          ? PLOT_LEFT + PLOT_WIDTH / 2
          : PLOT_LEFT + (i / (bucketCount - 1)) * PLOT_WIDTH;
      const ts = Number.isFinite(b.tsMin) ? b.tsMin : minTs + (span * i) / Math.max(bucketCount - 1, 1);
      return {
        x,
        ts,
        total: b.total,
        avgAnomaly: b.total > 0 ? b.anomalySum / b.total : 0,
        levels: b.levels,
      };
    });
  }, [sortedLogs]);

  const stackedAreas = useMemo(() => {
    if (buckets.length === 0) return [];
    const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
    const areas: Array<{ level: LevelName; polygon: string }> = [];

    let lower = buckets.map(() => 0);
    for (const level of STACK_ORDER) {
      const upper = buckets.map((b, i) => lower[i] + b.levels[level]);
      const top = buckets.map((b, i) => {
        const y = 100 - (upper[i] / maxTotal) * 100;
        return `${b.x},${y}`;
      });
      const bottom = buckets
        .map((b, i) => {
          const y = 100 - (lower[i] / maxTotal) * 100;
          return `${b.x},${y}`;
        })
        .reverse();

      areas.push({ level, polygon: [...top, ...bottom].join(" ") });
      lower = upper;
    }

    return areas;
  }, [buckets]);

  const maxTotalPerBucket = useMemo(() => {
    if (buckets.length === 0) return 1;
    return Math.max(1, ...buckets.map((b) => b.total));
  }, [buckets]);

  const bucketAvgLine = useMemo(
    () => buckets.map((b) => `${b.x},${100 - clamp(b.avgAnomaly, 0, 100)}`).join(" "),
    [buckets]
  );

  const maxLevelCount = useMemo(() => {
    if (buckets.length === 0) return 1;
    return Math.max(
      1,
      ...buckets.flatMap((b) => [b.levels.ERROR, b.levels.WARN, b.levels.INFO, b.levels.DEBUG])
    );
  }, [buckets]);

  const levelLinePoints = useMemo(() => {
    const build = (level: LevelName) =>
      buckets
        .map((b) => {
          const y = 100 - (b.levels[level] / maxLevelCount) * 100;
          return `${b.x},${y}`;
        })
        .join(" ");

    return {
      ERROR: build("ERROR"),
      WARN: build("WARN"),
      INFO: build("INFO"),
      DEBUG: build("DEBUG"),
    };
  }, [buckets, maxLevelCount]);

  const yAxisTicks = useMemo(() => {
    const maxValue = viewMode === "stacked" ? maxTotalPerBucket : maxLevelCount;
    const fractions = [1, 0.75, 0.5, 0.25, 0];
    return fractions.map((fraction) => ({
      y: 100 - fraction * 100,
      label: String(Math.round(maxValue * fraction)),
    }));
  }, [viewMode, maxTotalPerBucket, maxLevelCount]);

  const stats = useMemo(() => {
    const byLevel = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    for (const l of logs) {
      if (l.level in byLevel) {
        byLevel[l.level as keyof typeof byLevel] += 1;
      }
    }
    const avgAnomaly =
      logs.length > 0
        ? Math.round(logs.reduce((sum, l) => sum + l.anomaly_score, 0) / logs.length)
        : 0;
    return { byLevel, avgAnomaly };
  }, [logs]);

  const firstTs = points[0]?.timestamp || (buckets[0] ? new Date(buckets[0].ts).toISOString() : undefined);
  const lastTs =
    points[points.length - 1]?.timestamp ||
    (buckets[buckets.length - 1] ? new Date(buckets[buckets.length - 1].ts).toISOString() : undefined);

  const timelineTicks = useMemo(() => {
    if (!firstTs || !lastTs) return [];

    const start = new Date(firstTs).getTime();
    const end = new Date(lastTs).getTime();
    const span = Math.max(end - start, 1);
    const stepMs = chooseNiceStepMs(span);

    const ticks: Array<{ key: number; x: number; label: string }> = [];
    const firstTick = Math.ceil(start / stepMs) * stepMs;
    const lastTick = Math.floor(end / stepMs) * stepMs;

    for (let ts = firstTick; ts <= lastTick; ts += stepMs) {
      const x = PLOT_LEFT + ((ts - start) / span) * PLOT_WIDTH;
      const d = new Date(ts);
      const label =
        stepMs >= 24 * 60 * 60 * 1000
          ? d.toLocaleDateString([], { month: "short", day: "numeric" })
          : stepMs >= 60 * 60 * 1000
            ? d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      ticks.push({ key: ts, x, label });
    }

    // Always include visible boundary anchors for context.
    ticks.unshift({
      key: start,
      x: PLOT_LEFT,
      label: new Date(start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    });
    ticks.push({
      key: end,
      x: PLOT_RIGHT,
      label: new Date(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    });

    // Deduplicate overlapping keys from inserted boundaries/interior ticks.
    const unique = Array.from(new Map(ticks.map((t) => [t.key, t])).values());

    // Fallback for very narrow ranges where no rounded interior ticks exist.
    if (unique.length === 0) {
      return [
        { key: start, x: PLOT_LEFT, label: new Date(start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) },
        { key: end, x: PLOT_RIGHT, label: new Date(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) },
      ];
    }

    return unique.sort((a, b) => a.x - b.x);
  }, [firstTs, lastTs]);

  const timelineLabelStep = useMemo(() => {
    if (timelineTicks.length <= 6) return 1;
    if (timelineTicks.length <= 10) return 2;
    return 3;
  }, [timelineTicks.length]);

  return (
    <div className="card" style={{ marginTop: "20px", marginBottom: "20px", paddingBottom: collapsed ? "14px" : "20px" }}>
      <div
        className="card-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: collapsed ? 0 : 16,
          paddingBottom: collapsed ? 0 : 12,
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
        }}
      >
        <h3 className="card-title" style={{ margin: 0 }}>Manager Timeline: Log Level + Anomaly</h3>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "Expand" : "Minimize"}
        </button>
      </div>

      {!collapsed && (points.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
          No logs for current filters.
        </p>
      ) : (
        <>

          
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            <button
              type="button"
              className={`button button-small ${viewMode === "stacked" ? "button-primary" : "button-secondary"}`}
              onClick={() => setViewMode("stacked")}
            >
              Stacked Volume
            </button>
            <button
              type="button"
              className={`button button-small ${viewMode === "line" ? "button-primary" : "button-secondary"}`}
              onClick={() => setViewMode("line")}
            >
              Level Lines
            </button>
          </div>

          {viewMode === "line" && (
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              {(["ERROR", "WARN", "INFO", "DEBUG"] as LevelName[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`button button-small ${visibleLevels[level] ? "button-primary" : "button-secondary"}`}
                  onClick={() =>
                    setVisibleLevels((prev) => ({
                      ...prev,
                      [level]: !prev[level],
                    }))
                  }
                  style={{ borderColor: LEVEL_COLORS[level], color: visibleLevels[level] ? "#fff" : LEVEL_COLORS[level] }}
                >
                  {level}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(90px, 1fr))", gap: "8px", marginBottom: "12px" }}>
            <MiniStat label="Logs" value={String(logs.length)} />
            <MiniStat label="Avg Anomaly" value={String(stats.avgAnomaly)} />
            <MiniStat label="Error" value={String(stats.byLevel.ERROR)} color={LEVEL_COLORS.ERROR} />
            <MiniStat label="Warn" value={String(stats.byLevel.WARN)} color={LEVEL_COLORS.WARN} />
            <MiniStat label="Info+Debug" value={String(stats.byLevel.INFO + stats.byLevel.DEBUG)} color={LEVEL_COLORS.INFO} />
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "10px", background: "var(--bg)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr", columnGap: "1px", alignItems: "start" }}>
              <div style={{ position: "relative", height: "260px" }}>
                {yAxisTicks.map((tick) => {
                  const y = tick.y < 2 ? 2 : tick.y > 98 ? 98 : tick.y;
                  return (
                    <div
                      key={`y-gutter-${tick.y}`}
                      style={{
                        position: "absolute",
                        top: `${y}%`,
                        right: "0",
                        transform: "translateY(-50%)",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600, fontFamily: "Segoe UI, Arial, sans-serif" }}>
                        {tick.label}
                      </span>
                      <span style={{ width: "4px", height: "1px", background: "var(--border)", opacity: 0.8 }} />
                    </div>
                  );
                })}
              </div>

              <div>
                <svg viewBox="0 0 100 100" width="100%" height="260" preserveAspectRatio="none" role="img" aria-label="Timeline chart of anomaly and volume by log level">
                  <line x1={PLOT_LEFT} y1="100" x2={PLOT_RIGHT} y2="100" stroke="var(--border)" strokeWidth="0.4" />
                  <line x1={PLOT_LEFT} y1="75" x2={PLOT_RIGHT} y2="75" stroke="var(--border)" strokeWidth="0.2" />
                  <line x1={PLOT_LEFT} y1="50" x2={PLOT_RIGHT} y2="50" stroke="var(--border)" strokeWidth="0.2" />
                  <line x1={PLOT_LEFT} y1="25" x2={PLOT_RIGHT} y2="25" stroke="var(--border)" strokeWidth="0.2" />

                  {viewMode === "stacked" &&
                    stackedAreas.map((area) => (
                      <polygon
                        key={area.level}
                        points={area.polygon}
                        fill={LEVEL_COLORS[area.level]}
                        fillOpacity="0.32"
                        stroke={LEVEL_COLORS[area.level]}
                        strokeWidth="0.15"
                      />
                    ))}

                  {viewMode === "stacked" && (
                    <polyline
                      fill="none"
                      stroke="#93c5fd"
                      strokeWidth="0.55"
                      points={bucketAvgLine}
                    />
                  )}

                  {viewMode === "line" && (
                    <>
                      {(["ERROR", "WARN", "INFO", "DEBUG"] as LevelName[])
                        .filter((level) => visibleLevels[level])
                        .map((level) => (
                          <polyline
                            key={level}
                            fill="none"
                            stroke={LEVEL_COLORS[level]}
                            strokeWidth="0.9"
                            points={levelLinePoints[level]}
                          />
                        ))}
                    </>
                  )}
                </svg>

                <div style={{ marginTop: "8px" }}>
                  <div style={{ position: "relative", height: "26px" }}>
                    {timelineTicks.map((tick, index) => {
                      const isFirst = index === 0;
                      const isLast = index === timelineTicks.length - 1;
                      const showLabel = isFirst || isLast || index % timelineLabelStep === 0;

                      return (
                        <div
                          key={tick.key}
                          style={{
                            position: "absolute",
                            left: `${tick.x}%`,
                            transform: isFirst ? "translateX(0)" : isLast ? "translateX(-100%)" : "translateX(-50%)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: isFirst ? "flex-start" : isLast ? "flex-end" : "center",
                            gap: "3px",
                          }}
                        >
                          <span style={{ width: "1px", height: "6px", background: "var(--border)", opacity: 0.8 }} />
                          {showLabel && (
                            <span style={{ fontSize: "10px", color: "var(--muted)", whiteSpace: "nowrap" }}>{tick.label}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "14px", marginTop: "8px", flexWrap: "wrap", fontSize: "11px", color: "var(--muted)" }}>
              <Legend color={LEVEL_COLORS.ERROR} label="ERROR" />
              <Legend color={LEVEL_COLORS.WARN} label="WARN" />
              <Legend color={LEVEL_COLORS.INFO} label="INFO" />
              <Legend color={LEVEL_COLORS.DEBUG} label="DEBUG" />
              {viewMode === "stacked" && <Legend color="#93c5fd" label="Avg anomaly per time bucket" />}
              <span>
                {viewMode === "stacked"
                  ? "Y-axis: stacked log volume by level"
                  : "Y-axis: log count per level per time bucket, levels can be toggled"}
              </span>
            </div>
          </div>
        </>
      ))}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 10px", background: "var(--bg)" }}>
      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span style={{ width: "9px", height: "9px", borderRadius: "999px", background: color, display: "inline-block" }} />
      <span>{label}</span>
    </span>
  );
}
