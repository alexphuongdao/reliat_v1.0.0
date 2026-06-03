"use client";

/**
 * SpcChart — Statistical Process Control chart, new chart type extending
 * the locked design language. Pure SVG, token-driven colors, tabular
 * numerals. The chart's purpose:
 *
 *   • show every measurement as a line
 *   • shade a 3-tier control band (±1σ, ±2σ, ±3σ) around the rolling mean
 *   • mark every point that lands outside ±2σ with its severity color
 *
 * The bands track a rolling baseline (computed server-side) so slow drift
 * doesn't trigger excursions — only true outliers do.
 */
import { useMemo } from "react";
import type { SpcSeries } from "../../lib/api";

export interface SpcChartProps {
  data: SpcSeries;
  width?: number;
  height?: number;
  yLabel?: string;
  /** Optional callback when a point is clicked (epoch ms). */
  onPointClick?: (t: number) => void;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

export function SpcChart({
  data,
  width = 720,
  height = 260,
  yLabel,
  onPointClick,
}: SpcChartProps) {
  const points = data.points;

  const { plotW, plotH, xScale, yScale, yTicks, xTicks, linePath, meanPath, bandPaths } =
    useMemo(() => {
      const plotW = width - PAD.left - PAD.right;
      const plotH = height - PAD.top - PAD.bottom;

      if (points.length === 0) {
        return {
          plotW, plotH,
          xScale: (t: number) => 0,
          yScale: (v: number) => 0,
          yTicks: [] as number[],
          xTicks: [] as { t: number; x: number }[],
          linePath: "",
          meanPath: "",
          bandPaths: { b1: "", b2: "", b3: "" },
        };
      }

      // y bounds: include band extremes so the 3σ envelope is always visible.
      const allY: number[] = [];
      for (const p of points) {
        allY.push(p.v, p.mean, p.ucl1, p.lcl1, p.ucl2, p.lcl2, p.ucl3, p.lcl3);
      }
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);
      const padY = (maxY - minY) * 0.08 || 1;
      const lo = minY - padY;
      const hi = maxY + padY;

      const t0 = points[0].t;
      const tN = points[points.length - 1].t;
      const span = Math.max(tN - t0, 1);
      const xScale = (t: number) => PAD.left + ((t - t0) / span) * plotW;
      const yScale = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

      const linePath = points
        .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.v).toFixed(2)}`)
        .join(" ");
      const meanPath = points
        .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.mean).toFixed(2)}`)
        .join(" ");

      const bandArea = (upper: (p: typeof points[0]) => number, lower: (p: typeof points[0]) => number) => {
        const up = points.map((p) => `${xScale(p.t).toFixed(2)},${yScale(upper(p)).toFixed(2)}`).join(" L");
        const down = [...points].reverse().map((p) => `${xScale(p.t).toFixed(2)},${yScale(lower(p)).toFixed(2)}`).join(" L");
        return `M${up} L${down} Z`;
      };
      const bandPaths = {
        b3: bandArea((p) => p.ucl3, (p) => p.lcl3),
        b2: bandArea((p) => p.ucl2, (p) => p.lcl2),
        b1: bandArea((p) => p.ucl1, (p) => p.lcl1),
      };

      // y ticks — 4 evenly spaced.
      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
      // x ticks — 5 evenly spaced timestamps.
      const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
        const t = t0 + f * span;
        return { t, x: xScale(t) };
      });

      return { plotW, plotH, xScale, yScale, yTicks, xTicks, linePath, meanPath, bandPaths };
    }, [points, width, height]);

  if (points.length === 0) {
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <text
          x={width / 2} y={height / 2}
          textAnchor="middle"
          fill="var(--text-3)"
          fontSize={12}
        >
          no data in window
        </text>
      </svg>
    );
  }

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {/* nested SPC bands, lightest at outermost */}
      <path d={bandPaths.b3} fill="var(--sev-crit)" opacity={0.07} />
      <path d={bandPaths.b2} fill="var(--sev-warn)" opacity={0.09} />
      <path d={bandPaths.b1} fill="var(--accent)" opacity={0.10} />

      {/* y grid + tick labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left} x2={PAD.left + plotW}
            y1={yScale(v)} y2={yScale(v)}
            stroke="var(--border)" strokeWidth={1} opacity={0.5}
          />
          <text
            x={PAD.left - 6} y={yScale(v) + 3}
            textAnchor="end"
            fill="var(--text-3)" fontSize={10}
            className="mono"
          >
            {fmtNum(v)}
          </text>
        </g>
      ))}

      {/* x tick labels */}
      {xTicks.map((tk, i) => (
        <text
          key={i}
          x={tk.x} y={height - 8}
          textAnchor="middle"
          fill="var(--text-3)" fontSize={10}
          className="mono"
        >
          {fmtTime(tk.t)}
        </text>
      ))}

      {/* rolling mean — dashed center line */}
      <path
        d={meanPath}
        fill="none"
        stroke="var(--text-3)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.6}
      />

      {/* measurement line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--ch-1)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* excursion markers */}
      {points.map((p, i) => {
        if (p.severity === "ok") return null;
        const color =
          p.severity === "critical" ? "var(--sev-crit)" :
          p.severity === "warn" ? "var(--sev-warn)" :
          "var(--sev-info)";
        return (
          <circle
            key={i}
            cx={xScale(p.t)}
            cy={yScale(p.v)}
            r={3}
            fill={color}
            stroke="var(--surface-1)"
            strokeWidth={1}
            onClick={onPointClick ? () => onPointClick(p.t) : undefined}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            <title>
              z={p.z.toFixed(2)} · {fmtNum(p.v)} (mean {fmtNum(p.mean)})
            </title>
          </circle>
        );
      })}

      {/* y axis label */}
      {yLabel && (
        <text
          x={PAD.left - 36}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fill="var(--text-3)"
          fontSize={10}
          transform={`rotate(-90 ${PAD.left - 36} ${PAD.top + plotH / 2})`}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}

function fmtNum(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
