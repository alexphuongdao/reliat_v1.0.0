/**
 * /outliers — the triage inbox.
 *
 * Phase 1: uses the mock substrate. The full-height layout (filter bar
 * sticky, scrollable rows, right rail) needs the screen to own its
 * viewport — we wrap it in a 100dvh container.
 *
 * Phase 3 will replace `buildMock()` with a live fetch to the FastAPI
 * service and add the app shell (left rail, top bar) around it.
 */
import { OutliersScreen } from "../../components/screens/OutliersScreen";
import { buildMock } from "../../lib/mockData";

export default function OutliersPage() {
  // Stable timestamp at module load — keeps the deterministic mock from
  // re-shifting between renders on the server.
  const now = Date.UTC(2026, 4, 22, 18, 0, 0);
  const { channels, outliers } = buildMock(now);

  return (
    <div style={{ height: "100dvh", background: "var(--surface-0)", color: "var(--text-1)" }}>
      <OutliersScreen channels={channels} outliers={outliers} />
    </div>
  );
}
