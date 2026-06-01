"use client";

import { SevGlyph } from "./SevGlyph";

export function SevPill({ sev, size = "md" }: { sev: string; size?: "sm" | "md" }) {
  const map: Record<string, { c: string; bg: string; label: string }> = {
    critical: { c: "var(--sev-crit)", bg: "var(--sev-crit-dim)", label: "Critical" },
    warn:     { c: "var(--sev-warn)", bg: "var(--sev-warn-dim)", label: "Warning" },
    info:     { c: "var(--sev-info)", bg: "var(--sev-info-dim)", label: "Info" },
  };
  const m = map[sev] || map.info;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        height: size === "sm" ? 18 : 22, padding: "0 8px",
        fontSize: size === "sm" ? 10.5 : 11.5, fontWeight: 600,
        color: m.c, background: m.bg, border: `1px solid ${m.bg}`,
        borderRadius: "var(--r-pill)", letterSpacing: "0.02em",
      }}
    >
      <SevGlyph sev={sev} size={8} /> {m.label}
    </span>
  );
}
