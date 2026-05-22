import Link from "next/link";
import { TOOLS } from "@/lib/auth";

const TOOL_DESCRIPTIONS: Record<keyof typeof TOOLS, string> = {
  "support-triage": "Ticket triage, risk-aware customer context, and safe AI summaries.",
  "log-analyzer": "Operational monitoring, assignment, and response workflows.",
  "qa-analyzer": "Defect triage, trend analysis, and duplicate-merge workflows.",
};

export default function Home() {
  return (
    <div className="login-screen" style={{ minHeight: "100vh" }}>
      <div className="login-card login-card-wide" style={{ maxWidth: 920 }}>
        <div className="login-header">
          <div className="login-logo">🧭</div>
          <h1 className="login-title">Internal Tools Portal</h1>
          <p className="login-subtitle">Choose a tool to continue to scoped sign-in.</p>
        </div>

        <div className="persona-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {(Object.keys(TOOLS) as Array<keyof typeof TOOLS>).map((toolKey) => (
            <Link key={toolKey} href={TOOLS[toolKey].path} className="persona-card" style={{ textDecoration: "none" }}>
              <p className="persona-card-name">{TOOLS[toolKey].label}</p>
              <p className="login-subtitle" style={{ margin: "0 0 10px" }}>
                {TOOL_DESCRIPTIONS[toolKey]}
              </p>
              <div className="role-badge" style={{ width: "fit-content" }}>
                Open Tool
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
