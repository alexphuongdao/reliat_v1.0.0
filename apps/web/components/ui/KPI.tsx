"use client";

export interface KPIProps {
  label: string;
  value: string;
  unit?: string;
  delta?: string | null;
  mono?: boolean;
}

export function KPI({ label, value, unit, delta, mono = true }: KPIProps) {
  const deltaColor = delta
    ? delta.startsWith("-")
      ? "var(--sev-crit)"
      : delta.startsWith("+")
        ? "var(--ch-4)"
        : "var(--text-3)"
    : undefined;
  return (
    <div style={{ padding: "10px 14px", minWidth: 0 }}>
      <div
        style={{
          fontSize: 10.5, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 22, fontWeight: 600, color: "var(--text-1)",
            fontFamily: mono ? "var(--font-mono)" : "inherit",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {unit && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{unit}</span>}
        {delta && (
          <span style={{ marginLeft: 4, fontSize: 11.5, color: deltaColor }}>{delta}</span>
        )}
      </div>
    </div>
  );
}
