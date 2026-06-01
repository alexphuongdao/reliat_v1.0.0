"use client";

import { useState } from "react";
import { Button } from "../../ui";
import type { RangeId } from "./types";

export function TimeRangePicker({
  value, onChange,
}: {
  value: RangeId;
  onChange: (id: RangeId) => void;
}) {
  const opts: Array<{ id: RangeId; label: string }> = [
    { id: "1h", label: "Last hour" },
    { id: "shift", label: "This shift" },
    { id: "24h", label: "Last 24h" },
    { id: "7d", label: "Last 7d" },
    { id: "30d", label: "Last 30d" },
  ];
  const [open, setOpen] = useState(false);
  const current = opts.find((o) => o.id === value)!;
  return (
    <span style={{ position: "relative" }}>
      <Button
        size="md" variant="secondary"
        leftIcon="history" rightIcon="chevdown"
        onClick={() => setOpen((v) => !v)}
      >
        {current.label}
      </Button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            minWidth: 200, background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 4, zIndex: 60,
          }}
        >
          {opts.map((o) => (
            <div
              key={o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px", borderRadius: "var(--r-sm)",
                cursor: "pointer", fontSize: 13,
                background: o.id === value ? "var(--accent-dim)" : "transparent",
                color: o.id === value ? "var(--accent-bright)" : "var(--text-1)",
              }}
              onMouseEnter={(e) => {
                if (o.id !== value) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
              }}
              onMouseLeave={(e) => {
                if (o.id !== value) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {o.label}
            </div>
          ))}
          <div
            style={{
              borderTop: "1px solid var(--border)", marginTop: 4,
              padding: "6px 10px", fontSize: 12, color: "var(--text-3)",
            }}
          >
            Custom range…
          </div>
        </div>
      )}
    </span>
  );
}
