"use client";

import { useState } from "react";
import { Button, Icon } from "../../ui";
import type { Channel } from "../../../lib/types";

export function CompareControl({
  channels, value, onChange,
}: {
  channels: Channel[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <Button size="md" variant="secondary" leftIcon="compare" onClick={() => setOpen((v) => !v)}>
        Compare
        {value.length > 0 && <span style={{ color: "var(--accent-bright)" }}> · {value.length}</span>}
      </Button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            minWidth: 260, maxHeight: 380, overflow: "auto",
            background: "var(--surface-2)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 6, zIndex: 60,
          }}
        >
          <div
            style={{
              fontSize: 10.5, color: "var(--text-3)",
              padding: "4px 8px", textTransform: "uppercase",
              letterSpacing: "0.06em", fontWeight: 600,
            }}
          >
            Overlay up to 2 channels
          </div>
          {channels.map((c) => {
            const on = value.includes(c.id);
            const disabled = !on && value.length >= 2;
            return (
              <div
                key={c.id}
                onClick={() => {
                  if (disabled) return;
                  onChange(on ? value.filter((v) => v !== c.id) : [...value, c.id]);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 8px", borderRadius: "var(--r-sm)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1, fontSize: 12.5,
                  background: on ? "var(--accent-dim)" : "transparent",
                  color: on ? "var(--accent-bright)" : "var(--text-1)",
                }}
              >
                <span
                  style={{
                    width: 14, height: 14, border: "1px solid var(--border-strong)",
                    borderRadius: 3,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: on ? "var(--accent)" : "transparent",
                  }}
                >
                  {on && <Icon name="check" size={10} />}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                <span style={{ flex: 1 }}>{c.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
