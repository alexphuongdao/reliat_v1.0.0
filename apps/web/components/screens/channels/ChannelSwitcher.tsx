"use client";

import { useState } from "react";
import { Button } from "../../ui";
import type { Channel } from "../../../lib/types";

export function ChannelSwitcher({
  channels, current, onSelect,
}: {
  channels: Channel[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <Button size="sm" variant="ghost" rightIcon="chevdown" onClick={() => setOpen((v) => !v)}>
        Switch
      </Button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            minWidth: 240, maxHeight: 320, overflow: "auto",
            background: "var(--surface-2)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 4, zIndex: 60,
          }}
        >
          {channels.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                onSelect(c.id);
                setOpen(false);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderRadius: "var(--r-sm)",
                background: c.id === current ? "var(--accent-dim)" : "transparent",
                color: c.id === current ? "var(--accent-bright)" : "var(--text-1)",
                cursor: "pointer", fontSize: 13,
              }}
              onMouseEnter={(e) => {
                if (c.id !== current) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
              }}
              onMouseLeave={(e) => {
                if (c.id !== current) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="mono dim" style={{ fontSize: 11 }}>{c.belt}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
