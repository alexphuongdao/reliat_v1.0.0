import { AppShell } from "@/components/shell/AppShell";
import { buildMock } from "@/lib/mockData";
import { STABLE_NOW } from "@/lib/now";
import { requireUser } from "@/lib/session";

// Layouts don't re-render on client-side navigation, so this check runs on
// the initial server render of any authenticated route. The routes' own data
// fetches are scoped by the API using the same cookie, so a stale client
// can't read another tenant's rows even between these checks.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  // Build the mock substrate the shell needs (channels + outliers feed the
  // ⌘K command palette; agentThread + commands seed the drawer + palette).
  // Each page builds its own mock for its screen — deterministic with the
  // same STABLE_NOW, so the data matches across the shell and page.
  const { channels, outliers, agentThread, commands } = buildMock(STABLE_NOW);

  return (
    <AppShell
      channels={channels}
      outliers={outliers}
      agentThread={agentThread}
      commands={commands}
      user={user}
    >
      {children}
    </AppShell>
  );
}
