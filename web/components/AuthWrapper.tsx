"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import EmployeeSidebarStats from "@/components/EmployeeSidebarStats";
import QASidebarContext from "@/components/QASidebarContext";
import { useRole } from "@/hooks/useRole";
import {
  ROLES,
  PERSONAS,
  TOOLS,
  PersonaKey,
  Role,
  ToolKey,
  getPersonasForTool,
  getToolFromPath,
  roleCanAccessTool,
} from "@/lib/auth";
import { RoleContext } from "@/lib/RoleContext";

const LOGIN_PASSWORD = "password";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { role, token, username, isManager, isAuthenticated, login, logout } = useRole();
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  const activeTool = getToolFromPath(pathname);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  // Public pages (for now, tool landing) do not require auth shell.
  if (!activeTool) {
    return <>{children}</>;
  }

  const isToolAuthorized = role ? roleCanAccessTool(role as Role, activeTool) : false;

  if (!isAuthenticated || !role || !token || !username || !isToolAuthorized) {
    return <LoginScreen onLogin={login} tool={activeTool} />;
  }

  const availableTools = (Object.keys(TOOLS) as ToolKey[]).filter((toolKey) =>
    roleCanAccessTool(role as Role, toolKey)
  );

  return (
    <RoleContext.Provider value={{ role, token, username, isManager, logout }}>
      <div className="main-container">
        <nav className="sidebar">
          <div className="sidebar-brand">
            <p className="sidebar-brand-kicker">Operations Console</p>
            <h1 className="sidebar-brand-title">Internal Tools</h1>
            <p className="sidebar-brand-subtitle">Live workflows for incident and QA operations.</p>
          </div>
          <div className="sidebar-section">
            <h2 className="sidebar-title">Tools</h2>
            {availableTools.map((toolKey) => (
              <a
                key={toolKey}
                href={TOOLS[toolKey].path}
                className={`nav-link${pathname?.startsWith(`/${toolKey}`) ? " active" : ""}`}
              >
                {toolKey === "log-analyzer" ? "📊" : "🧪"} {TOOLS[toolKey].label}
              </a>
            ))}
          </div>
          <div className="sidebar-user-section">
            <div className="session-chip-row">
              <span className="session-chip">{availableTools.length} tools</span>
              <span className="session-chip">online</span>
            </div>
            <div className="sidebar-user-role">
              <span className="sidebar-user-name">{PERSONAS[username].name}</span>
              <span className={`role-badge role-badge-${role}`}>
                {ROLES[role].label}
              </span>
            </div>
            <button className="sidebar-logout-btn" onClick={logout}>
              Sign out
            </button>
          </div>
          {activeTool === "qa-analyzer" && <QASidebarContext />}
          {isManager && <EmployeeSidebarStats />}
        </nav>
        <main className="content">{children}</main>
      </div>
    </RoleContext.Provider>
  );
}

function LoginScreen({ onLogin, tool }: { onLogin: (key: PersonaKey) => void; tool: ToolKey }) {
  const [selected, setSelected] = useState<PersonaKey | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const toolPersonas = getPersonasForTool(tool);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      setError("Select a persona.");
      return;
    }
    if (password !== LOGIN_PASSWORD) {
      setError("Incorrect password.");
      return;
    }
    setError("");
    onLogin(selected);
  };

  return (
    <div className="login-screen">
      <div className="login-card login-card-wide">
        <div className="login-header">
          <div className="login-logo">🔧</div>
          <h1 className="login-title">Internal Tools Sandbox</h1>
          <p className="login-subtitle">Sign in to {TOOLS[tool].label} with an authorized persona</p>
        </div>

        <div className="persona-grid persona-grid-3">
          {toolPersonas.map((key) => (
            <PersonaCard key={key} personaKey={key} selected={selected === key} onSelect={setSelected} />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="login-form" style={{ marginTop: 8 }}>
          <div className="login-field">
            <label className="login-label">Password</label>
            <input
              type="password"
              className="filter-select"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
            <p className="login-hint">Hint: the password is <code>password</code></p>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="button button-primary" style={{ width: "100%" }} disabled={!selected}>
            {selected ? `Sign in as ${PERSONAS[selected].name}` : "Select a persona to sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PersonaCard({
  personaKey,
  selected,
  onSelect,
}: {
  personaKey: PersonaKey;
  selected: boolean;
  onSelect: (k: PersonaKey) => void;
}) {
  const p = PERSONAS[personaKey];
  return (
    <button
      type="button"
      className={`persona-card${selected ? " persona-card-selected" : ""}`}
      onClick={() => onSelect(personaKey)}
    >
      <p className="persona-card-name">{p.name}</p>
      <div className="persona-card-role">
        <span className={`role-badge role-badge-${p.role}`}>{ROLES[p.role].label}</span>
      </div>
      <ul className="persona-access-list">
        {p.highlights.map((h) => (
          <li key={h} className="persona-access-item">
            <span className="persona-access-yes">✓</span>
            <span className="persona-access-text-yes">{h}</span>
          </li>
        ))}
        {p.restricted.map((r) => (
          <li key={r} className="persona-access-item">
            <span className="persona-access-no">✗</span>
            <span className="persona-access-text-no">{r}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
