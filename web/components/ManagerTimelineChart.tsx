"use client";

import React, { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

const STACK_ORDER = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
type LevelName = (typeof STACK_ORDER)[number];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeLevel(level: string): LevelName {
  if (level === "ERROR" || level === "WARN" || level === "INFO" || level === "DEBUG") {
    return level;
  }
  return "INFO";
}

function formatTimelineTick(ts: number, spanMs: number): string {
  const d = new Date(ts);
  if (spanMs >= 2 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  if (spanMs >= 2 * 60 * 60 * 1000) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: number;
}) {
  if (!active || !payload || payload.length === 0 || typeof label !== "number") {
    return null;
  }

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid rgba(148, 163, 184, 0.35)",
        borderRadius: "10px",
        padding: "10px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        minWidth: "170px",
      }}
    >
      <div style={{ color: "#cbd5e1", fontSize: "11px", marginBottom: "6px" }}>
        {new Date(label).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
      {payload.map((item) => (
        <div key={item.name} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px" }}>
          <span style={{ color: item.color || "#e2e8f0" }}>{item.name}</span>
          <strong style={{ color: "#f8fafc" }}>{Math.round(item.value ?? 0)}</strong>
        </div>
      ))}
    </div>
  );
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

  const chartData = useMemo(() => {
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
      const ts = Number.isFinite(b.tsMin) ? b.tsMin : minTs + (span * i) / Math.max(bucketCount - 1, 1);
      return {
        ts,
        label: formatTimelineTick(ts, span),
        total: b.total,
        avgAnomaly: b.total > 0 ? Math.round((b.anomalySum / b.total) * 10) / 10 : 0,
        ERROR: b.levels.ERROR,
        WARN: b.levels.WARN,
        INFO: b.levels.INFO,
        DEBUG: b.levels.DEBUG,
      };
    });
  }, [sortedLogs]);

  const maxTotalPerBucket = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(1, ...chartData.map((b) => b.total));
  }, [chartData]);

  const maxLevelCount = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(
      1,
      ...chartData.flatMap((b) => [b.ERROR, b.WARN, b.INFO, b.DEBUG])
    );
  }, [chartData]);

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

  const firstTs = chartData[0]?.ts;
  const lastTs = chartData[chartData.length - 1]?.ts;
  const spanMs = firstTs && lastTs ? Math.max(lastTs - firstTs, 1) : 1;

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

      {!collapsed && (chartData.length === 0 ? (
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

          <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", background: "var(--bg)" }}>
            <div style={{ width: "100%", height: "286px" }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 6 }}>
                  <defs>
                    <linearGradient id="area-error" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={LEVEL_COLORS.ERROR} stopOpacity={0.42} />
                      <stop offset="95%" stopColor={LEVEL_COLORS.ERROR} stopOpacity={0.07} />
                    </linearGradient>
                    <linearGradient id="area-warn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={LEVEL_COLORS.WARN} stopOpacity={0.38} />
                      <stop offset="95%" stopColor={LEVEL_COLORS.WARN} stopOpacity={0.06} />
                    </linearGradient>
                    <linearGradient id="area-info" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={LEVEL_COLORS.INFO} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={LEVEL_COLORS.INFO} stopOpacity={0.06} />
                    </linearGradient>
                    <linearGradient id="area-debug" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={LEVEL_COLORS.DEBUG} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={LEVEL_COLORS.DEBUG} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} opacity={0.7} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    tickFormatter={(value) => formatTimelineTick(Number(value), spanMs)}
                    minTickGap={22}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    domain={
                      viewMode === "stacked"
                        ? [0, Math.max(1, Math.ceil(maxTotalPerBucket * 1.15))]
                        : [0, Math.max(1, Math.ceil(maxLevelCount * 1.2))]
                    }
                  />
                  {viewMode === "stacked" && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                      tick={{ fill: "var(--muted)", fontSize: 10 }}
                    />
                  )}
                  {viewMode === "stacked" && (
                    <ReferenceLine
                      yAxisId="right"
                      y={75}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeOpacity={0.75}
                    />
                  )}
                  <Tooltip content={<ChartTooltip />} />

                  {viewMode === "stacked" && (
                    <>
                      <Area dataKey="DEBUG" yAxisId="left" type="monotone" stackId="levels" stroke={LEVEL_COLORS.DEBUG} fill="url(#area-debug)" strokeWidth={1.2} />
                      <Area dataKey="INFO" yAxisId="left" type="monotone" stackId="levels" stroke={LEVEL_COLORS.INFO} fill="url(#area-info)" strokeWidth={1.2} />
                      <Area dataKey="WARN" yAxisId="left" type="monotone" stackId="levels" stroke={LEVEL_COLORS.WARN} fill="url(#area-warn)" strokeWidth={1.2} />
                      <Area dataKey="ERROR" yAxisId="left" type="monotone" stackId="levels" stroke={LEVEL_COLORS.ERROR} fill="url(#area-error)" strokeWidth={1.2} />
                      <Line
                        dataKey="avgAnomaly"
                        yAxisId="right"
                        type="monotone"
                        stroke="#93c5fd"
                        strokeWidth={2.3}
                        dot={false}
                        name="Avg anomaly"
                        activeDot={{ r: 4, fill: "#93c5fd", stroke: "#0b1220", strokeWidth: 1.5 }}
                      />
                    </>
                  )}

                  {viewMode === "line" && (
                    <>
                      {(["ERROR", "WARN", "INFO", "DEBUG"] as LevelName[])
                        .filter((level) => visibleLevels[level])
                        .map((level) => (
                          <Line
                            key={level}
                            dataKey={level}
                            yAxisId="left"
                            type="monotone"
                            stroke={LEVEL_COLORS[level]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 3.5, fill: LEVEL_COLORS[level], stroke: "#0b1220", strokeWidth: 1.2 }}
                          />
                        ))}
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", gap: "14px", marginTop: "8px", flexWrap: "wrap", fontSize: "11px", color: "var(--muted)" }}>
              <Legend color={LEVEL_COLORS.ERROR} label="ERROR" />
              <Legend color={LEVEL_COLORS.WARN} label="WARN" />
              <Legend color={LEVEL_COLORS.INFO} label="INFO" />
              <Legend color={LEVEL_COLORS.DEBUG} label="DEBUG" />
              {viewMode === "stacked" && <Legend color="#93c5fd" label="Avg anomaly per time bucket" />}
              {viewMode === "stacked" && <Legend color="#f59e0b" label="Anomaly threshold (75)" />}
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
