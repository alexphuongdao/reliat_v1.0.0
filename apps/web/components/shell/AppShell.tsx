"use client";

/**
 * AppShell — left rail · top bar · ⌘K palette · ⌘J agent drawer ·
 * global keyboard. Ported 1:1 from frontend/app.jsx.
 *
 * Children are the active page (each route renders its own screen).
 * The shell owns: surface routing, drawer state, palette state,
 * keyboard shortcuts, breadcrumb chrome.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, CommandPalette, Drawer, Icon, Tooltip } from "../ui";
import { AgentScreen } from "../screens/AgentScreen";
import { AppShellContext, type AgentScope } from "./context";
import { UserMenu } from "./UserMenu";
import type {
  AgentTurnMsg,
  Channel,
  Command,
  Outlier,
} from "../../lib/types";

type SurfaceId = "pulse" | "channels" | "outliers" | "agent" | "library" | "notes";

const SURFACES: Array<{ id: SurfaceId; label: string; icon: string; short: string }> = [
  { id: "pulse",    label: "Pulse",    icon: "pulse",   short: "⌘1" },
  { id: "channels", label: "Channels", icon: "belt",    short: "⌘2" },
  { id: "outliers", label: "Outliers", icon: "inbox",   short: "⌘3" },
  { id: "agent",    label: "Agent",    icon: "sparkle", short: "⌘4" },
  { id: "library",  label: "Library",  icon: "book",    short: "⌘5" },
];

const G_TO_SURFACE: Record<string, SurfaceId> = {
  p: "pulse", c: "channels", o: "outliers", a: "agent", l: "library", n: "notes",
};

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
    if ((SURFACES.find((s) => s.id === seg) || seg === "notes") && seg) return seg as SurfaceId;
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

  // Breadcrumb — derives from URL only (no path-param channel/outlier
  // for Phase 1; deep links are query-param based and shown by the
  // screen itself).
  const currentSurface = SURFACES.find((s) => s.id === surface);

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
        {/* Left rail */}
        <nav
          style={{
            background: "var(--surface-1)",
            borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            transition: "all var(--t-med) var(--ease)",
          }}
        >
          {/* Logo + collapse */}
          <div
            style={{
              display: "flex", alignItems: "center",
              justifyContent: railCollapsed ? "center" : "space-between",
              padding: railCollapsed ? "14px 0" : "14px 14px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "linear-gradient(135deg, var(--accent) 0%, #2D6F7A 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#062028", fontWeight: 700,
                  fontFamily: "var(--font-mono)", fontSize: 13,
                }}
              >
                R
              </div>
              {!railCollapsed && (
                <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  Reliat
                </span>
              )}
            </div>
            {!railCollapsed && (
              <Tooltip label="Collapse rail · [">
                <button
                  onClick={() => setRail(true)}
                  style={{ color: "var(--text-3)", display: "flex" }}
                >
                  <Icon name="collapse-rail" size={14} />
                </button>
              </Tooltip>
            )}
          </div>

          {/* Palette CTA */}
          <div style={{ padding: railCollapsed ? "8px 6px" : "10px 10px" }}>
            <button
              onClick={() => setPaletteOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: railCollapsed ? "6px 0" : "7px 10px",
                justifyContent: railCollapsed ? "center" : "flex-start",
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-sm)",
                fontSize: 12.5, color: "var(--text-3)",
                cursor: "pointer",
                transition: "all var(--t-instant)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "var(--surface-3)";
                el.style.color = "var(--text-1)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "var(--surface-2)";
                el.style.color = "var(--text-3)";
              }}
            >
              <Icon name="search" size={14} />
              {!railCollapsed && (
                <span style={{ flex: 1, textAlign: "left" }}>Search or jump to…</span>
              )}
              {!railCollapsed && (
                <span style={{ display: "flex", gap: 2 }}>
                  <span className="kbd">⌘</span>
                  <span className="kbd">K</span>
                </span>
              )}
            </button>
          </div>

          {/* Surface buttons */}
          <div
            style={{
              padding: railCollapsed ? "0 6px" : "0 10px",
              display: "flex", flexDirection: "column", gap: 2,
            }}
          >
            {SURFACES.map((s) => {
              const active = surface === s.id;
              return (
                <Tooltip key={s.id} label={railCollapsed ? `${s.label} · ${s.short}` : ""}>
                  <button
                    onClick={() => navigate(s.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: railCollapsed ? "8px 0" : "8px 10px",
                      justifyContent: railCollapsed ? "center" : "flex-start",
                      background: active ? "var(--accent-dim)" : "transparent",
                      color: active ? "var(--accent-bright)" : "var(--text-2)",
                      borderRadius: "var(--r-sm)",
                      fontSize: 13, fontWeight: 500, width: "100%",
                      borderLeft:
                        !railCollapsed && active
                          ? "2px solid var(--accent)"
                          : "2px solid transparent",
                      paddingLeft: !railCollapsed ? 8 : undefined,
                      transition:
                        "background var(--t-instant), color var(--t-instant)",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = "var(--surface-2)";
                        el.style.color = "var(--text-1)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = "transparent";
                        el.style.color = "var(--text-2)";
                      }
                    }}
                  >
                    <Icon name={s.icon} size={16} />
                    {!railCollapsed && (
                      <>
                        <span style={{ flex: 1, textAlign: "left" }}>{s.label}</span>
                        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
                          {s.short}
                        </span>
                      </>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Design notes link */}
          <div
            style={{
              padding: railCollapsed ? "8px 6px 12px" : "10px 10px 14px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => navigate("notes")}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: railCollapsed ? "8px 0" : "8px 10px",
                width: "100%",
                justifyContent: railCollapsed ? "center" : "flex-start",
                background: surface === "notes" ? "var(--accent-dim)" : "transparent",
                color:
                  surface === "notes" ? "var(--accent-bright)" : "var(--text-3)",
                borderRadius: "var(--r-sm)", fontSize: 12.5,
                transition: "all var(--t-instant)",
              }}
              onMouseEnter={(e) => {
                if (surface !== "notes") {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = "var(--surface-2)";
                  el.style.color = "var(--text-1)";
                }
              }}
              onMouseLeave={(e) => {
                if (surface !== "notes") {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = "transparent";
                  el.style.color = "var(--text-3)";
                }
              }}
            >
              <Icon name="book" size={14} />
              {!railCollapsed && (
                <span style={{ flex: 1, textAlign: "left" }}>Design notes</span>
              )}
              {!railCollapsed && (
                <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
                  G N
                </span>
              )}
            </button>
            {railCollapsed && (
              <Tooltip label="Expand rail · ]">
                <button
                  onClick={() => setRail(false)}
                  style={{
                    marginTop: 6, padding: "6px 0", width: "100%",
                    display: "flex", justifyContent: "center", color: "var(--text-3)",
                  }}
                >
                  <Icon name="expand-rail" size={14} />
                </button>
              </Tooltip>
            )}
          </div>
        </nav>

        {/* Main column */}
        <main style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Top bar */}
          <header
            style={{
              height: "var(--topbar-h)", minHeight: "var(--topbar-h)",
              display: "flex", alignItems: "center",
              padding: "0 16px",
              background: "var(--surface-0)",
              borderBottom: "1px solid var(--border)",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="mine" size={16} />
              <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
                Karingal Pit · West
              </span>
              <span style={{ color: "var(--text-4)" }}>/</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                {currentSurface?.label || "Design notes"}
              </span>
            </div>

            <span style={{ flex: 1 }} />

            {surface === "pulse" && (
              <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                ● live · last ingest 00:11
              </span>
            )}

            <Button size="sm" variant="ghost" leftIcon="bell">
              <span className="mono">2</span>
            </Button>
            <Button
              size="sm"
              variant={agentOpen ? "primary" : "secondary"}
              leftIcon="sparkle"
              onClick={() => setAgentOpen((v) => !v)}
              title="Toggle agent drawer (⌘J)"
            >
              Agent
              <span style={{ marginLeft: 4, display: "flex", gap: 2 }}>
                <span className="kbd">⌘</span>
                <span className="kbd">J</span>
              </span>
            </Button>
            <span style={{ width: 1, height: 18, background: "var(--border)" }} />
            <UserMenu />
          </header>

          {/* Surface content */}
          <div style={{ flex: 1, overflow: "auto", background: "var(--surface-0)" }}>
            {children}
          </div>
        </main>

        {/* Agent drawer (overlay) */}
        <Drawer open={agentOpen} onClose={() => setAgentOpen(false)} width="45%">
          <AgentScreen
            channels={channels}
            outliers={outliers}
            initialThread={agentThread}
            mode="drawer"
            scope={asScreenScope(agentScope)}
            onClose={() => setAgentOpen(false)}
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

// ─── Help cheatsheet ────────────────────────────────────────────────
function HelpCheatsheet({ onClose }: { onClose: () => void }) {
  const groups: Array<{ name: string; items: Array<[string, string]> }> = [
    { name: "Global",   items: [["⌘ K", "Command palette"], ["⌘ J", "Toggle agent drawer"], ["?", "This cheatsheet"], ["Esc", "Close any overlay"]] },
    { name: "Navigate", items: [["G P", "Pulse"], ["G C", "Channels"], ["G O", "Outliers"], ["G A", "Agent"], ["G L", "Library"], ["G N", "Design notes"]] },
    { name: "Lists",    items: [["J / K", "Next / prev"], ["Enter", "Open / expand"], ["X", "Toggle select"], ["⇧ click", "Range select"]] },
    { name: "Outliers", items: [["E", "Acknowledge"], ["R", "Resolve"], ["A", "Assign"], ["D", "Dismiss"]] },
    { name: "Layout",   items: [["[ ]", "Collapse / expand rail"], ["\\", "Toggle right rail"]] },
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(5,7,10,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 250,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 90vw)",
          background: "var(--glass-bg-2)",
          backdropFilter: "var(--glass-blur)",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-modal)",
          padding: "20px 24px 24px",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Keyboard shortcuts</h2>
          <button onClick={onClose} style={{ color: "var(--text-3)", display: "flex" }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {groups.map((g) => (
            <div key={g.name}>
              <h3
                style={{
                  fontSize: 11, color: "var(--text-3)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  fontWeight: 600, margin: "0 0 8px",
                }}
              >
                {g.name}
              </h3>
              {g.items.map(([k, l], i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "4px 0", fontSize: 12.5,
                  }}
                >
                  <span style={{ display: "flex", gap: 3, width: 80 }}>
                    {k.split(" ").map((t, j) => (
                      <span key={j} className="kbd">{t}</span>
                    ))}
                  </span>
                  <span style={{ color: "var(--text-2)" }}>{l}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
