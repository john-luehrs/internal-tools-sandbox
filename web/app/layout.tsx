import React from "react";
import "@/styles/globals.css";
import EmployeeSidebarStats from "@/components/EmployeeSidebarStats";

export const metadata = {
  title: "Internal Tools Sandbox",
  description: "Streamlined internal workflows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="dark">
        <div className="main-container">
          <nav className="sidebar">
            <div className="sidebar-section">
              <h2 className="sidebar-title">Tools</h2>
              <a href="/log-analyzer/team" className="nav-link">
                📊 Log Analyzer
              </a>
            </div>
            <EmployeeSidebarStats />
          </nav>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
