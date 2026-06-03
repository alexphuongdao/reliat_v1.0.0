"use client";

/**
 * SpcChart — Statistical Process Control chart, built to read like a
 * matplotlib/seaborn figure: explicit axis lines, tick marks, gridlines,
 * axis labels with units, and nested ±1σ/2σ/3σ control bands. Click
 * markers report the z-score.
 */
import { useMemo } from "react";
import type { SpcSeries } from "../../lib/api";

export interface SpcChartProps {
  data: SpcSeries;
  width?: number;
  height?: number;
  yLabel?: string;
  yUnit?: string;
  onPointClick?: (t: number) => void;
}

const PAD = { top: 18, right: 28, bottom: 56, left: 80 };
const Y_TICKS = 6;
const X_TICKS = 8;

export function SpcChart({
  data,
  width = 1100,
  height = 440,
  yLabel,
  yUnit,
  onPointClick,
}: SpcChartProps) {
  const points = data.points;

  const view = useMemo(() => {
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    if (points.length === 0) return null;

    const allY: number[] = [];
    for (const p of points) {
      allY.push(p.v, p.mean, p.ucl1, p.lcl1, p.ucl2, p.lcl2, p.ucl3, p.lcl3);
    }
    const yMin = Math.min(...allY);
    const yMax = Math.max(...allY);
    const yPad = (yMax - yMin) * 0.08 || 1;
    const yLo = yMin - yPad;
    const yHi = yMax + yPad;

    const t0 = points[0].t;
    const tN = points[points.length - 1].t;
    const tSpan = Math.max(tN - t0, 1);

    const xScale = (t: number) => PAD.left + ((t - t0) / tSpan) * plotW;
    const yScale = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * plotH;

    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.v).toFixed(2)}`)
      .join(" ");
    const meanPath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(2)},${yScale(p.mean).toFixed(2)}`)
      .join(" ");

    const bandArea = (
      upper: (p: typeof points[0]) => number,
      lower: (p: typeof points[0]) => number,
    ) => {
      const up = points
        .map((p) => `${xScale(p.t).toFixed(2)},${yScale(upper(p)).toFixed(2)}`)
        .join(" L");
      const down = [...points]
        .reverse()
        .map((p) => `${xScale(p.t).toFixed(2)},${yScale(lower(p)).toFixed(2)}`)
        .join(" L");
      return `M${up} L${down} Z`;
    };
    const bands = {
      b3: bandArea((p) => p.ucl3, (p) => p.lcl3),
      b2: bandArea((p) => p.ucl2, (p) => p.lcl2),
      b1: bandArea((p) => p.ucl1, (p) => p.lcl1),
    };

    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => yLo + (i / Y_TICKS) * (yHi - yLo));
    const xTicks = Array.from({ length: X_TICKS + 1 }, (_, i) => t0 + (i / X_TICKS) * tSpan);

    return { plotW, plotH, xScale, yScale, linePath, meanPath, bands, yTicks, xTicks, t0, tN };
  }, [points, width, height]);

  if (!view) {
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--text-3)" fontSize={13}>
          no data in window — upload a CSV with this metric
        </text>
      </svg>
    );
  }

  const yAxisLabel = yLabel
    ? yUnit
      ? `${yLabel} (${yUnit})`
      : yLabel
    : yUnit;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible", fontFamily: "var(--font-mono)" }}>
      {/* shaded SPC bands, lightest outermost */}
      <path d={view.bands.b3} fill="var(--sev-crit)" opacity={0.07} />
      <path d={view.bands.b2} fill="var(--sev-warn)" opacity={0.09} />
      <path d={view.bands.b1} fill="var(--accent)" opacity={0.11} />

      {/* gridlines (light) */}
      {view.yTicks.map((v, i) => (
        <line
          key={`gy${i}`}
          x1={PAD.left}
          x2={PAD.left + view.plotW}
          y1={view.yScale(v)}
          y2={view.yScale(v)}
          stroke="var(--border)"
          strokeWidth={1}
          opacity={0.4}
        />
      ))}
      {view.xTicks.map((t, i) => (
        <line
          key={`gx${i}`}
          x1={view.xScale(t)}
          x2={view.xScale(t)}
          y1={PAD.top}
          y2={PAD.top + view.plotH}
          stroke="var(--border)"
          strokeWidth={1}
          opacity={0.25}
        />
      ))}

      {/* axis lines */}
      <line
        x1={PAD.left}
        x2={PAD.left}
        y1={PAD.top}
        y2={PAD.top + view.plotH}
        stroke="var(--text-2)"
        strokeWidth={1.5}
      />
      <line
        x1={PAD.left}
        x2={PAD.left + view.plotW}
        y1={PAD.top + view.plotH}
        y2={PAD.top + view.plotH}
        stroke="var(--text-2)"
        strokeWidth={1.5}
      />

      {/* y ticks + labels */}
      {view.yTicks.map((v, i) => (
        <g key={`yt${i}`}>
          <line
            x1={PAD.left - 5}
            x2={PAD.left}
            y1={view.yScale(v)}
            y2={view.yScale(v)}
            stroke="var(--text-2)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={view.yScale(v) + 4}
            textAnchor="end"
            fill="var(--text-2)"
            fontSize={11}
          >
            {fmtNum(v)}
          </text>
        </g>
      ))}
      {/* x ticks + labels */}
      {view.xTicks.map((t, i) => (
        <g key={`xt${i}`}>
          <line
            x1={view.xScale(t)}
            x2={view.xScale(t)}
            y1={PAD.top + view.plotH}
            y2={PAD.top + view.plotH + 5}
            stroke="var(--text-2)"
            strokeWidth={1}
          />
          <text
            x={view.xScale(t)}
            y={PAD.top + view.plotH + 18}
            textAnchor="middle"
            fill="var(--text-2)"
            fontSize={11}
          >
            {fmtTime(t)}
          </text>
        </g>
      ))}

      {/* rolling mean — dashed */}
      <path
        d={view.meanPath}
        fill="none"
        stroke="var(--text-2)"
        strokeWidth={1.25}
        strokeDasharray="4 4"
        opacity={0.7}
      />

      {/* measurement line */}
      <path
        d={view.linePath}
        fill="none"
        stroke="var(--ch-1)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* excursion markers */}
      {points.map((p, i) => {
        if (p.severity === "ok") return null;
        const color =
          p.severity === "critical"
            ? "var(--sev-crit)"
            : p.severity === "warn"
              ? "var(--sev-warn)"
              : "var(--sev-info)";
        return (
          <circle
            key={i}
            cx={view.xScale(p.t)}
            cy={view.yScale(p.v)}
            r={3.5}
            fill={color}
            stroke="var(--surface-1)"
            strokeWidth={1.25}
            onClick={onPointClick ? () => onPointClick(p.t) : undefined}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            <title>
              {fmtTime(p.t)} · {fmtNum(p.v)} · z={p.z.toFixed(2)} (μ {fmtNum(p.mean)})
            </title>
          </circle>
        );
      })}

      {/* axis labels */}
      <text
        x={PAD.left + view.plotW / 2}
        y={height - 8}
        textAnchor="middle"
        fill="var(--text-2)"
        fontSize={12}
        fontFamily="inherit"
      >
        Time
      </text>
      {yAxisLabel && (
        <text
          x={20}
          y={PAD.top + view.plotH / 2}
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize={12}
          fontFamily="inherit"
          transform={`rotate(-90 20 ${PAD.top + view.plotH / 2})`}
        >
          {yAxisLabel}
        </text>
      )}

      {/* legend */}
      <g transform={`translate(${PAD.left + 8} ${PAD.top + 8})`} fontSize={11} fill="var(--text-2)">
        <rect x={0} y={0} width={12} height={3} fill="var(--ch-1)" />
        <text x={18} y={4}>measurement</text>
        <line x1={92} x2={104} y1={2} y2={2} stroke="var(--text-2)" strokeWidth={1.25} strokeDasharray="3 3" />
        <text x={110} y={4}>rolling μ</text>
        <rect x={170} y={-1} width={12} height={6} fill="var(--accent)" opacity={0.5} />
        <text x={188} y={4}>±1σ</text>
        <rect x={224} y={-1} width={12} height={6} fill="var(--sev-warn)" opacity={0.5} />
        <text x={242} y={4}>±2σ</text>
        <rect x={278} y={-1} width={12} height={6} fill="var(--sev-crit)" opacity={0.5} />
        <text x={296} y={4}>±3σ</text>
      </g>
    </svg>
  );
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
