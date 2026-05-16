"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { getTeamLogs } from "@/lib/api";
import { TEAM_WORKLOAD_UPDATED_EVENT } from "@/lib/events";
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
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedEngineer = searchParams.get("engineer") || "";

  useEffect(() => {
    const load = async () => {
      try {
        const logs = await getTeamLogs();
        setStats(buildEmployeeStats(logs));
      } catch {
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
    };
  }, []);

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
    </div>
  );
}
