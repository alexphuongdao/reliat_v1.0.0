"use client";

/**
 * Layout for authenticated routes. Gates on auth, then mounts the
 * AppShell with the mock substrate (Phase 3 swaps that for real API
 * calls). The bare /login, /register, /auth/callback, /logout routes
 * live outside this group and never see this layout.
 */
import { AuthGuard } from "../../components/auth/AuthGuard";
import { AppShell } from "../../components/shell/AppShell";
import { buildMock } from "../../lib/mockData";
import { STABLE_NOW } from "../../lib/now";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { channels, outliers, agentThread, commands } = buildMock(STABLE_NOW);
  return (
    <AuthGuard>
      <AppShell
        channels={channels}
        outliers={outliers}
        agentThread={agentThread}
        commands={commands}
      >
        {children}
      </AppShell>
    </AuthGuard>
  );
}
