"use client";

import { useState } from "react";
import { Icon, SevGlyph } from "../../ui";
import { fmtAge } from "../../../lib/format";
import type { AgentRef, AgentTurnMsg } from "../../../lib/types";

export function Turn({ m, onOpenRef }: { m: AgentTurnMsg; onOpenRef: (r: AgentRef) => void }) {
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
