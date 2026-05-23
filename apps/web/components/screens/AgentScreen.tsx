"use client";

/**
 * Agent — conversation surface. Ported 1:1 from
 * frontend/screens/agent.jsx. Runs in two modes: 'full' (the /agent
 * route) and 'drawer' (overlaid on any other surface via ⌘J).
 */
import { useState } from "react";
import { Button, Icon, Pill, SevGlyph } from "../ui";
import { fmtAge } from "../../lib/format";
import type {
  AgentRef,
  AgentReply,
  AgentTurnMsg,
  Channel,
  Outlier,
} from "../../lib/types";

// Permissive — any object with optional .name (Channel, Outlier) plus
// bare strings ("outliers", "shift", …) and null/undefined.
export type AgentScope = { name?: string } | string | null | undefined;

export interface AgentScreenProps {
  channels: Channel[];
  outliers: Outlier[];
  initialThread: AgentTurnMsg[];
  scope?: AgentScope;
  mode?: "full" | "drawer";
  onClose?: () => void;
  onOpenOutlier?: (o: Outlier) => void;
  onOpenChannel?: (c: Channel) => void;
}

export function AgentScreen({
  channels: CHANNELS,
  outliers: OUTLIERS,
  initialThread,
  scope,
  mode = "full",
  onClose,
  onOpenOutlier,
  onOpenChannel,
}: AgentScreenProps) {
  const [thread, setThread] = useState<AgentTurnMsg[]>(initialThread);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  function send() {
    if (!input.trim()) return;
    const userMsg: AgentTurnMsg = { role: "user", t: Date.now(), content: input.trim() };
    setThread((t) => [...t, userMsg]);
    setInput("");
    setStreaming(true);
    setTimeout(() => {
      const reply: AgentReply = {
        role: "agent",
        t: Date.now(),
        answer: [
          "Looking at the last 24h on the channels you have visible, throughput is tracking 3.1% above the 7-day mean. The two channels carrying the load are CV42 Tunnel and CV33 Crusher Out.",
          "There is one critical outlier still open — OUT-1L on CV09 ROM, Topsize excursion at 02:47. The agent already flagged this for the grizzly screen check at next downtime.",
        ],
        refs: [
          { kind: "outlier", id: "OUT-1L" },
          { kind: "channel", id: "cv42" },
          { kind: "channel", id: "cv33" },
        ],
        evidence: [
          { tool: "pulse.snapshot", args: "window=24h", returned: "12 channels, 38 outliers" },
          { tool: "throughput.compare", args: "window=24h baseline=7d", delta: "+3.1%" },
        ],
        followups: [
          "Drill into CV09 ROM's open critical.",
          "Compare this shift to the same shift last week.",
        ],
      };
      setThread((t) => [...t, reply]);
      setStreaming(false);
    }, 900);
  }

  const isDrawer = mode === "drawer";
  const scopeLabel =
    scope && typeof scope === "object" && "name" in scope
      ? scope.name
      : typeof scope === "string"
        ? scope
        : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: !isDrawer ? "240px 1fr" : "1fr",
        height: "100%", overflow: "hidden",
      }}
    >
      {/* Thread history (full-page only) */}
      {!isDrawer && (
        <aside
          style={{
            borderRight: "1px solid var(--border)",
            background: "var(--surface-1)",
            overflow: "auto",
            padding: "14px 12px",
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <h3
              style={{
                fontSize: 11, color: "var(--text-3)",
                textTransform: "uppercase", letterSpacing: "0.08em",
                fontWeight: 600, margin: 0,
              }}
            >
              Threads
            </h3>
            <Button size="sm" variant="ghost" leftIcon="plus">New</Button>
          </div>
          <ThreadGroup
            label="Today"
            items={[
              { t: "02 min ago", title: "Shift throughput vs last week", pinned: true },
              { t: "32 min ago", title: "Why did CV42 spike at 02:47?", current: true },
              { t: "04:18", title: "CV09 grizzly recurrence" },
            ]}
          />
          <ThreadGroup
            label="Yesterday"
            items={[
              { t: "21:14", title: "Color shift on CV33 — material change?" },
              { t: "14:02", title: "Sieve drift trend on CV66" },
            ]}
          />
          <ThreadGroup
            label="This week"
            items={[
              { t: "2d", title: "CV28 SAG service window prep" },
              { t: "3d", title: "Reclaim feed pulse signature" },
              { t: "4d", title: "Sensor flutter false-positives" },
            ]}
          />
        </aside>
      )}

      {/* Conversation */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header (drawer-only) */}
        {isDrawer && (
          <header
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", borderBottom: "1px solid var(--border)",
              background: "rgba(0,0,0,0.18)",
            }}
          >
            <Icon name="sparkle" size={16} />
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Agent</h2>
            {scopeLabel && (
              <Pill
                size="sm"
                mono
                color="var(--accent-bright)"
                bg="var(--accent-dim)"
                border="var(--accent-line)"
              >
                scoped: {scopeLabel}
              </Pill>
            )}
            <span style={{ flex: 1 }} />
            <span className="kbd">⌘</span>
            <span className="kbd">J</span>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <Icon name="x" size={14} />
            </Button>
          </header>
        )}

        {/* Scrolling thread */}
        <div
          style={{
            flex: 1, overflow: "auto",
            padding: isDrawer ? "20px 20px 0" : "32px 32px 0",
          }}
        >
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {thread.map((m, i) => (
              <Turn
                key={i}
                m={m}
                onOpenRef={(r) => {
                  if (r.kind === "outlier") {
                    const o = OUTLIERS.find((x) => x.id === r.id);
                    if (o && onOpenOutlier) onOpenOutlier(o);
                  } else if (r.kind === "channel") {
                    const c = CHANNELS.find((x) => x.id === r.id);
                    if (c && onOpenChannel) onOpenChannel(c);
                  }
                }}
              />
            ))}
            {streaming && <StreamingIndicator />}
            <div style={{ height: 20 }} />
          </div>
        </div>

        {/* Composer */}
        <div
          style={{
            padding: "12px 20px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-1)",
          }}
        >
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <Pill
                size="sm"
                mono
                color="var(--accent-bright)"
                bg="var(--accent-dim)"
                border="var(--accent-line)"
              >
                Scoped: {scopeLabel || "CV42 Tunnel · Last 24h"}
              </Pill>
              <Pill size="sm">
                <Icon name="x" size={10} /> Remove scope
              </Pill>
              <span style={{ flex: 1 }} />
              <Pill size="sm" mono>haiku-4-5</Pill>
            </div>
            <div
              style={{
                display: "flex", gap: 8, alignItems: "flex-end",
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-md)", padding: 10,
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Ask anything about your channels, outliers, or shift…"
                style={{
                  flex: 1, background: "transparent",
                  border: 0, outline: 0,
                  color: "var(--text-1)", resize: "none",
                  fontSize: 13.5, lineHeight: 1.5,
                  fontFamily: "var(--font-sans)",
                }}
              />
              <Button
                variant="primary"
                size="md"
                rightIcon="send"
                onClick={send}
                disabled={!input.trim() || streaming}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ThreadItem {
  t: string;
  title: string;
  pinned?: boolean;
  current?: boolean;
}
function ThreadGroup({ label, items }: { label: string; items: ThreadItem[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10.5, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontWeight: 600, padding: "4px 6px",
        }}
      >
        {label}
      </div>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "flex-start", gap: 6,
            padding: "8px 8px", borderRadius: "var(--r-sm)",
            background: it.current ? "var(--accent-dim)" : "transparent",
            color: it.current ? "var(--accent-bright)" : "var(--text-1)",
            cursor: "pointer", fontSize: 12.5,
          }}
          onMouseEnter={(e) => {
            if (!it.current) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)";
          }}
          onMouseLeave={(e) => {
            if (!it.current) (e.currentTarget as HTMLDivElement).style.background = "transparent";
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
              }}
            >
              {it.title}
            </div>
            <div
              className="mono"
              style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 1 }}
            >
              {it.t}
            </div>
          </div>
          {it.pinned && <Icon name="pin" size={11} />}
        </div>
      ))}
    </div>
  );
}

