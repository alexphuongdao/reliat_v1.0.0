"use client";

/**
 * AppShell — composes the three chrome regions (LeftRail · TopBar ·
 * surface content) and the three overlay layers (Agent drawer · ⌘K
 * palette · ? help cheatsheet). It owns the shared state (rail
 * collapse, drawer/palette/help open, agent scope, G-prefix navigation
 * buffer) and the global keyboard handler — the visual pieces are
 * delegated to their own files.
 *
 * Ported 1:1 from frontend/app.jsx; behaviour is unchanged.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CommandPalette, Drawer } from "../ui";
import { AgentScreen } from "../screens/AgentScreen";
import { AppShellContext, type AgentScope } from "./context";
import { HelpCheatsheet } from "./HelpCheatsheet";
import { LeftRail } from "./LeftRail";
import { G_TO_SURFACE, SURFACES, type SurfaceId } from "./surfaces";
import { TopBar } from "./TopBar";
import type {
  AgentTurnMsg,
  Channel,
  Command,
  Outlier,
} from "../../lib/types";

export interface AppShellProps {
  children: ReactNode;
  channels: Channel[];
  outliers: Outlier[];
  agentThread: AgentTurnMsg[];
  commands: Command[];
}

export function AppShell({
  children, channels, outliers, agentThread, commands,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname() || "/pulse";

  // ─── Surface from pathname ───
  const surface: SurfaceId = useMemo(() => {
    const seg = pathname.split("/").filter(Boolean)[0] || "pulse";
    if ((SURFACES.find((s) => s.id === seg) || seg === "notes") && seg) {
      return seg as SurfaceId;
    }
    return "pulse";
  }, [pathname]);

  // ─── Shell-owned state ───
  const [railCollapsed, setRail] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentScope, setAgentScope] = useState<AgentScope>(null);
  const [showHelp, setShowHelp] = useState(false);
  const goPrefix = useRef(0);
  const goExpire = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Navigation callbacks (exposed via context) ───
  const navigate = useCallback(
    (id: SurfaceId) => {
      router.push(`/${id}`);
    },
    [router],
  );
  const openChannel = useCallback(
    (c: Channel) => {
      router.push(`/channels?c=${encodeURIComponent(c.id)}`);
    },
    [router],
  );
  const openOutlier = useCallback(
    (o: Outlier) => {
      router.push(`/outliers?o=${encodeURIComponent(o.id)}`);
    },
    [router],
  );
  const askAgent = useCallback((scope: AgentScope = null) => {
    setAgentScope(scope);
    setAgentOpen(true);
  }, []);
  const closeAgent = useCallback(() => setAgentOpen(false), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const toggleAgent = useCallback(() => setAgentOpen((v) => !v), []);

  // ─── Global keyboard ───
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAgentOpen((v) => !v);
        return;
      }
      if (!inField && e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
        return;
      }
      if (!inField && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        setRail((v) => !v);
        return;
      }
      if (!inField && !e.metaKey && !e.ctrlKey) {
        if (e.key === "g" || e.key === "G") {
          goPrefix.current = 1;
          if (goExpire.current) clearTimeout(goExpire.current);
          goExpire.current = setTimeout(() => {
            goPrefix.current = 0;
          }, 800);
          return;
        }
        if (goPrefix.current === 1) {
          const next = G_TO_SURFACE[e.key.toLowerCase()];
          if (next) {
            e.preventDefault();
            navigate(next);
            goPrefix.current = 0;
            return;
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // ─── Context value ───
  const ctxValue = useMemo(
    () => ({
      openChannel,
      openOutlier,
      askAgent,
      openPalette,
      closeAgent,
      agentScope,
    }),
    [openChannel, openOutlier, askAgent, openPalette, closeAgent, agentScope],
  );

  return (
    <AppShellContext.Provider value={ctxValue}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${
            railCollapsed ? "var(--rail-w-collapsed)" : "var(--rail-w)"
          } 1fr`,
          height: "100dvh",
          overflow: "hidden",
        }}
      >
        <LeftRail
          railCollapsed={railCollapsed}
          onSetCollapsed={setRail}
          onOpenPalette={openPalette}
          surface={surface}
          onNavigate={navigate}
        />

        <main style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <TopBar surface={surface} agentOpen={agentOpen} onToggleAgent={toggleAgent} />

          {/* Surface content */}
          <div style={{ flex: 1, overflow: "auto", background: "var(--surface-0)" }}>
            {children}
          </div>
        </main>

        {/* Agent drawer */}
        <Drawer open={agentOpen} onClose={closeAgent} width="45%">
          <AgentScreen
            channels={channels}
            outliers={outliers}
            initialThread={agentThread}
            mode="drawer"
            scope={asScreenScope(agentScope)}
            onClose={closeAgent}
            onOpenOutlier={openOutlier}
            onOpenChannel={openChannel}
          />
        </Drawer>

        {/* Command palette */}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onRun={(item) => {
            if (item.surface === "channels" && item.channelId) {
              router.push(`/channels?c=${encodeURIComponent(item.channelId)}`);
            } else if (item.surface === "outliers" && item.outlierId) {
              router.push(`/outliers?o=${encodeURIComponent(item.outlierId)}`);
            } else if (item.surface) {
              router.push(`/${item.surface}`);
            } else if (item.id === "agent.toggle") {
              setAgentOpen((v) => !v);
            } else if (item.id === "kbd.help") {
              setShowHelp(true);
            }
          }}
          channels={channels}
          outliers={outliers}
          staticCommands={commands}
        />

        {/* Help cheatsheet */}
        {showHelp && <HelpCheatsheet onClose={() => setShowHelp(false)} />}
      </div>
    </AppShellContext.Provider>
  );
}

// Bridge between the shell's broad AgentScope type and what AgentScreen accepts.
function asScreenScope(s: AgentScope) {
  if (s == null) return null;
  if (typeof s === "string") return s;
  // Channel/Outlier both have an .id, but AgentScreen only reads .name —
  // pass it through; the screen falls back gracefully when undefined.
  return s as { name: string };
}
