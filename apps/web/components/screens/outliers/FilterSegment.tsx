"use client";

import { SevGlyph } from "../../ui";
import type { Severity } from "../../../lib/types";

export interface FilterSegmentOption {
  id: string;
  label: string;
  count: number;
  glyph: string;
}

export function FilterSegment({
  label, options, value, onChange,
}: {
  label: string;
  options: FilterSegmentOption[];
  value: Set<Severity>;
  onChange: (updater: (prev: Set<Severity>) => Set<Severity>) => void;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 4, fontWeight: 500 }}>{label}</span>
      <div
        style={{
          display: "inline-flex", padding: 2,
          background: "var(--surface-inset)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
        }}
      >
        {options.map((o) => {
          const on = value.has(o.id as Severity);
          return (
            <button
              key={o.id}
              onClick={() =>
                onChange((ns) => {
                  const next = new Set(ns);
                  if (next.has(o.id as Severity)) next.delete(o.id as Severity);
                  else next.add(o.id as Severity);
                  return next;
                })
              }
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px", fontSize: 11.5, fontWeight: 500,
                background: on ? "var(--surface-3)" : "transparent",
                color: on ? "var(--text-1)" : "var(--text-3)",
                borderRadius: "var(--r-sm)",
              }}
            >
              <SevGlyph sev={o.glyph} size={8} />
              {o.label}
              <span className="mono" style={{ color: "var(--text-3)", fontSize: 10.5 }}>{o.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
