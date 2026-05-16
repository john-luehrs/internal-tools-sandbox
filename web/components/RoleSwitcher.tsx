"use client";

import React from "react";
import { useRole } from "@/hooks/useRole";
import { ROLES, Role } from "@/lib/auth";

export default function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <div className="role-switcher">
      <div className="role-switcher-label">Active Role</div>
      <select
        className="filter-select"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        style={{ width: "100%", fontSize: "12px" }}
      >
        {Object.entries(ROLES).map(([key, { label }]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <div className={`role-badge role-badge-${role}`}>{ROLES[role].label}</div>
    </div>
  );
}
