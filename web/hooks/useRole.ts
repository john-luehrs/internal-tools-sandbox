"use client";

import { useState, useEffect, useCallback } from "react";
import { PersonaKey, PERSONAS, isManagerRole, getStoredPersona, storePersona, clearStoredPersona } from "@/lib/auth";

export function useRole() {
  const [personaKey, setPersonaKey] = useState<PersonaKey | null>(null);

  useEffect(() => {
    setPersonaKey(getStoredPersona());
  }, []);

  const login = useCallback((key: PersonaKey) => {
    storePersona(key);
    setPersonaKey(key);
  }, []);

  const logout = useCallback(() => {
    clearStoredPersona();
    setPersonaKey(null);
  }, []);

  const persona = personaKey ? PERSONAS[personaKey] : null;

  return {
    personaKey,
    role: persona?.role ?? null,
    token: persona?.token ?? null,
    username: personaKey,
    isManager: persona ? isManagerRole(persona.role) : false,
    isAuthenticated: personaKey !== null,
    login,
    logout,
  };
}
