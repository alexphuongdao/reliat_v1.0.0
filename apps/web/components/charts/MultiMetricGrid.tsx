"use client";

/**
 * MultiMetricGrid — small multiples, 1–3 per row, each a real plot with
 * its own X/Y axes, gridlines, axis labels, and outlier markers. Sized
 * to be legible standing alone, not a thumbnail.
 */
import { useMemo } from "react";
import type { SeriesWithBands } from "../../lib/api";

export interface MultiMetricGridProps {
  series: Array<{ id: string; label: string; unit?: string; data: SeriesWithBands | null }>;
  onPickMetric?: (metricId: string) => void;
  /** Tile pixel height. Width comes from the grid container. */
  tileHeight?: number;
}

export function MultiMetricGrid({ series, onPickMetric, tileHeight = 220 }: MultiMetricGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
        gap: 14,
      }}
    >
      {series.map((s) => (
        <MiniSpc
          key={s.id}
          label={s.label}
          unit={s.unit}
          data={s.data}
          height={tileHeight}
          onClick={onPickMetric ? () => onPickMetric(s.id) : undefined}
        />
      ))}
    </div>
  );
}

function MiniSpc({
  label,
  unit,
  data,
  height,
  onClick,
}: {
  label: string;
  unit?: string;
  data: SeriesWithBands | null;
  height: number;
  onClick?: () => void;
}) {
  // viewBox lets the SVG scale to the container width while keeping
  // tick spacing in plot coordinates.
  const W = 380;
  const H = height;
  const PAD = { top: 30, right: 12, bottom: 36, left: 52 };

  const view = useMemo(() => {
    if (!data || data.points.length === 0) return null;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const vs = data.points.map((p) => p.v);
    const means = data.points.map((p) => p.mean);
    const stds = data.points.map((p) => p.std);
    const upper = means.map((m, i) => m + 2 * stds[i]);
    const lower = means.map((m, i) => m - 2 * stds[i]);
    const allY = [...vs, ...upper, ...lower];
    const yLoRaw = Math.min(...allY);
    const yHiRaw = Math.max(...allY);
    const padY = (yHiRaw - yLoRaw) * 0.1 || 1;
    const yLo = yLoRaw - padY;
    const yHi = yHiRaw + padY;

    const t0 = data.points[0].t;
    const tN = data.points[data.points.length - 1].t;
    const tSpan = Math.max(tN - t0, 1);

    const xScale = (t: number) => PAD.left + ((t - t0) / tSpan) * plotW;
    const yScale = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * plotH;

    const linePath = data.points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.v).toFixed(2)}`)
      .join(" ");
    const meanPath = data.points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.mean).toFixed(2)}`)
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

    const yTicks = [yLo, yLo + (yHi - yLo) * 0.25, yLo + (yHi - yLo) * 0.5, yLo + (yHi - yLo) * 0.75, yHi];
    const xTicks = [t0, t0 + tSpan * 0.5, tN];

    const current = vs[vs.length - 1];
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

    return {
      plotW, plotH, xScale, yScale,
      linePath, meanPath, bandPath, markers, current, yTicks, xTicks,
    };
  }, [data, W, H]);

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "10px 12px 6px",
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
        <div>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            {label}
          </span>
          {unit && (
            <span style={{ fontSize: 10.5, color: "var(--text-3)", marginLeft: 6 }}>
              ({unit})
            </span>
          )}
        </div>
        <span
          className="mono"
          style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}
        >
          {view ? fmt(view.current) : "—"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        style={{ display: "block", fontFamily: "var(--font-mono)" }}
      >
        {view && (
          <>
            {/* gridlines */}
            {view.yTicks.map((v, i) => (
              <line
                key={`gy${i}`}
                x1={PAD.left}
                x2={PAD.left + view.plotW}
                y1={view.yScale(v)}
                y2={view.yScale(v)}
                stroke="var(--border)"
                strokeWidth={1}
                opacity={0.35}
              />
            ))}
            {/* axes */}
            <line
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={PAD.top + view.plotH}
              stroke="var(--text-2)"
              strokeWidth={1.2}
            />
            <line
              x1={PAD.left}
              x2={PAD.left + view.plotW}
              y1={PAD.top + view.plotH}
              y2={PAD.top + view.plotH}
              stroke="var(--text-2)"
              strokeWidth={1.2}
            />
            {/* y ticks */}
            {view.yTicks.map((v, i) => (
              <g key={`yt${i}`}>
                <line
                  x1={PAD.left - 3}
                  x2={PAD.left}
                  y1={view.yScale(v)}
                  y2={view.yScale(v)}
                  stroke="var(--text-2)"
                  strokeWidth={1}
                />
                {i % 2 === 0 && (
                  <text
                    x={PAD.left - 5}
                    y={view.yScale(v) + 3}
                    textAnchor="end"
                    fill="var(--text-2)"
                    fontSize={10}
                  >
                    {fmt(v)}
                  </text>
                )}
              </g>
            ))}
            {/* x ticks */}
            {view.xTicks.map((t, i) => (
              <g key={`xt${i}`}>
                <line
                  x1={view.xScale(t)}
                  x2={view.xScale(t)}
                  y1={PAD.top + view.plotH}
                  y2={PAD.top + view.plotH + 4}
                  stroke="var(--text-2)"
                  strokeWidth={1}
                />
                <text
                  x={view.xScale(t)}
                  y={PAD.top + view.plotH + 15}
                  textAnchor="middle"
                  fill="var(--text-2)"
                  fontSize={10}
                >
                  {fmtT(t)}
                </text>
              </g>
            ))}
            {/* ±2σ band */}
            <path d={view.bandPath} fill="var(--accent)" opacity={0.10} />
            {/* mean */}
            <path
              d={view.meanPath}
              fill="none"
              stroke="var(--text-2)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            {/* measurement */}
            <path
              d={view.linePath}
              fill="none"
              stroke="var(--ch-1)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {view.markers.map((m, i) => (
              <circle
                key={`m${i}`}
                cx={m.cx}
                cy={m.cy}
                r={2.6}
                fill={m.sev === "critical" ? "var(--sev-crit)" : "var(--sev-warn)"}
                stroke="var(--surface-1)"
                strokeWidth={0.75}
              />
            ))}
            {/* axis labels */}
            <text
              x={PAD.left + view.plotW / 2}
              y={H - 4}
              textAnchor="middle"
              fill="var(--text-3)"
              fontSize={10}
            >
              time
            </text>
          </>
        )}
        {!view && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-3)" fontSize={11}>
            no data
          </text>
        )}
      </svg>
    </div>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtT(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
