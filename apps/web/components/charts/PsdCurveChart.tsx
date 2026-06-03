"use client";

/**
 * PsdCurveChart — Particle Size Distribution sieve curve. Reads like a
 * mineral-processing PSD plot: log-x aperture (inches), linear-y %
 * passing, explicit axis lines + tick marks + gridlines, F50 / F80
 * percentile markers. Hover a point to see the exact aperture and
 * passing percent.
 */
import { useMemo } from "react";
import type { PsdCurve } from "../../lib/api";

export interface PsdCurveChartProps {
  data: PsdCurve;
  width?: number;
  height?: number;
}

const PAD = { top: 18, right: 24, bottom: 56, left: 72 };

export function PsdCurveChart({ data, width = 560, height = 360 }: PsdCurveChartProps) {
  const points = data.sieve_curve.filter((p) => p.size_in > 0);

  const view = useMemo(() => {
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    if (points.length === 0) return null;

    const xs = points.map((p) => p.size_in);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const logMin = Math.log10(minX);
    const logMax = Math.log10(maxX);
    const span = Math.max(logMax - logMin, 0.01);

    const xScale = (size: number) =>
      PAD.left + ((Math.log10(size) - logMin) / span) * plotW;
    const yScale = (pct: number) => PAD.top + (1 - pct / 100) * plotH;

    const linePath = points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xScale(p.size_in).toFixed(2)},${yScale(p.passing_pct).toFixed(2)}`,
      )
      .join(" ");

    // Major decade ticks plus 2,3,5 inside each decade for richer reading.
    const decadeBase = [1, 2, 3, 5];
    const decades = [-3, -2, -1, 0, 1];
    const major: Array<{ v: number; major: boolean }> = [];
    for (const d of decades) {
      for (const b of decadeBase) {
        const v = b * Math.pow(10, d);
        if (v >= minX * 0.85 && v <= maxX * 1.15) {
          major.push({ v, major: b === 1 });
        }
      }
    }
    return { plotW, plotH, xScale, yScale, linePath, xTicks: major };
  }, [points, width, height]);

  if (!view) {
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--text-3)" fontSize={13}>
          no sieve data
        </text>
      </svg>
    );
  }

  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const F50 = data.percentiles["F50"];
  const F80 = data.percentiles["F80"];

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible", fontFamily: "var(--font-mono)" }}
    >
      {/* gridlines */}
      {yTicks.map((v, i) => (
        <line
          key={`gy${i}`}
          x1={PAD.left}
          x2={PAD.left + view.plotW}
          y1={view.yScale(v)}
          y2={view.yScale(v)}
          stroke="var(--border)"
          strokeWidth={1}
          opacity={v % 25 === 0 ? 0.45 : 0.2}
        />
      ))}
      {view.xTicks.map((tk, i) => (
        <line
          key={`gx${i}`}
          x1={view.xScale(tk.v)}
          x2={view.xScale(tk.v)}
          y1={PAD.top}
          y2={PAD.top + view.plotH}
          stroke="var(--border)"
          strokeWidth={1}
          opacity={tk.major ? 0.4 : 0.15}
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
      {yTicks.map((v) => (
        <g key={`yt${v}`}>
          <line
            x1={PAD.left - 5}
            x2={PAD.left}
            y1={view.yScale(v)}
            y2={view.yScale(v)}
            stroke="var(--text-2)"
            strokeWidth={1}
          />
          {v % 25 === 0 && (
            <text
              x={PAD.left - 8}
              y={view.yScale(v) + 4}
              textAnchor="end"
              fill="var(--text-2)"
              fontSize={11}
            >
              {v}
            </text>
          )}
        </g>
      ))}

      {/* x ticks + labels */}
      {view.xTicks.map((tk, i) => (
        <g key={`xt${i}`}>
          <line
            x1={view.xScale(tk.v)}
            x2={view.xScale(tk.v)}
            y1={PAD.top + view.plotH}
            y2={PAD.top + view.plotH + (tk.major ? 6 : 3)}
            stroke="var(--text-2)"
            strokeWidth={1}
          />
          {tk.major && (
            <text
              x={view.xScale(tk.v)}
              y={PAD.top + view.plotH + 18}
              textAnchor="middle"
              fill="var(--text-2)"
              fontSize={11}
            >
              {fmtSize(tk.v)}
            </text>
          )}
        </g>
      ))}

      {/* F50/F80 vertical lines + labels */}
      {F50 && F50 > 0 && F50 >= points[points.length - 1].size_in && F50 <= points[0].size_in && (
        <g>
          <line
            x1={view.xScale(F50)}
            x2={view.xScale(F50)}
            y1={PAD.top}
            y2={PAD.top + view.plotH}
            stroke="var(--accent)"
            strokeWidth={1.25}
            strokeDasharray="4 4"
            opacity={0.75}
          />
          <text
            x={view.xScale(F50)}
            y={PAD.top - 4}
            textAnchor="middle"
            fill="var(--accent)"
            fontSize={11}
            fontWeight={600}
          >
            F50 · {fmtSize(F50)}″
          </text>
        </g>
      )}
      {F80 && F80 > 0 && F80 >= points[points.length - 1].size_in && F80 <= points[0].size_in && (
        <g>
          <line
            x1={view.xScale(F80)}
            x2={view.xScale(F80)}
            y1={PAD.top}
            y2={PAD.top + view.plotH}
            stroke="var(--ch-3)"
            strokeWidth={1.25}
            strokeDasharray="4 4"
            opacity={0.75}
          />
          <text
            x={view.xScale(F80)}
            y={PAD.top - 4}
            textAnchor="middle"
            fill="var(--ch-3)"
            fontSize={11}
            fontWeight={600}
          >
            F80 · {fmtSize(F80)}″
          </text>
        </g>
      )}

      {/* sieve curve */}
      <path
        d={view.linePath}
        fill="none"
        stroke="var(--ch-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={view.xScale(p.size_in)}
          cy={view.yScale(p.passing_pct)}
          r={2.5}
          fill="var(--ch-1)"
          stroke="var(--surface-1)"
          strokeWidth={0.75}
        >
          <title>
            {p.size_in.toFixed(4)}″ · {p.passing_pct.toFixed(1)}% passing
          </title>
        </circle>
      ))}

      {/* axis labels */}
      <text
        x={PAD.left + view.plotW / 2}
        y={height - 8}
        textAnchor="middle"
        fill="var(--text-2)"
        fontSize={12}
        fontFamily="inherit"
      >
        Sieve aperture (inches, log scale)
      </text>
      <text
        x={18}
        y={PAD.top + view.plotH / 2}
        textAnchor="middle"
        fill="var(--text-2)"
        fontSize={12}
        fontFamily="inherit"
        transform={`rotate(-90 18 ${PAD.top + view.plotH / 2})`}
      >
        Cumulative % passing
      </text>
    </svg>
  );
}

function fmtSize(v: number): string {
  if (v >= 1) return v.toFixed(0);
  if (v >= 0.1) return v.toFixed(1);
  if (v >= 0.01) return v.toFixed(2);
  return v.toFixed(3);
}
