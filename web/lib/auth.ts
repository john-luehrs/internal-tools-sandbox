export const ROLES = {
  ops_engineer: { label: "Ops Engineer" },
  support_manager: { label: "Support Manager" },
  it_admin: { label: "IT Admin" },
  qa_engineer: { label: "QA Engineer" },
  qa_lead: { label: "QA Lead" },
  qa_manager: { label: "QA Manager" },
  infrastructure_developer: { label: "Infrastructure Developer" },
} as const;

export type Role = keyof typeof ROLES;

export const TOOLS = {
  "log-analyzer": {
    label: "Log Analyzer",
    path: "/log-analyzer/team",
    allowedRoles: ["ops_engineer", "support_manager", "it_admin", "infrastructure_developer"] as Role[],
  },
  "qa-analyzer": {
    label: "QA Analyzer",
    path: "/qa-analyzer/sprint",
    allowedRoles: ["qa_engineer", "qa_lead", "qa_manager", "infrastructure_developer"] as Role[],
  },
} as const;

export type ToolKey = keyof typeof TOOLS;

export const PERSONAS = {
  alice: {
    name: "Alice",
    role: "ops_engineer" as Role,
    token: "Bearer token-alice",
    highlights: ["My assigned logs", "AI log explanations", "Update assignment & status"],
    restricted: ["Team workload breakdown", "Manager ops brief", "Assignee names on team logs"],
  },
  bob: {
    name: "Bob",
    role: "ops_engineer" as Role,
    token: "Bearer token-bob",
    highlights: ["My assigned logs", "AI log explanations", "Update assignment & status"],
    restricted: ["Team workload breakdown", "Manager ops brief", "Assignee names on team logs"],
  },
  carol: {
    name: "Carol",
    role: "ops_engineer" as Role,
    token: "Bearer token-carol",
    highlights: ["My assigned logs", "AI log explanations", "Update assignment & status"],
    restricted: ["Team workload breakdown", "Manager ops brief", "Assignee names on team logs"],
  },
  dana: {
    name: "Dana",
    role: "support_manager" as Role,
    token: "Bearer token-manager",
    highlights: ["Full team queue with assignee names", "Workload distribution per engineer", "AI-generated manager ops brief"],
    restricted: ["Service-level SLA breach data", "Re-assign any log", "AI audit log"],
  },
  evan: {
    name: "Evan",
    role: "it_admin" as Role,
    token: "Bearer token-it",
    highlights: [
      "Full team queue with assignee names",
      "Workload distribution per engineer",
      "AI-generated manager ops brief",
      "Service-level SLA breach data",
      "Re-assign any log",
      "AI audit log",
    ],
    restricted: [],
  },
  quinn: {
    name: "Quinn",
    role: "qa_engineer" as Role,
    token: "Bearer token-qa",
    highlights: ["Sprint queue triage", "Add investigation notes", "Flag suspected duplicates"],
    restricted: ["Approve duplicate merges", "Reassign defects across team", "Publish manager reports"],
  },
  riley: {
    name: "Riley",
    role: "qa_lead" as Role,
    token: "Bearer token-qa-lead",
    highlights: ["Run AI clustering", "Approve duplicate merge actions", "Assign and escalate defects"],
    restricted: ["Portfolio-wide governance views"],
  },
  taylor: {
    name: "Taylor",
    role: "qa_engineer" as Role,
    token: "Bearer token-qa-taylor",
    highlights: ["Sprint queue triage", "Add investigation notes", "Flag suspected duplicates"],
    restricted: ["Approve duplicate merges", "Reassign defects across team", "Publish manager reports"],
  },
  morgan: {
    name: "Morgan",
    role: "qa_manager" as Role,
    token: "Bearer token-qa-manager",
    highlights: ["Cross-sprint trend analysis", "Full QA triage controls", "CSV report export"],
    restricted: [],
  },
  avery: {
    name: "Avery",
    role: "infrastructure_developer" as Role,
    token: "Bearer token-infra",
    highlights: ["Access Log Analyzer and QA Analyzer", "Review anomalies and defect trends", "Use read-only cross-tool dashboards"],
    restricted: ["Assign, flag, or resolve incidents", "Submit or approve QA merge workflows", "Change ownership or workflow states"],
  },
};

export type PersonaKey = keyof typeof PERSONAS;

export const AUTH_STORAGE_KEY = "sandbox_auth_persona";

export function isManagerRole(role: Role): boolean {
  return role === "support_manager" || role === "it_admin";
}

export function roleCanAccessTool(role: Role, tool: ToolKey): boolean {
  return TOOLS[tool].allowedRoles.includes(role);
}

export function getToolFromPath(pathname: string | null): ToolKey | null {
  if (!pathname) return null;
  if (pathname.startsWith("/log-analyzer")) return "log-analyzer";
  if (pathname.startsWith("/qa-analyzer")) return "qa-analyzer";
  return null;
}

export function getPersonasForTool(tool: ToolKey): PersonaKey[] {
  const keys = Object.keys(PERSONAS) as PersonaKey[];
  return keys.filter((personaKey) => roleCanAccessTool(PERSONAS[personaKey].role, tool));
}

export function getStoredPersona(): PersonaKey | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(AUTH_STORAGE_KEY);
  return val && val in PERSONAS ? (val as PersonaKey) : null;
}

export function storePersona(persona: PersonaKey): void {
  localStorage.setItem(AUTH_STORAGE_KEY, persona);
}

export function clearStoredPersona(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
