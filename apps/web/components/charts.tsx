"use client";

/**
 * Charts — ported verbatim from frontend/charts.jsx.
 * Sparkline, ColorStrip, TimeSeries, DistributionChart.
 * Visual parity is the only goal. Mechanical edits:
 *   - hooks aliases (uState/uEffect/uRef) → real names
 *   - TS prop types
 *   - SVG markup unchanged
 *
 * SevGlyph already lives in components/ui.tsx (re-exported here for
 * convenience so charts users can pull it from the chart module too).
 */
import { useMemo, useRef } from "react";
import type { SeriesPoint, PsdPercentile, PsdSieve } from "../lib/types";

export { SevGlyph } from "./ui";

// ────────────────────────────────────────────────────────────────────
// Sparkline — line + persistent outlier dots in severity color.
// ────────────────────────────────────────────────────────────────────
export interface SparklineProps {
  data: SeriesPoint[];
  color?: string;
  width?: number;
  height?: number;
  showMarkers?: boolean;
  strokeWidth?: number;
}
export function Sparkline({
  data, color = "var(--ch-1)", width = 120, height = 28,
  showMarkers = true, strokeWidth = 1.25,
}: SparklineProps) {
  if (!data || data.length === 0) return <svg width={width} height={height} />;
  const vs = data.map((d) => d.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const pad = (max - min) * 0.1 || 1;
  const lo = min - pad,
    hi = max + pad;
  const W = width,
    H = height;
  const path = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((d.v - lo) / (hi - lo)) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const markers = showMarkers
    ? data
        .map((d, i) => {
          if (!d.outlier) return null;
          const x = (i / (data.length - 1)) * W;
          const y = H - ((d.v - lo) / (hi - lo)) * H;
          const sevColor =
            d.outlier.sev === "critical"
              ? "var(--sev-crit)"
              : d.outlier.sev === "warn"
                ? "var(--sev-warn)"
                : "var(--sev-info)";
          return (
            <circle key={i} cx={x} cy={y} r={2.6} fill={sevColor} stroke="var(--surface-1)" strokeWidth={1} />
          );
        })
        .filter(Boolean)
    : null;

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <path
        d={path} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinejoin="round" strokeLinecap="round" opacity={0.9}
      />
      {markers}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────
// ColorStrip — horizontal time-indexed band of belt material color.
// ────────────────────────────────────────────────────────────────────
export interface ColorStripProps {
  data: SeriesPoint[];
  width?: number;
  height?: number;
  cursor?: number | null;
  onHover?: ((idx: number | null, ratio?: number) => void) | null;
  onClick?: ((idx: number) => void) | null;
  label?: string | null;
}
export function ColorStrip({
  data, width = 800, height = 64,
  cursor = null, onHover = null, onClick = null, label = null,
}: ColorStripProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const buckets = useMemo(() => {
    if (!data || data.length === 0) return [] as Array<{ x: number; color: string; dataIdx: number; t: number }>;
    const cols = Math.min(width, data.length);
    const step = data.length / cols;
    const out: Array<{ x: number; color: string; dataIdx: number; t: number }> = [];
    for (let i = 0; i < cols; i++) {
      const idx = Math.min(data.length - 1, Math.floor(i * step));
      out.push({ x: i, color: data[idx].color, dataIdx: idx, t: data[idx].t });
    }
    return out;
  }, [data, width]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!onHover || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.floor(ratio * (data.length - 1));
    onHover(idx, ratio);
  }

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={ref}
        width="100%"
        height={height}
        viewBox={`0 0 ${buckets.length} ${height}`}
        preserveAspectRatio="none"
        style={{
          display: "block", borderRadius: "var(--r-sm)",
          cursor: onHover ? "crosshair" : "default",
        }}
        onMouseMove={handleMove}
        onMouseLeave={() => onHover && onHover(null)}
        onClick={(e) => {
          if (!onClick || !ref.current) return;
          const rect = ref.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, x / rect.width));
          onClick(Math.floor(ratio * (data.length - 1)));
        }}
      >
        {buckets.map((b) => (
          <rect key={b.x} x={b.x} y={0} width={1.05} height={height} fill={b.color} />
        ))}
      </svg>
      {cursor != null && (
        <div
          style={{
            position: "absolute", top: -2, bottom: -2,
            left: `${(cursor / (data.length - 1)) * 100}%`,
            width: 1, background: "var(--text-1)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}
        />
      )}
      {label && (
        <div
          style={{
            position: "absolute", top: 6, left: 8,
            fontSize: "var(--fs-micro)",
            color: "rgba(255,255,255,0.85)",
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// TimeSeries — multi-series, synchronized cursor, persistent markers.
// ────────────────────────────────────────────────────────────────────
export interface TimeSeriesSeries {
  name: string;
  color: string;
  points: SeriesPoint[];
}
export interface TimeSeriesProps {
  series: TimeSeriesSeries[];
  width?: number;
  height?: number;
  cursor?: number | null;
  onHover?: ((idx: number | null) => void) | null;
  onMarkerClick?: ((marker: { p: SeriesPoint; i: number; s: TimeSeriesSeries }) => void) | null;
  yLabel?: string;
}
export function TimeSeries({
  series, width = 900, height = 320,
  cursor = null, onHover = null, onMarkerClick = null, yLabel = "",
}: TimeSeriesProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const pad = { top: 16, right: 16, bottom: 28, left: 48 };
  const W = width;
  const H = height;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const ts = all.map((p) => p.t);
  const vs = all.map((p) => p.v);
  const tMin = Math.min(...ts),
    tMax = Math.max(...ts);
  const vMin = Math.min(...vs),
    vMax = Math.max(...vs);
  const vPad = (vMax - vMin) * 0.12 || 1;
  const yLo = vMin - vPad,
    yHi = vMax + vPad;

  const x = (t: number) => pad.left + ((t - tMin) / (tMax - tMin || 1)) * innerW;
  const y = (v: number) => pad.top + innerH - ((v - yLo) / (yHi - yLo || 1)) * innerH;

  const yTicks: Array<{ v: number; y: number }> = [];
  for (let i = 0; i <= 4; i++) {
    const v = yLo + (yHi - yLo) * (i / 4);
    yTicks.push({ v, y: y(v) });
  }
  const xTicks: Array<{ t: number; x: number }> = [];
  const span = tMax - tMin;
  const stepMs =
    span > 3600000 * 24 ? 3600000 * 4 : span > 3600000 * 6 ? 3600000 : 60000 * 15;
  const start = Math.ceil(tMin / stepMs) * stepMs;
  for (let t = start; t <= tMax; t += stepMs) {
    xTicks.push({ t, x: x(t) });
  }

  function fmtT(ts: number) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!onHover || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (px - pad.left) / innerW));
    const idx = Math.floor(ratio * (series[0].points.length - 1));
    onHover(idx);
  }

  const paths = series.map((s) => ({
    name: s.name,
    color: s.color,
    d: s.points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(" "),
  }));

  const markers = series.flatMap((s) =>
    s.points
      .map((p, i) => ({ p, i, s }))
      .filter((o) => o.p.outlier)
      .map((o) => ({
        key: `${o.s.name}-${o.i}`,
        cx: x(o.p.t),
        cy: y(o.p.v),
        sev: o.p.outlier!.sev,
        raw: o,
      })),
  );

  const sevColor = (sev: string) =>
    sev === "critical" ? "var(--sev-crit)" : sev === "warn" ? "var(--sev-warn)" : "var(--sev-info)";

  return (
    <svg
      ref={ref}
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      onMouseMove={handleMove}
      onMouseLeave={() => onHover && onHover(null)}
      style={{ display: "block", fontFamily: "var(--font-sans)" }}
    >
      {yTicks.map((t, i) => (
        <line
          key={i} x1={pad.left} x2={W - pad.right} y1={t.y} y2={t.y}
          stroke="var(--border)" strokeWidth={1}
        />
      ))}
      {yTicks.map((t, i) => (
        <text
          key={i} x={pad.left - 8} y={t.y + 4}
          textAnchor="end" fontSize="10.5" fill="var(--text-3)"
          fontFamily="var(--font-mono)"
        >
          {t.v.toFixed(1)}
        </text>
      ))}
      {xTicks.map((t, i) => (
        <text
          key={i} x={t.x} y={H - 8}
          textAnchor="middle" fontSize="10.5" fill="var(--text-3)"
          fontFamily="var(--font-mono)"
        >
          {fmtT(t.t)}
        </text>
      ))}
      {yLabel && (
        <text x={pad.left} y={pad.top - 4} fontSize="10.5" fill="var(--text-3)" letterSpacing="0.06em">
          {yLabel}
        </text>
      )}
      {paths.map((p) => (
        <path
          key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth={1.4}
          strokeLinejoin="round" strokeLinecap="round" opacity={0.95}
        />
      ))}
      {markers.map((m) => (
        <g
          key={m.key}
          style={{ cursor: onMarkerClick ? "pointer" : "default" }}
          onClick={() => onMarkerClick && onMarkerClick(m.raw)}
        >
          <circle cx={m.cx} cy={m.cy} r={7} fill={sevColor(m.sev)} opacity={0.16} />
          <circle cx={m.cx} cy={m.cy} r={4} fill={sevColor(m.sev)} stroke="var(--surface-1)" strokeWidth={1.5} />
        </g>
      ))}
      {cursor != null && series[0]?.points[cursor] && (
        <g>
          <line
            x1={x(series[0].points[cursor].t)} x2={x(series[0].points[cursor].t)}
            y1={pad.top} y2={H - pad.bottom}
            stroke="var(--text-2)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
          />
          {series.map((s) => {
            const p = s.points[cursor];
            if (!p) return null;
            return (
              <circle key={s.name} cx={x(p.t)} cy={y(p.v)} r={3} fill={s.color} stroke="var(--surface-0)" strokeWidth={1.5} />
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────
// DistributionChart — percentile curve OR sieve passing curve.
// ────────────────────────────────────────────────────────────────────
export interface DistributionSnapshot {
  name: string;
  color: string;
  primary?: boolean;
  pcts: PsdPercentile[];
  sieves: PsdSieve[];
}
export interface DistributionChartProps {
  snapshots: DistributionSnapshot[];
  mode?: "percentile" | "sieve";
  width?: number;
  height?: number;
}
export function DistributionChart({
  snapshots, mode = "percentile", width = 600, height = 220,
}: DistributionChartProps) {
  const pad = { top: 14, right: 14, bottom: 28, left: 40 };
  const W = width,
    H = height;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  let xs: number[], ys: number[];
  if (mode === "percentile") {
    const all = snapshots.flatMap((s) => s.pcts);
    xs = all.map((p) => p.x);
    ys = all.map((p) => p.y);
  } else {
    const all = snapshots.flatMap((s) => s.sieves);
    xs = all.map((p) => p.size);
    ys = all.map((p) => p.passing);
  }
  const xMin = Math.min(...xs),
    xMax = Math.max(...xs);
  const yMin = mode === "sieve" ? 0 : Math.min(...ys);
  const yMax = mode === "sieve" ? 100 : Math.max(...ys);
  const xR = xMax - xMin || 1;
  const yR = yMax - yMin || 1;

  const x = (v: number) => pad.left + ((v - xMin) / xR) * innerW;
  const y = (v: number) => pad.top + innerH - ((v - yMin) / yR) * innerH;

  function pathFor(snap: DistributionSnapshot) {
    const arr = mode === "percentile" ? snap.pcts : snap.sieves;
    return arr
      .map((p, i) => {
        const px = mode === "percentile" ? (p as PsdPercentile).x : (p as PsdSieve).size;
        const py = mode === "percentile" ? (p as PsdPercentile).y : (p as PsdSieve).passing;
        return `${i === 0 ? "M" : "L"}${x(px).toFixed(1)},${y(py).toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <svg
      width="100%" height={H}
      viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i} x1={pad.left} x2={W - pad.right}
          y1={pad.top + (innerH * i) / 4}
          y2={pad.top + (innerH * i) / 4}
          stroke="var(--border)"
        />
      ))}
      {[0, 1, 2, 3, 4].map((i) => {
        const v = yMin + (yR * (4 - i)) / 4;
        return (
          <text
            key={i} x={pad.left - 6}
            y={pad.top + (innerH * i) / 4 + 4}
            textAnchor="end" fontSize="10" fill="var(--text-3)"
            fontFamily="var(--font-mono)"
          >
            {mode === "sieve" ? v.toFixed(0) + "%" : v.toFixed(0)}
          </text>
        );
      })}
      {(mode === "percentile" ? [10, 30, 50, 70, 90] : [1, 6.3, 19, 45, 100]).map((v) => (
        <g key={v}>
          <text
            x={x(v)} y={H - 10}
            textAnchor="middle" fontSize="10" fill="var(--text-3)"
            fontFamily="var(--font-mono)"
          >
            {mode === "percentile" ? "F" + v : v + "mm"}
          </text>
        </g>
      ))}
      {snapshots.map((s) => (
        <g key={s.name}>
          <path
            d={pathFor(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.primary ? 1.8 : 1.2}
            strokeDasharray={s.primary ? undefined : "4 3"}
            opacity={s.primary ? 1 : 0.7}
          />
          {(mode === "percentile" ? s.pcts : s.sieves).map((p, j) => {
            const px = mode === "percentile" ? (p as PsdPercentile).x : (p as PsdSieve).size;
            const py = mode === "percentile" ? (p as PsdPercentile).y : (p as PsdSieve).passing;
            return s.primary ? (
              <circle key={j} cx={x(px)} cy={y(py)} r={2} fill={s.color} />
            ) : null;
          })}
        </g>
      ))}
    </svg>
  );
}

// Re-export for ergonomics — the original module exposed this too.
export type { SeriesPoint } from "../lib/types";
