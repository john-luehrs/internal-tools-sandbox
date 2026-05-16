"use client";

import React, { useState, useEffect } from "react";
import EmployeeSidebarStats from "@/components/EmployeeSidebarStats";
import { useRole } from "@/hooks/useRole";
import { ROLES, PERSONAS, PersonaKey, Role } from "@/lib/auth";
import { RoleContext } from "@/lib/RoleContext";

const LOGIN_PASSWORD = "password";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { role, token, username, isManager, isAuthenticated, login, logout } = useRole();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  if (!isAuthenticated || !role || !token || !username) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <RoleContext.Provider value={{ role, token, username, isManager, logout }}>
      <div className="main-container">
        <nav className="sidebar">
          <div className="sidebar-section">
            <h2 className="sidebar-title">Tools</h2>
            <a href="/log-analyzer/team" className="nav-link">
              📊 Log Analyzer
            </a>
          </div>
          <div className="sidebar-user-section">
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
          {isManager && <EmployeeSidebarStats />}
        </nav>
        <main className="content">{children}</main>
      </div>
    </RoleContext.Provider>
  );
}

function LoginScreen({ onLogin }: { onLogin: (key: PersonaKey) => void }) {
  const [selected, setSelected] = useState<PersonaKey>("alice");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== LOGIN_PASSWORD) {
      setError("Incorrect password.");
      return;
    }
    setError("");
    onLogin(selected);
  };

  const engineers: PersonaKey[] = ["alice", "bob", "carol"];
  const managers: PersonaKey[] = ["dana", "evan"];

  return (
    <div className="login-screen">
      <div className="login-card login-card-wide">
        <div className="login-header">
          <div className="login-logo">🔧</div>
          <h1 className="login-title">Internal Tools Sandbox</h1>
          <p className="login-subtitle">Select a persona to explore role-based access control</p>
        </div>

        <div className="persona-section">
          <p className="persona-section-label">Ops Engineers</p>
          <div className="persona-grid persona-grid-3">
            {engineers.map((key) => (
              <PersonaCard key={key} personaKey={key} selected={selected === key} onSelect={setSelected} />
            ))}
          </div>
        </div>

        <div className="persona-section">
          <p className="persona-section-label">Management</p>
          <div className="persona-grid persona-grid-2">
            {managers.map((key) => (
              <PersonaCard key={key} personaKey={key} selected={selected === key} onSelect={setSelected} />
            ))}
          </div>
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

          <button type="submit" className="button button-primary" style={{ width: "100%" }}>
            Sign in as {PERSONAS[selected].name}
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
