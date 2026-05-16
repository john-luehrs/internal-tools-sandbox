"use client";

import React, { createContext, useContext } from "react";
import { Role } from "@/lib/auth";

interface RoleContextValue {
  role: Role;
  token: string;
  username: string;
  isManager: boolean;
  logout: () => void;
}

export const RoleContext = createContext<RoleContextValue | null>(null);

export function useRoleContext(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRoleContext must be used inside AuthWrapper");
  return ctx;
}