function Turn({ m, onOpenRef }: { m: AgentTurnMsg; onOpenRef: (r: AgentRef) => void }) {
  const [showEv, setShowEv] = useState(false);
  if (m.role === "user") {
    return (
      <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        <div
          style={{
            width: 2, background: "var(--text-4)", borderRadius: 2, flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 10.5, color: "var(--text-3)",
              textTransform: "uppercase", letterSpacing: "0.08em",
              fontWeight: 600, marginBottom: 4,
            }}
          >
            You
          </div>
          <div
            style={{
              fontSize: 14, color: "var(--text-1)", lineHeight: 1.55,
              textWrap: "pretty",
            }}
          >
            {m.content}
          </div>
        </div>
      </div>
    );
  }
  // agent reply
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 32 }}>
      <div style={{ width: 2, background: "var(--accent)", borderRadius: 2, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 10.5, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 600, marginBottom: 6,
          }}
        >
          <Icon name="sparkle" size={12} />
          Agent
          <span
            className="mono"
            style={{
              textTransform: "none", letterSpacing: 0, color: "var(--text-4)",
            }}
          >
            · {fmtAge(m.t)} ago · {m.evidence?.length || 0} tool calls
          </span>
        </div>
        {/* Answer */}
        <div
          style={{
            fontSize: 14, color: "var(--text-1)", lineHeight: 1.65,
            textWrap: "pretty",
          }}
        >
          {m.answer.map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>
          ))}
          {m.refs && m.refs.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {m.refs.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onOpenRef(r)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", fontSize: 11.5, fontWeight: 500,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-1)", borderRadius: "var(--r-pill)",
                    fontFamily: "var(--font-mono)",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent-dim)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)")}
                >
                  {r.kind === "outlier" ? (
                    <SevGlyph sev="critical" size={7} />
                  ) : (
                    <span style={{ width: 7, height: 7, background: "var(--accent)", borderRadius: 2 }} />
                  )}
                  {r.id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Evidence — collapsible */}
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setShowEv((v) => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600,
              color: "var(--text-3)",
              textTransform: "uppercase", letterSpacing: "0.08em",
              padding: "4px 0",
            }}
          >
            <Icon name="chevron" size={11} />
            <span
              style={{
                transform: showEv ? "rotate(90deg)" : "rotate(0deg)",
                display: "inline-flex",
                transition: "transform var(--t-fast)",
              }}
            >
              <Icon name="chevron" size={11} />
            </span>
            Evidence · {m.evidence.length} tool calls
          </button>
          {showEv && (
            <div
              style={{
                marginTop: 6, padding: "10px 12px",
                background: "var(--surface-inset)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5, lineHeight: 1.7,
              }}
            >
              {m.evidence.map((e, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span style={{ color: "var(--accent-bright)" }}>{e.tool}</span>
                  <span style={{ color: "var(--text-3)" }}>(</span>
                  <span style={{ color: "var(--text-2)" }}>{e.args}</span>
                  <span style={{ color: "var(--text-3)" }}>)</span>
                  <span style={{ color: "var(--text-4)" }}>  → </span>
                  <span style={{ color: "var(--text-2)" }}>
                    {Object.entries(e)
                      .filter(([k]) => !["tool", "args"].includes(k))
                      .map(([k, v], j) => (
                        <span key={j}>
                          {k}: {String(v)}
                        </span>
                      ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Follow-ups */}
        {m.followups && m.followups.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {m.followups.map((f, i) => (
              <button
                key={i}
                style={{
                  padding: "6px 10px", fontSize: 12,
                  color: "var(--text-2)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--r-pill)",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = "var(--accent-dim)";
                  el.style.color = "var(--accent-bright)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = "var(--surface-2)";
                  el.style.color = "var(--text-2)";
                }}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
      <div style={{ width: 2, background: "var(--accent)", borderRadius: 2 }} />
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          color: "var(--text-3)", fontSize: 12,
        }}
      >
        <span style={{ display: "inline-flex", gap: 3 }}>
          <span
            style={{
              width: 4, height: 4, background: "var(--accent)", borderRadius: "50%",
              animation: "reliat-pulse 1.2s ease-in-out infinite",
            }}
          />
          <span
            style={{
              width: 4, height: 4, background: "var(--accent)", borderRadius: "50%",
              animation: "reliat-pulse 1.2s ease-in-out 0.2s infinite",
            }}
          />
          <span
            style={{
              width: 4, height: 4, background: "var(--accent)", borderRadius: "50%",
              animation: "reliat-pulse 1.2s ease-in-out 0.4s infinite",
            }}
          />
        </span>
        Reasoning…
        <style>{`@keyframes reliat-pulse{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}`}</style>
      </div>
    </div>
  );
}
