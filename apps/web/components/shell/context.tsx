"use client";

/**
 * AppShellContext — lets screens reach the shell's overlays + router.
 *
 * Why a context (not a Zustand store, not props through every layer):
 * the shell owns drawer state, palette open/close, and help overlay
 * state. Screens need to be able to OPEN those overlays (e.g. clicking
 * "Ask agent" on an outlier row), so the shell exposes setters via
 * context. Navigation (openChannel/openOutlier) is also routed through
 * here so the shell can decide whether to push a route or open in
 * place.
 */
import { createContext, useContext } from "react";
import type { Channel, Outlier } from "../../lib/types";

export type AgentScope = Channel | Outlier | string | { name: string } | null;

export interface AppShellContextValue {
  openChannel: (c: Channel) => void;
  openOutlier: (o: Outlier) => void;
  askAgent: (scope?: AgentScope) => void;
  openPalette: () => void;
  closeAgent: () => void;
  agentScope: AgentScope;
}

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error("useAppShell must be used inside <AppShell>");
  }
  return ctx;
}
