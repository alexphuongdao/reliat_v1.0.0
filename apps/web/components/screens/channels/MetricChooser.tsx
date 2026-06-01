"use client";

import { useState } from "react";
import { Icon } from "../../ui";

export function MetricChooser({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups: Array<{ name: string; items: string[] }> = [
    { name: "Percentiles", items: ["F10", "F20", "F30", "F50", "F80", "F90", "Topsize"] },
    { name: "Sieves", items: ["Sieve 4mm", "Sieve 12.5mm", "Sieve 19mm", "Sieve 45mm", "Sieve 100mm"] },
    { name: "Color (HSL)", items: ["Hue avg", "Saturation avg", "Lightness avg"] },
    { name: "Color (RGB)", items: ["R avg", "G avg", "B avg"] },
  ];
  return (
    <span style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", fontSize: 12.5, fontWeight: 600,
          background: "var(--surface-2)", color: "var(--text-1)",
          border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
        }}
      >
        <span className="mono" style={{ color: "var(--accent-bright)" }}>y:</span> {value}
        <Icon name="chevdown" size={12} />
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
            minWidth: 220, background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 4,
          }}
        >
          {groups.map((g) => (
            <div key={g.name}>
              <div
                style={{
                  fontSize: 10, color: "var(--text-3)",
                  padding: "6px 10px 2px",
                  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
                }}
              >
                {g.name}
              </div>
              {g.items.map((it) => (
                <div
                  key={it}
                  onClick={() => {
                    onChange(it);
                    setOpen(false);
                  }}
                  style={{
                    padding: "4px 12px", fontSize: 12.5,
                    cursor: "pointer", borderRadius: "var(--r-sm)",
                    background: value === it ? "var(--accent-dim)" : "transparent",
                    color: value === it ? "var(--accent-bright)" : "var(--text-1)",
                  }}
                  onMouseEnter={(e) => {
                    if (value !== it) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
                  }}
                  onMouseLeave={(e) => {
                    if (value !== it) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {it}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
