"use client";

import { useState } from "react";
import { Icon } from "../../ui";

export type ChipValue = string | null | Set<string>;

export function FilterChip({
  label, current, options, value, onChange, singleSelect, optionLabel,
}: {
  label: string;
  current: string;
  options: string[];
  value: ChipValue;
  onChange:
    | ((next: string | null) => void)
    | ((updater: (prev: Set<string>) => Set<string>) => void);
  singleSelect?: boolean;
  optionLabel?: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", fontSize: 11.5, fontWeight: 500,
          background: "var(--surface-2)", color: "var(--text-2)",
          border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
        }}
      >
        <span style={{ color: "var(--text-3)" }}>{label}:</span>
        <span style={{ color: "var(--text-1)" }}>{current}</span>
        <Icon name="chevdown" size={12} />
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60,
            minWidth: 200, maxHeight: 280, overflow: "auto",
            background: "var(--surface-2)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)", padding: 4,
          }}
        >
          {singleSelect && (
            <div
              onClick={() => {
                (onChange as (next: string | null) => void)(null);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px", fontSize: 12.5, cursor: "pointer",
                borderRadius: "var(--r-sm)",
                color: !value ? "var(--accent-bright)" : "var(--text-2)",
              }}
            >
              All
            </div>
          )}
          {options.map((o) => {
            const on = singleSelect
              ? value === o
              : (value as Set<string>).has(o);
            return (
              <div
                key={o}
                onClick={() => {
                  if (singleSelect) {
                    (onChange as (next: string | null) => void)(o);
                    setOpen(false);
                  } else {
                    (onChange as (updater: (prev: Set<string>) => Set<string>) => void)((ns) => {
                      const next = new Set(ns);
                      if (next.has(o)) next.delete(o);
                      else next.add(o);
                      return next;
                    });
                  }
                }}
                style={{
                  padding: "6px 10px", fontSize: 12.5, cursor: "pointer",
                  borderRadius: "var(--r-sm)",
                  display: "flex", alignItems: "center", gap: 8,
                  color: on ? "var(--accent-bright)" : "var(--text-1)",
                  background: on ? "var(--accent-dim)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!on) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
                }}
                onMouseLeave={(e) => {
                  if (!on) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                {!singleSelect && (
                  <span
                    style={{
                      width: 13, height: 13, border: "1px solid var(--border-strong)",
                      borderRadius: 3,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: on ? "var(--accent)" : "transparent",
                    }}
                  >
                    {on && <Icon name="check" size={9} />}
                  </span>
                )}
                {optionLabel ? optionLabel(o) : o}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
