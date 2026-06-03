"use client";

/**
 * AnalyticsDashboard — the Channels surface, rebuilt as a real-time
 * data-science dashboard over ingested PsdRow data. Replaces the mock
 * ChannelsScreen on apps/web/app/(app)/channels/page.tsx.
 *
 * Layout:
 *   ┌── header ────────────────────────────────────────┐
 *   │ channel · last-seen · ingest cadence · row count │
 *   ├── KPI strip ──────────────────────────────────────┤
 *   │ Topsize · F80 · F50 · F10 · Lightness (badges)   │
 *   ├── primary SPC panel ──────────┬── PSD panel ─────┤
 *   │ metric+window pickers          │ sieve curve     │
 *   │ line + ±1/2/3σ bands           │ percentile bars │
 *   ├── small multiples ────────────┴──────────────────┤
 *   │ F90 / F80 / F70 / Topsize / Lightness mini SPCs   │
 *   ├── excursions ────────────────────────────────────┤
 *   │ table — time, metric, z, value vs baseline       │
 *   └──────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Icon } from "../../ui";
import { SpcChart } from "../../charts/SpcChart";
import { PsdCurveChart } from "../../charts/PsdCurveChart";
import { MetricRangeBadge } from "../../charts/MetricRangeBadge";
import { MultiMetricGrid } from "../../charts/MultiMetricGrid";
import {
  api,
  type ChannelSummary,
  type Excursion,
  type PsdCurve,
  type SeriesWithBands,
  type SpcSeries,
  type WindowId,
} from "../../../lib/api";

const KPI_METRICS: Array<{ id: string; label: string; unit?: string }> = [
  { id: "topsize", label: "Topsize", unit: "in" },
  { id: "f80", label: "F80", unit: "in" },
  { id: "f50", label: "F50", unit: "in" },
  { id: "f10", label: "F10", unit: "in" },
  { id: "avg_lightness", label: "Lightness" },
];

const SPC_METRIC_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "topsize", label: "Topsize" },
  { id: "f90", label: "F90" },
  { id: "f80", label: "F80" },
  { id: "f70", label: "F70" },
  { id: "f60", label: "F60" },
  { id: "f50", label: "F50" },
  { id: "f40", label: "F40" },
  { id: "f30", label: "F30" },
  { id: "f20", label: "F20" },
  { id: "f10", label: "F10" },
  { id: "sd_ratio_10_5", label: "SD Ratio 10/5" },
  { id: "avg_hue", label: "Hue" },
  { id: "avg_saturation", label: "Saturation" },
  { id: "avg_lightness", label: "Lightness" },
];

const WINDOW_OPTIONS: WindowId[] = ["1m", "5m", "10m", "30m", "1h", "1d"];

// Metrics shown in the small-multiples grid below the primary SPC panel.
const GRID_METRICS: Array<{ id: string; label: string }> = [
  { id: "topsize", label: "Topsize" },
  { id: "f90", label: "F90" },
  { id: "f80", label: "F80" },
  { id: "f50", label: "F50" },
  { id: "f10", label: "F10" },
  { id: "sd_ratio_10_5", label: "SD Ratio" },
  { id: "avg_hue", label: "Hue" },
  { id: "avg_lightness", label: "Lightness" },
];

export function AnalyticsDashboard() {
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>("topsize");
  const [spcWindow, setSpcWindow] = useState<WindowId>("1h");
  const [spc, setSpc] = useState<SpcSeries | null>(null);
  const [psd, setPsd] = useState<PsdCurve | null>(null);
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [gridSeries, setGridSeries] = useState<Record<string, SeriesWithBands | null>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.analytics.channels();
      setChannels(list);
      if (list.length > 0 && selectedChannel == null) {
        setSelectedChannel(list[0].channel_name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
      setChannels([]);
    }
  }, [selectedChannel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Primary panels reload when channel/metric/window change.
  useEffect(() => {
    if (!selectedChannel) return;
    let cancelled = false;
    Promise.all([
      api.analytics.spc(selectedChannel, selectedMetric, spcWindow),
      api.analytics.psd(selectedChannel),
      api.analytics.excursions({ channel: selectedChannel, threshold: 2.0, limit: 25 }),
    ])
      .then(([s, p, ex]) => {
        if (cancelled) return;
        setSpc(s);
        setPsd(p);
        setExcursions(ex);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedChannel, selectedMetric, spcWindow]);

  // Small-multiples reload only when channel changes (8 fetches in parallel).
  useEffect(() => {
    if (!selectedChannel) return;
    let cancelled = false;
    Promise.all(
      GRID_METRICS.map((m) =>
        api.analytics.series(selectedChannel, m.id, "10m").then((d) => [m.id, d] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, SeriesWithBands | null> = {};
      for (const [id, data] of pairs) next[id] = data;
      setGridSeries(next);
    }).catch(() => {
      /* individual metric failures already surfaced via primary panel errors */
    });
    return () => {
      cancelled = true;
    };
  }, [selectedChannel]);

  const channel = useMemo(
    () => channels?.find((c) => c.channel_name === selectedChannel) ?? null,
    [channels, selectedChannel],
  );

  const gridTiles = useMemo(
    () =>
      GRID_METRICS.map((m) => ({
        id: m.id,
        label: m.label,
        data: gridSeries[m.id] ?? null,
      })),
    [gridSeries],
  );

  // Empty state — no data has been ingested at all.
  if (channels !== null && channels.length === 0) {
    return <EmptyState />;
  }

  if (channels === null || !channel) {
    return (
      <div style={{ padding: "20px 24px", color: "var(--text-3)", fontSize: 12 }}>
        Loading analytics…
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px 32px", maxWidth: 1680, margin: "0 auto" }}>
      {/* HEADER */}
      <div
        className="panel"
        style={{
          padding: "12px 16px", marginBottom: 14,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10, height: 10, borderRadius: 5,
              background: channel.online ? "var(--ch-4)" : "var(--text-3)",
            }}
          />
          <select
            value={selectedChannel ?? ""}
            onChange={(e) => setSelectedChannel(e.target.value)}
            style={{ ...selectStyle, fontSize: 14, fontWeight: 600, padding: "4px 8px" }}
          >
            {channels.map((c) => (
              <option key={c.channel_name} value={c.channel_name}>
                {c.display_name}
              </option>
            ))}
          </select>
          <span
            className="mono"
            style={{ fontSize: 11.5, color: "var(--text-3)" }}
          >
            {channel.rows_total.toLocaleString()} rows ·{" "}
            {channel.iterations_per_minute}/min ·{" "}
            last {new Date(channel.last_seen).toLocaleString()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button size="sm" variant="ghost" leftIcon="history">{spcWindow} baseline</Button>
          <Button size="sm" variant="ghost" leftIcon="upload" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${KPI_METRICS.length}, minmax(0, 1fr))`,
          gap: 10,
          marginBottom: 14,
        }}
      >
        {KPI_METRICS.map((m) => {
          const kpi = channel.metrics[m.id];
          if (!kpi) return null;
          return <MetricRangeBadge key={m.id} label={m.label} kpi={kpi} unit={m.unit} />;
        })}
      </div>

      {/* PRIMARY: SPC + PSD two-up */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
        <section className="panel" style={{ padding: "12px 14px" }}>
          <header
            style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>
                SPC · {labelFor(selectedMetric)}
              </h3>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                rolling {spcWindow} baseline · ±1σ/2σ/3σ control bands
              </span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                style={selectStyle}
              >
                {SPC_METRIC_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <select
                value={spcWindow}
                onChange={(e) => setSpcWindow(e.target.value as WindowId)}
                style={selectStyle}
              >
                {WINDOW_OPTIONS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </header>
          {spc ? (
            <SpcChart data={spc} width={840} height={320} yLabel={labelFor(selectedMetric)} />
          ) : (
            <div style={chartPlaceholder(320)}>loading…</div>
          )}
        </section>

        <section className="panel" style={{ padding: "12px 14px" }}>
          <header style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>
              PSD sieve curve
            </h3>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              averaged over {psd?.rows_aggregated ?? 0} rows
            </span>
          </header>
          {psd ? (
            <PsdCurveChart data={psd} width={360} height={260} />
          ) : (
            <div style={chartPlaceholder(260)}>loading…</div>
          )}
          {psd && Object.keys(psd.percentiles).length > 0 && (
            <PercentileBars percentiles={psd.percentiles} />
          )}
        </section>
      </div>

      {/* SMALL MULTIPLES */}
      <section className="panel" style={{ padding: "12px 14px", marginBottom: 14 }}>
        <header style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>
              Cross-metric trend grid
            </h3>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              10-min rolling baseline · click a tile to load it into SPC above
            </span>
          </div>
        </header>
        <MultiMetricGrid series={gridTiles} onPickMetric={setSelectedMetric} />
      </section>

      {/* EXCURSIONS TABLE */}
      <section className="panel" style={{ padding: "10px 14px" }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>
              Recent excursions
            </h3>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              ≥ 2σ from rolling baseline
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{excursions.length} events</span>
        </header>
        {excursions.length === 0 ? (
          <div style={{ color: "var(--text-3)", fontSize: 12, padding: "6px 0" }}>
            No excursions in this window.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 3 }}>
            {excursions.map((e, i) => <ExcursionRow key={i} ex={e} />)}
          </div>
        )}
      </section>

      {error && (
        <div style={{ marginTop: 12, color: "var(--sev-warn)", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: "60px 24px", display: "flex", justifyContent: "center" }}>
      <div
        className="panel"
        style={{
          padding: "32px 36px",
          maxWidth: 520,
          textAlign: "center",
        }}
      >
        <Icon name="upload" size={28} />
        <h2 style={{ margin: "12px 0 6px", fontSize: 16, fontWeight: 600 }}>
          No live data yet
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.55 }}>
          The Channels surface is a real-time data-science dashboard over your
          analyzer CSV exports. Upload your first batch from{" "}
          <strong>Library → Uploads</strong> and this view lights up with KPIs,
          SPC charts, sieve curves, a multi-metric trend grid, and an
          excursion feed.
        </p>
      </div>
    </div>
  );
}

function PercentileBars({ percentiles }: { percentiles: Record<string, number> }) {
  const order = ["F10", "F20", "F30", "F40", "F50", "F60", "F70", "F80", "F90"];
  const values = order.map((k) => percentiles[k] ?? 0);
  const maxV = Math.max(...values, 0.01);
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        Percentiles
      </div>
      <div style={{ display: "grid", gap: 3 }}>
        {order.map((k, i) => {
          const v = values[i];
          const w = (v / maxV) * 100;
          return (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "32px 1fr 56px", gap: 8, alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{k}</span>
              <div
                style={{
                  height: 6,
                  background: "var(--surface-0)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${w}%`,
                    height: "100%",
                    background: k === "F50" ? "var(--accent)" : k === "F80" ? "var(--ch-3)" : "var(--ch-1)",
                    opacity: 0.8,
                  }}
                />
              </div>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-2)", textAlign: "right" }}>
                {v < 1 ? v.toFixed(3) : v.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExcursionRow({ ex }: { ex: Excursion }) {
  const color =
    ex.severity === "critical" ? "var(--sev-crit)" :
    ex.severity === "warn" ? "var(--sev-warn)" :
    ex.severity === "info" ? "var(--sev-info)" :
    "var(--text-3)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 130px 1fr 110px 110px 80px",
        gap: 10, alignItems: "center",
        padding: "6px 8px",
        borderRadius: "var(--r-sm)",
        background: "var(--surface-0)",
        fontSize: 12,
      }}
    >
      <span className="mono" style={{ color: "var(--text-3)" }}>
        {new Date(ex.t).toLocaleString()}
      </span>
      <span className="mono" style={{ color: "var(--text-2)" }}>{ex.metric}</span>
      <span style={{ color }}>
        z={ex.z >= 0 ? "+" : ""}{ex.z.toFixed(2)} · {ex.severity}
      </span>
      <span className="mono" style={{ color: "var(--text-2)", textAlign: "right" }}>
        {fmtVal(ex.value)}
      </span>
      <span className="mono" style={{ color: "var(--text-3)", textAlign: "right" }}>
        μ {fmtVal(ex.baseline)}
      </span>
      <span className="mono" style={{ color: "var(--text-3)", textAlign: "right" }}>
        σ {fmtVal(ex.std)}
      </span>
    </div>
  );
}

function fmtVal(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(3);
}

function labelFor(id: string): string {
  return SPC_METRIC_OPTIONS.find((m) => m.id === id)?.label ?? id;
}

const selectStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontFamily: "var(--font-mono)",
  background: "var(--surface-0)",
  color: "var(--text-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  padding: "4px 8px",
  cursor: "pointer",
};

function chartPlaceholder(h: number): React.CSSProperties {
  return {
    height: h,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-3)",
    fontSize: 12,
  };
}
