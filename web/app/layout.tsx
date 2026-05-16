import React from "react";
import "@/styles/globals.css";
import AuthWrapper from "@/components/AuthWrapper";

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
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}
