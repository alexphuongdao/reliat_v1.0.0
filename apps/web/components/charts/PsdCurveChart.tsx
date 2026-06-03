"use client";

/**
 * PsdCurveChart — Particle Size Distribution sieve curve. New chart type
 * for analytics. Plots % passing vs sieve aperture on a log-x axis
 * (the standard PSD convention). F50/F80 percentile callouts double as
 * spec markers.
 */
import { useMemo } from "react";
import type { PsdCurve } from "../../lib/api";

export interface PsdCurveChartProps {
  data: PsdCurve;
  width?: number;
  height?: number;
}

const PAD = { top: 16, right: 16, bottom: 32, left: 44 };

export function PsdCurveChart({ data, width = 460, height = 260 }: PsdCurveChartProps) {
  const points = data.sieve_curve;

  const { plotW, plotH, xScale, yScale, linePath, xTicks } = useMemo(() => {
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;

    if (points.length === 0) {
      return {
        plotW, plotH,
        xScale: (_: number) => 0,
        yScale: (_: number) => 0,
        linePath: "",
        xTicks: [] as { v: number; x: number }[],
      };
    }

    const xs = points.map((p) => p.size_in).filter((v) => v > 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const logMin = Math.log10(minX);
    const logMax = Math.log10(maxX);
    const logSpan = Math.max(logMax - logMin, 0.01);

    const xScale = (sizeIn: number) =>
      PAD.left + ((Math.log10(sizeIn) - logMin) / logSpan) * plotW;
    const yScale = (pct: number) => PAD.top + (1 - pct / 100) * plotH;

    const linePath = points
      .filter((p) => p.size_in > 0)
      .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.size_in).toFixed(2)},${yScale(p.passing_pct).toFixed(2)}`)
      .join(" ");

    // Log-decade tick anchors: 0.01, 0.1, 1, 10 (whichever fall in range).
    const decades = [0.01, 0.1, 1, 10];
    const xTicks = decades
      .filter((v) => v >= minX * 0.5 && v <= maxX * 2)
      .map((v) => ({ v, x: xScale(v) }));

    return { plotW, plotH, xScale, yScale, linePath, xTicks };
  }, [points, width, height]);

  if (points.length === 0) {
    return (
      <svg width={width} height={height}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--text-3)" fontSize={12}>
          no sieve data
        </text>
      </svg>
    );
  }

  const yTicks = [0, 25, 50, 75, 100];
  const F50 = data.percentiles["F50"];
  const F80 = data.percentiles["F80"];

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {/* y grid */}
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
            {v}
          </text>
        </g>
      ))}

      {/* x ticks (log decades) */}
      {xTicks.map((tk, i) => (
        <g key={i}>
          <line
            x1={tk.x} x2={tk.x}
            y1={PAD.top} y2={PAD.top + plotH}
            stroke="var(--border)" strokeWidth={1} opacity={0.3}
          />
          <text
            x={tk.x} y={height - 16}
            textAnchor="middle"
            fill="var(--text-3)" fontSize={10}
            className="mono"
          >
            {tk.v < 1 ? tk.v.toString() : tk.v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* F50 / F80 vertical markers — operationally important percentiles */}
      {F50 && F50 > 0 && (
        <g>
          <line
            x1={xScale(F50)} x2={xScale(F50)}
            y1={PAD.top} y2={PAD.top + plotH}
            stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
          />
          <text x={xScale(F50)} y={PAD.top - 4} fontSize={9.5} fill="var(--accent)" textAnchor="middle">
            F50
          </text>
        </g>
      )}
      {F80 && F80 > 0 && (
        <g>
          <line
            x1={xScale(F80)} x2={xScale(F80)}
            y1={PAD.top} y2={PAD.top + plotH}
            stroke="var(--ch-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
          />
          <text x={xScale(F80)} y={PAD.top - 4} fontSize={9.5} fill="var(--ch-3)" textAnchor="middle">
            F80
          </text>
        </g>
      )}

      {/* sieve curve */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--ch-1)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* sieve dots */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xScale(p.size_in)}
          cy={yScale(p.passing_pct)}
          r={1.8}
          fill="var(--ch-1)"
        >
          <title>{p.size_in.toFixed(3)}″ · {p.passing_pct.toFixed(1)}% passing</title>
        </circle>
      ))}

      {/* axis labels */}
      <text
        x={PAD.left + plotW / 2}
        y={height - 2}
        textAnchor="middle"
        fill="var(--text-3)"
        fontSize={10}
      >
        sieve aperture (inches, log)
      </text>
      <text
        x={PAD.left - 32}
        y={PAD.top + plotH / 2}
        textAnchor="middle"
        fill="var(--text-3)"
        fontSize={10}
        transform={`rotate(-90 ${PAD.left - 32} ${PAD.top + plotH / 2})`}
      >
        % passing
      </text>
    </svg>
  );
}
