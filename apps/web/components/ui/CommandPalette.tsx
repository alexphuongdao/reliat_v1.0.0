"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Channel, Command, Outlier } from "../../lib/types";
import { Icon } from "./Icon";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onRun: (item: Command) => void;
  channels: Channel[];
  outliers: Outlier[];
  staticCommands: Command[];
}

export function CommandPalette({
  open, onClose, onRun, channels, outliers, staticCommands,
}: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<Command[]>(() => {
    const channelCmds: Command[] = channels.map((c) => ({
      id: "ch." + c.id,
      label: `Open channel · ${c.name}`,
      kind: "Channel",
      surface: "channels",
      channelId: c.id,
    }));
    const outlierCmds: Command[] = outliers.slice(0, 25).map((o) => ({
      id: "out." + o.id,
      label: `Outlier ${o.id} · ${o.channelName} · ${o.type}`,
      kind: "Outlier",
      surface: "outliers",
      outlierId: o.id,
    }));
    const askAgent: Command[] = q.trim().length > 3
      ? [{
          id: "agent.ask",
          label: `Ask agent: "${q.trim()}"`,
          kind: "Agent",
          surface: "agent",
        }]
      : [];
    let all: Command[] = [...staticCommands, ...channelCmds, ...outlierCmds, ...askAgent];
    if (q.trim()) {
      const needle = q.toLowerCase();
      all = all.filter(
        (c) =>
          c.label.toLowerCase().includes(needle) ||
          (c.kind && c.kind.toLowerCase().includes(needle)),
      );
    } else {
      all = all.slice(0, 18);
    }
    return all;
  }, [q, channels, outliers, staticCommands]);

  useEffect(() => {
    if (sel >= items.length) setSel(0);
  }, [items.length, sel]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[sel]) {
        onRun(items[sel]);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  const grouped: Record<string, Command[]> = {};
  items.forEach((i) => {
    (grouped[i.kind] = grouped[i.kind] || []).push(i);
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(5,7,10,0.4)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "15vh", zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
        style={{
          width: "min(640px, 88vw)",
          maxHeight: "64vh",
          background: "var(--glass-bg-2)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "var(--text-3)" }}>
            <Icon name="search" size={16} />
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={handleKey}
            placeholder="Jump to anything, run a command, ask the agent…"
            style={{
              flex: 1, background: "transparent", border: 0, outline: 0,
              color: "var(--text-1)", fontSize: 15, fontFamily: "var(--font-sans)",
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
          {items.length === 0 && (
            <div style={{ padding: "24px 16px", color: "var(--text-3)", fontSize: 13 }}>
              No matches. Try a channel name, outlier ID, or a question.
            </div>
          )}
          {Object.entries(grouped).map(([kind, list]) => (
            <div key={kind}>
              <div
                style={{
                  fontSize: 10.5, fontWeight: 600, color: "var(--text-3)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  padding: "10px 16px 4px",
                }}
              >
                {kind}
              </div>
              {list.map((item) => {
                const idx = items.indexOf(item);
                const active = idx === sel;
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => {
                      onRun(item);
                      onClose();
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 16px",
                      background: active ? "var(--accent-dim)" : "transparent",
                      borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                      cursor: "pointer",
                      transition: "background var(--t-instant)",
                    }}
                  >
                    <span
                      style={{
                        color: active ? "var(--accent-bright)" : "var(--text-2)",
                        flex: 1, fontSize: 13,
                      }}
                    >
                      {item.label}
                    </span>
                    {item.shortcut && (
                      <span style={{ display: "flex", gap: 3 }}>
                        {item.shortcut.split(" ").map((k, i) => (
                          <span key={i} className="kbd">{k}</span>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "8px 14px", borderTop: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-3)",
          }}
        >
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span className="kbd">↵</span> run
          </span>
          <span style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: "auto" }}>
            <span className="kbd">⌘</span>
            <span className="kbd">K</span> open palette
          </span>
        </div>
      </div>
    </div>
  );
}
