"use client";

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.min(1, Math.max(0, value));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 36, height: 4, background: "var(--surface-inset)",
          borderRadius: 2, overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block", width: `${pct * 100}%`, height: "100%",
            background:
              pct > 0.75 ? "var(--ch-4)" :
              pct > 0.5  ? "var(--sev-warn)" :
                           "var(--sev-crit)",
          }}
        />
      </span>
      <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
        {(pct * 100).toFixed(0)}%
      </span>
    </span>
  );
}
