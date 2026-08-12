import { AppShell } from "@/components/shell/AppShell";
import { STATIC_COMMANDS } from "@/lib/commands";
import { requireUser } from "@/lib/session";

// Layouts don't re-render on client-side navigation, so this check runs on
// the initial server render of any authenticated route. The routes' own data
// fetches are scoped by the API using the same cookie, so a stale client
// can't read another tenant's rows even between these checks.
//
// This layout used to call `buildMock()` and hand the shell a fabricated
// twelve-channel substrate, which every tenant saw identically. The shell
// now loads the caller's own channels and outliers; the only thing passed
// down is the static command list, which is UI, not data.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <AppShell commands={STATIC_COMMANDS} user={user}>
      {children}
    </AppShell>
  );
}
