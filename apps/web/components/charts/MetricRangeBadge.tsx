"use client";

/**
 * MetricRangeBadge — compact KPI pill showing current value + range
 * status driven by z-score. Used in the channel grid above the SPC
 * charts. New atom in the design language for analytics.
 */
import type { MetricKpi, AnalyticsSeverity } from "../../lib/api";

export interface MetricRangeBadgeProps {
  label: string;
  kpi: MetricKpi;
  unit?: string;
}

const SEV_COLOR: Record<AnalyticsSeverity, string> = {
  ok: "var(--ch-4)",
  info: "var(--sev-info)",
  warn: "var(--sev-warn)",
  critical: "var(--sev-crit)",
};

const SEV_LABEL: Record<AnalyticsSeverity, string> = {
  ok: "in range",
  info: "watch",
  warn: "warn",
  critical: "out of range",
};

export function MetricRangeBadge({ label, kpi, unit }: MetricRangeBadgeProps) {
  const color = SEV_COLOR[kpi.severity];
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${color}`,
        borderRadius: "var(--r-sm)",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
      title={`z=${kpi.z.toFixed(2)} · mean ${kpi.mean_all.toFixed(2)} ± ${kpi.std_all.toFixed(2)}`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            color: "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 9.5,
            color,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          {SEV_LABEL[kpi.severity]}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--text-1)" }}>
          {fmtKpi(kpi.current)}
        </span>
        {unit && (
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{unit}</span>
        )}
        <span
          className="mono"
          style={{ fontSize: 10.5, color: "var(--text-3)", marginLeft: "auto" }}
        >
          z={kpi.z >= 0 ? "+" : ""}{kpi.z.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function fmtKpi(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(3);
}
