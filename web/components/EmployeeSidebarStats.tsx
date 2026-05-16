"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cleanupDemoLogs, createDemoAnomalyLog, getTeamLogs } from "@/lib/api";
import {
  TEAM_WORKLOAD_UPDATED_EVENT,
  MTTD_DEMO_NOTIFICATION_EVENT,
  MTTD_DEMO_CLEAR_EVENT,
} from "@/lib/events";
import { useRoleContext } from "@/lib/RoleContext";
import { Log } from "@/lib/types";

type EmployeeStats = {
  name: string;
  assigned: number;
  unreviewed: number;
  inReview: number;
  resolved: number;
};

const EMPLOYEES = ["alice", "bob", "carol", "david"];

function buildEmployeeStats(logs: Log[]): EmployeeStats[] {
  return EMPLOYEES.map((employee) => {
    const assignedLogs = logs.filter((log) => log.assigned_to === employee);

    return {
      name: employee,
      assigned: assignedLogs.length,
      unreviewed: assignedLogs.filter((log) => log.status === "unreviewed").length,
      inReview: assignedLogs.filter((log) => log.status === "in_review").length,
      resolved: assignedLogs.filter((log) => log.status === "resolved").length,
    };
  });
}

export default function EmployeeSidebarStats() {
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [logsSnapshot, setLogsSnapshot] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoLogId, setDemoLogId] = useState<number | null>(null);
  const [demoMinutes, setDemoMinutes] = useState(0);
  const [demoExpanded, setDemoExpanded] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoCleanupLoading, setDemoCleanupLoading] = useState(false);
  const [notificationEvents, setNotificationEvents] = useState<string[]>([]);
  const [alertTone, setAlertTone] = useState<"warn" | "critical" | "escalated" | null>(null);
  const [alertMessage, setAlertMessage] = useState("");
  const previousDemoMinutesRef = React.useRef(0);
  const cleanupUiTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationsSuppressedRef = React.useRef(false);
  const lastSuppressedStatusRef = React.useRef<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedEngineer = searchParams.get("engineer") || "";
  const { token } = useRoleContext();
  const resolvedToken = token ?? undefined;

  const playCriticalBeep = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const now = audioCtx.currentTime;
      const sequence = [0, 0.28, 0.56];

      sequence.forEach((offset) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.08;
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.18);
      });

      window.setTimeout(() => {
        audioCtx.close().catch(() => undefined);
      }, 1100);
    } catch {
      // Best-effort demo signal.
    }
  };

  const triggerDemoStageEffects = (minutes: number, options?: { recordTimeline?: boolean }) => {
    const recordTimeline = options?.recordTimeline ?? true;
    if (!demoLogId) return;
    const now = new Date().toLocaleTimeString();
    const demoLog = logsSnapshot.find((log) => log.log_id === demoLogId);

    if (!demoLog) {
      setAlertTone("critical");
      setAlertMessage(`Demo log #${demoLogId} not found. Start a new demo log.`);
      window.dispatchEvent(new Event(MTTD_DEMO_CLEAR_EVENT));
      return;
    }

    const isAcknowledged = demoLog.status !== "unreviewed";
    if (isAcknowledged) {
      const statusLabel = demoLog.status.replace("_", " ");
      setAlertTone("warn");
      setAlertMessage(`Notifications suppressed: log #${demoLogId} is ${statusLabel}`);
      window.dispatchEvent(new Event(MTTD_DEMO_CLEAR_EVENT));
      if (recordTimeline && (!notificationsSuppressedRef.current || lastSuppressedStatusRef.current !== demoLog.status)) {
        setNotificationEvents((prev) => [
          `${now} - Notifications suppressed (status changed to ${statusLabel})`,
          ...prev,
        ]);
      }
      notificationsSuppressedRef.current = true;
      lastSuppressedStatusRef.current = demoLog.status;
      return;
    }

    if (recordTimeline && notificationsSuppressedRef.current) {
      setNotificationEvents((prev) => [
        `${now} - Notifications resumed (status returned to unreviewed)`,
        ...prev,
      ]);
      notificationsSuppressedRef.current = false;
      lastSuppressedStatusRef.current = null;
    }

    if (minutes >= 15) {
      if (previousDemoMinutesRef.current < 15) {
        playCriticalBeep();
      }
      setAlertTone("escalated");
      setAlertMessage(`Escalated: log #${demoLogId} notified to on-duty lead (PagerDuty + Slack)`);
      window.dispatchEvent(
        new CustomEvent(MTTD_DEMO_NOTIFICATION_EVENT, {
          detail: {
            tone: "escalated",
            message: `Escalation active: log #${demoLogId} unreviewed for 15+ minutes. On-duty team lead notified via PagerDuty + Slack.`,
            banner: true,
          },
        })
      );
      if (recordTimeline) {
        setNotificationEvents((prev) => [
          `${now} - Escalation state shown (15m)` ,
          ...prev,
        ]);
      }
      return;
    }

    if (minutes >= 10) {
      if (previousDemoMinutesRef.current < 10) {
        playCriticalBeep();
      }
      setAlertTone("critical");
      setAlertMessage(`10 min critical: MTTD breach risk for log #${demoLogId}`);
      window.dispatchEvent(
        new CustomEvent(MTTD_DEMO_NOTIFICATION_EVENT, {
          detail: {
            tone: "critical",
            message: `10 min critical: MTTD breach risk for log #${demoLogId}`,
            banner: false,
          },
        })
      );
      if (recordTimeline) {
        setNotificationEvents((prev) => [`${now} - Critical state shown (10m)`, ...prev]);
      }
      return;
    }

    if (minutes >= 5) {
      setAlertTone("warn");
      setAlertMessage(`5 min warning: log #${demoLogId} is approaching MTTD threshold`);
      window.dispatchEvent(
        new CustomEvent(MTTD_DEMO_NOTIFICATION_EVENT, {
          detail: {
            tone: "warn",
            message: `5 min warning: log #${demoLogId} is approaching MTTD threshold`,
            banner: false,
          },
        })
      );
      if (recordTimeline) {
        setNotificationEvents((prev) => [`${now} - Warning state shown (5m)`, ...prev]);
      }
      return;
    }

    setAlertTone(null);
    setAlertMessage("");
    window.dispatchEvent(new Event(MTTD_DEMO_CLEAR_EVENT));
    if (recordTimeline) {
      setNotificationEvents((prev) => [`${now} - No notification state (0-4m)`, ...prev]);
    }
  };

  const startNotificationDemo = async () => {
    try {
      setDemoLoading(true);
      const result = await createDemoAnomalyLog(
        {
          service: "api-service",
          message: "DEMO: checkout requests returning 500 errors in burst pattern",
          anomaly_score: 97,
        },
        resolvedToken
      );

      if (result.success && result.log) {
        setDemoLogId(result.log.log_id);
        setDemoMinutes(0);
        setDemoExpanded(true);
        previousDemoMinutesRef.current = 0;
        notificationsSuppressedRef.current = false;
        lastSuppressedStatusRef.current = null;
        setNotificationEvents([`${new Date().toLocaleTimeString()} - Demo anomaly log created (#${result.log.log_id})`]);
        setAlertTone("warn");
        setAlertMessage(`Demo started: anomalous log #${result.log.log_id} created`);
        window.dispatchEvent(
          new CustomEvent(MTTD_DEMO_NOTIFICATION_EVENT, {
            detail: {
              tone: "warn",
              message: `Demo started: anomalous log #${result.log.log_id} created`,
              banner: false,
            },
          })
        );
        window.dispatchEvent(new Event(TEAM_WORKLOAD_UPDATED_EVENT));
      }
    } catch {
      setAlertTone("critical");
      setAlertMessage("Failed to start demo. Try refreshing and retry.");
      window.dispatchEvent(
        new CustomEvent(MTTD_DEMO_NOTIFICATION_EVENT, {
          detail: {
            tone: "critical",
            message: "Failed to start demo. Try refreshing and retry.",
            banner: false,
          },
        })
      );
    } finally {
      setDemoLoading(false);
    }
  };

  const setDemoMinuteMark = (minutes: number) => {
    setDemoMinutes(minutes);
    triggerDemoStageEffects(minutes);
    previousDemoMinutesRef.current = minutes;
  };

  const endDemoAndCleanup = async () => {
    try {
      setDemoCleanupLoading(true);
      const result = await cleanupDemoLogs(resolvedToken);
      setDemoLogId(null);
      setDemoMinutes(0);
      previousDemoMinutesRef.current = 0;
      notificationsSuppressedRef.current = false;
      lastSuppressedStatusRef.current = null;
      setAlertTone("warn");
      setAlertMessage(`Demo cleanup complete: removed ${result.deleted} demo log(s)`);
      setNotificationEvents((prev) => [
        `${new Date().toLocaleTimeString()} - Demo cleanup removed ${result.deleted} log(s)`,
        ...prev,
      ]);
      window.dispatchEvent(new Event(MTTD_DEMO_CLEAR_EVENT));
      window.dispatchEvent(new Event(TEAM_WORKLOAD_UPDATED_EVENT));

      if (cleanupUiTimerRef.current) {
        clearTimeout(cleanupUiTimerRef.current);
      }
      cleanupUiTimerRef.current = setTimeout(() => {
        setAlertTone(null);
        setAlertMessage("");
        setNotificationEvents([]);
      }, 4000);
    } catch {
      setAlertTone("critical");
      setAlertMessage("Cleanup failed. Try again.");
    } finally {
      setDemoCleanupLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const logs = await getTeamLogs(undefined, resolvedToken);
        setLogsSnapshot(logs);
        setStats(buildEmployeeStats(logs));
      } catch {
        setLogsSnapshot([]);
        setStats(EMPLOYEES.map((name) => ({ name, assigned: 0, unreviewed: 0, inReview: 0, resolved: 0 })));
      } finally {
        setLoading(false);
      }
    };

    const handleWorkloadUpdate = () => {
      load();
    };

    load();
    window.addEventListener(TEAM_WORKLOAD_UPDATED_EVENT, handleWorkloadUpdate);

    return () => {
      window.removeEventListener(TEAM_WORKLOAD_UPDATED_EVENT, handleWorkloadUpdate);
      if (cleanupUiTimerRef.current) {
        clearTimeout(cleanupUiTimerRef.current);
      }
    };
  }, [resolvedToken]);

  useEffect(() => {
    if (!demoLogId) return;
    // Keep top-of-page demo notification state in sync with live status updates.
    triggerDemoStageEffects(demoMinutes, { recordTimeline: false });
  }, [logsSnapshot, demoLogId, demoMinutes]);

  return (
    <div className="sidebar-section sidebar-employee-section">
      <h2 className="sidebar-title">Team Workload</h2>
      <div className="chip-legend">
        <span className="employee-chip employee-chip-unreviewed">Unreviewed</span>
        <span className="employee-chip employee-chip-inreview">In Review</span>
        <span className="employee-chip employee-chip-resolved">Resolved</span>
      </div>
      {loading ? (
        <p className="sidebar-muted">Loading stats...</p>
      ) : (
        <div className="employee-list">
          {stats.map((employee) => (
            <Link
              key={employee.name}
              href={`/log-analyzer/my-logs?engineer=${employee.name}`}
              className={`employee-card-link ${pathname === "/log-analyzer/my-logs" && selectedEngineer === employee.name ? "employee-card-link-active" : ""}`}
            >
              <div className="employee-card">
                <div className="employee-header">
                  <span className="employee-name">{employee.name}</span>
                  <span className="employee-assigned">{employee.assigned}</span>
                </div>
                <div className="employee-meta">
                  <span className="employee-chip employee-chip-unreviewed">{employee.unreviewed}</span>
                  <span className="employee-chip employee-chip-inreview">{employee.inReview}</span>
                  <span className="employee-chip employee-chip-resolved">{employee.resolved}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pathname === "/log-analyzer/team" && (
        <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border)", display: "grid", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <h2 className="sidebar-title" style={{ marginBottom: 0 }}>MTTD Notification Demo</h2>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setDemoExpanded((v) => !v)}
            >
              {demoExpanded ? "Hide" : "Show"}
            </button>
          </div>

          {!demoExpanded && (
            <p className="sidebar-muted" style={{ margin: 0 }}>
              {demoLogId ? `Active log #${demoLogId} at ${demoMinutes}m` : "No active demo"}
            </p>
          )}

          {demoExpanded && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                <button className="button button-primary button-small" onClick={startNotificationDemo} disabled={demoLoading}>
                  {demoLoading ? "Adding..." : "Start Demo"}
                </button>
                <button
                  className="button button-secondary button-small"
                  onClick={endDemoAndCleanup}
                  disabled={demoCleanupLoading}
                >
                  {demoCleanupLoading ? "Cleaning..." : "Cleanup"}
                </button>
              </div>

              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                  <button className="button button-secondary button-small" onClick={() => setDemoMinuteMark(5)} disabled={!demoLogId}>+5m</button>
                  <button className="button button-secondary button-small" onClick={() => setDemoMinuteMark(10)} disabled={!demoLogId}>+10m</button>
                  <button className="button button-secondary button-small" onClick={() => setDemoMinuteMark(15)} disabled={!demoLogId}>+15m</button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={demoMinutes}
                  onChange={(e) => setDemoMinuteMark(Number(e.target.value))}
                  disabled={!demoLogId}
                />
                <p className="sidebar-muted" style={{ margin: 0 }}>Time: {demoMinutes}m</p>
              </div>

              {alertTone && (
                <div
                  style={{
                    borderRadius: "8px",
                    padding: "8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    border:
                      alertTone === "warn"
                        ? "1px solid #facc15"
                        : alertTone === "critical"
                        ? "1px solid #ef4444"
                        : "1px solid #b91c1c",
                    background:
                      alertTone === "warn"
                        ? "#fef9c3"
                        : alertTone === "critical"
                        ? "#7f1d1d"
                        : "#450a0a",
                    color: alertTone === "warn" ? "#713f12" : "#fee2e2",
                  }}
                >
                  {alertMessage}
                </div>
              )}

              <div style={{ maxHeight: "96px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px" }}>
                {notificationEvents.length === 0 ? (
                  <p className="sidebar-muted" style={{ margin: 0 }}>No demo events</p>
                ) : (
                  notificationEvents.slice(0, 4).map((event, index) => (
                    <p key={`${event}-${index}`} style={{ margin: "0 0 4px 0", fontSize: "11px" }}>{event}</p>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
