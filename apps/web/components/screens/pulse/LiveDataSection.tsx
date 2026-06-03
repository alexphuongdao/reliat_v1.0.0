"use client";

/**
 * LiveDataSection — the analytics surface on Pulse, driven entirely by
 * ingested customer data. Renders only when there's at least one channel
 * with real rows; otherwise shows an empty-state CTA pointing to the
 * Library uploads.
 *
 * Layout (top to bottom):
 *   1. Channel selector + KPI strip (MetricRangeBadge per metric)
 *   2. Two-up panel — SPC chart (left) + PSD sieve curve (right)
 *   3. Excursion list (last N out-of-band events)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Icon } from "../../ui";
import { SpcChart } from "../../charts/SpcChart";
import { PsdCurveChart } from "../../charts/PsdCurveChart";
import { MetricRangeBadge } from "../../charts/MetricRangeBadge";
import {
  api,
  type ChannelSummary,
  type Excursion,
  type PsdCurve,
  type SpcSeries,
  type WindowId,
} from "../../../lib/api";

const KPI_METRICS_DISPLAY: Array<{ id: string; label: string; unit?: string }> = [
  { id: "topsize", label: "Topsize", unit: "in" },
  { id: "f80", label: "F80", unit: "in" },
  { id: "f50", label: "F50", unit: "in" },
  { id: "f10", label: "F10", unit: "in" },
  { id: "avg_lightness", label: "Lightness" },
];

const SPC_METRIC_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "topsize", label: "Topsize" },
  { id: "f80", label: "F80" },
  { id: "f50", label: "F50" },
  { id: "f10", label: "F10" },
  { id: "sd_ratio_10_5", label: "SD Ratio 10/5" },
  { id: "avg_lightness", label: "Lightness" },
];

const WINDOW_OPTIONS: WindowId[] = ["1m", "5m", "10m", "30m", "1h", "1d"];

export function LiveDataSection() {
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>("topsize");
  const [spcWindow, setSpcWindow] = useState<WindowId>("1h");
  const [spc, setSpc] = useState<SpcSeries | null>(null);
  const [psd, setPsd] = useState<PsdCurve | null>(null);
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
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
    void fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (!selectedChannel) return;
    let cancelled = false;
    Promise.all([
      api.analytics.spc(selectedChannel, selectedMetric, spcWindow),
      api.analytics.psd(selectedChannel),
      api.analytics.excursions({ channel: selectedChannel, threshold: 2.0, limit: 12 }),
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

  const channel = useMemo(
    () => channels?.find((c) => c.channel_name === selectedChannel) ?? null,
    [channels, selectedChannel],
  );

  if (channels === null) {
    return (
      <section className="panel" style={{ marginBottom: 20, padding: "12px 16px" }}>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>Loading analytics…</span>
      </section>
    );
  }

  if (channels.length === 0) {
    return (
      <section
        className="panel"
        style={{
          marginBottom: 20, padding: "20px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Icon name="upload" size={14} />
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>No live data yet</h2>
          </div>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: 13, maxWidth: "70ch" }}>
            Upload an analyzer CSV/TSV export from <strong>Library → Uploads</strong> to
            populate the live analytics dashboard. The first batch lights up SPC charts,
            sieve curves, range alerts, and the excursion feed below.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 20 }}>
      {/* header strip: channel switcher + status */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 12,
          padding: "10px 14px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
        }}
      >
        <Icon name="pulse" size={14} />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Live data</span>
        <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>
          {channel?.rows_total.toLocaleString() ?? 0} rows · {channel?.iterations_per_minute ?? 1}/min ·{" "}
          {channel ? new Date(channel.last_seen).toLocaleString() : "—"}
        </span>
        <div style={{ flex: 1 }} />
        <select
          value={selectedChannel ?? ""}
          onChange={(e) => setSelectedChannel(e.target.value)}
          style={selectStyle}
        >
          {channels.map((c) => (
            <option key={c.channel_name} value={c.channel_name}>
              {c.display_name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI badges */}
      {channel && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${KPI_METRICS_DISPLAY.length}, minmax(0, 1fr))`,
            gap: 10,
            marginBottom: 16,
          }}
        >
          {KPI_METRICS_DISPLAY.map((m) => {
            const kpi = channel.metrics[m.id];
            if (!kpi) return null;
            return <MetricRangeBadge key={m.id} label={m.label} kpi={kpi} unit={m.unit} />;
          })}
        </div>
      )}

      {/* SPC + PSD two-up */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        <section className="panel" style={{ padding: "12px 14px" }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>SPC · {selectedMetric}</h3>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                rolling {spcWindow} baseline · ±1σ/2σ/3σ bands
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
            <SpcChart data={spc} width={680} height={240} />
          ) : (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 12 }}>
              loading…
            </div>
          )}
        </section>

        <section className="panel" style={{ padding: "12px 14px" }}>
          <header style={{ marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>PSD sieve curve</h3>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              averaged over {psd?.rows_aggregated ?? 0} rows
            </span>
          </header>
          {psd ? (
            <PsdCurveChart data={psd} width={320} height={240} />
          ) : (
            <div style={{ height: 240, color: "var(--text-3)", fontSize: 12 }}>loading…</div>
          )}
        </section>
      </div>

      {/* Excursion list */}
      <section className="panel" style={{ padding: "10px 14px" }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Recent excursions</h3>
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
          <div style={{ display: "grid", gap: 4 }}>
            {excursions.map((e, i) => (
              <ExcursionRow key={i} ex={e} />
            ))}
          </div>
        )}
      </section>

      {error && (
        <div style={{ marginTop: 12, color: "var(--sev-warn)", fontSize: 12 }}>
          {error}
        </div>
      )}
    </section>
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
        gridTemplateColumns: "80px 110px 1fr 90px 90px",
        gap: 10, alignItems: "center",
        padding: "6px 8px",
        borderRadius: "var(--r-sm)",
        background: "var(--surface-0)",
        fontSize: 12,
      }}
    >
      <span className="mono" style={{ color: "var(--text-3)" }}>{fmtTime(ex.t)}</span>
      <span className="mono" style={{ color: "var(--text-2)" }}>{ex.metric}</span>
      <span style={{ color }}>
        z={ex.z >= 0 ? "+" : ""}{ex.z.toFixed(2)} · {ex.severity}
      </span>
      <span className="mono" style={{ color: "var(--text-2)", textAlign: "right" }}>
        {fmtVal(ex.value)}
      </span>
      <span className="mono" style={{ color: "var(--text-3)", textAlign: "right" }}>
        μ{fmtVal(ex.baseline)}
      </span>
    </div>
  );
}

function fmtVal(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(3);
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
