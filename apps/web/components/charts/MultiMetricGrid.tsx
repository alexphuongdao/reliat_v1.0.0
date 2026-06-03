"use client";

/**
 * MultiMetricGrid — small multiples of a metric series with a rolling
 * baseline. Used on the Channels analytics dashboard to show several
 * PSD/colour metrics at once. Each tile is a mini SPC plot: line +
 * shaded ±2σ band + excursion dots. Tiles are clickable so the user
 * can pop a metric into the big SPC chart.
 */
import { useMemo } from "react";
import type { SeriesWithBands } from "../../lib/api";

export interface MultiMetricGridProps {
  series: Array<{ id: string; label: string; data: SeriesWithBands | null }>;
  width?: number;
  tileHeight?: number;
  onPickMetric?: (metricId: string) => void;
}

export function MultiMetricGrid({
  series,
  width = 220,
  tileHeight = 80,
  onPickMetric,
}: MultiMetricGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 10,
      }}
    >
      {series.map((s) => (
        <MiniSpc
          key={s.id}
          label={s.label}
          data={s.data}
          width={width}
          height={tileHeight}
          onClick={onPickMetric ? () => onPickMetric(s.id) : undefined}
        />
      ))}
    </div>
  );
}

function MiniSpc({
  label,
  data,
  width,
  height,
  onClick,
}: {
  label: string;
  data: SeriesWithBands | null;
  width: number;
  height: number;
  onClick?: () => void;
}) {
  const PAD = { top: 18, right: 6, bottom: 4, left: 6 };

  const view = useMemo(() => {
    if (!data || data.points.length === 0) return null;
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const vs = data.points.map((p) => p.v);
    const means = data.points.map((p) => p.mean);
    const stds = data.points.map((p) => p.std);
    const upper = means.map((m, i) => m + 2 * stds[i]);
    const lower = means.map((m, i) => m - 2 * stds[i]);
    const allY = [...vs, ...upper, ...lower];
    const lo = Math.min(...allY);
    const hi = Math.max(...allY);
    const padY = (hi - lo) * 0.1 || 1;
    const yLo = lo - padY;
    const yHi = hi + padY;

    const t0 = data.points[0].t;
    const tN = data.points[data.points.length - 1].t;
    const span = Math.max(tN - t0, 1);

    const xScale = (t: number) => PAD.left + ((t - t0) / span) * plotW;
    const yScale = (v: number) =>
      PAD.top + (1 - (v - yLo) / (yHi - yLo)) * plotH;

    const linePath = data.points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.v).toFixed(2)}`,
      )
      .join(" ");

    const meanPath = data.points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.mean).toFixed(2)}`,
      )
      .join(" ");

    const up = data.points
      .map((p, i) => `${xScale(p.t).toFixed(2)},${yScale(upper[i]).toFixed(2)}`)
      .join(" L");
    const down = [...data.points]
      .reverse()
      .map(
        (p, i) =>
          `${xScale(p.t).toFixed(2)},${yScale(lower[data.points.length - 1 - i]).toFixed(2)}`,
      )
      .join(" L");
    const bandPath = `M${up} L${down} Z`;

    // Mark outliers: where v is outside ±2σ of its own rolling mean
    const markers = data.points
      .map((p, i) => {
        const z = stds[i] > 0 ? (p.v - p.mean) / stds[i] : 0;
        if (Math.abs(z) < 2) return null;
        return {
          cx: xScale(p.t),
          cy: yScale(p.v),
          sev: Math.abs(z) >= 3 ? "critical" : "warn",
        };
      })
      .filter(Boolean) as Array<{ cx: number; cy: number; sev: string }>;

    const current = vs[vs.length - 1];
    return { linePath, meanPath, bandPath, markers, current };
  }, [data, width, height]);

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        padding: 8,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color var(--t-fast) var(--ease)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 4,
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
          className="mono"
          style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 600 }}
        >
          {view ? fmt(view.current) : "—"}
        </span>
      </div>
      <svg width={width} height={height} style={{ display: "block" }}>
        {view && (
          <>
            <path d={view.bandPath} fill="var(--accent)" opacity={0.10} />
            <path
              d={view.meanPath}
              fill="none"
              stroke="var(--text-3)"
              strokeWidth={0.75}
              strokeDasharray="2 2"
              opacity={0.6}
            />
            <path
              d={view.linePath}
              fill="none"
              stroke="var(--ch-1)"
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {view.markers.map((m, i) => (
              <circle
                key={i}
                cx={m.cx}
                cy={m.cy}
                r={2}
                fill={m.sev === "critical" ? "var(--sev-crit)" : "var(--sev-warn)"}
                stroke="var(--surface-1)"
                strokeWidth={0.75}
              />
            ))}
          </>
        )}
        {!view && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill="var(--text-3)"
            fontSize={10}
          >
            no data
          </text>
        )}
      </svg>
    </div>
  );
}

function fmt(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(3);
}
