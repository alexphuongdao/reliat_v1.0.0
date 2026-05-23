"use client";

/**
 * Channels — deep dive. Ported 1:1 from frontend/screens/channels.jsx.
 *
 * Mechanical edits: hooks aliases → real names, window.ReliatData →
 * props, TS prop types. Visual output is unchanged.
 *
 * The chart components live in components/charts.tsx; primitives in
 * components/ui.tsx. PSD snapshots are computed on the client via the
 * `psdAt` callback the parent provides (same contract as the original).
 */
import { useEffect, useState } from "react";
import { Button, Icon, Pill, Segmented, SevGlyph, StatusPill } from "../ui";
import { ColorStrip, DistributionChart, TimeSeries } from "../charts";
import type { DistributionSnapshot, TimeSeriesSeries } from "../charts";
import { fmtAge, fmtTime } from "../../lib/format";
import type {
  Channel,
  Outlier,
  PsdSnapshot,
  SeriesPoint,
} from "../../lib/types";

export interface ChannelsScreenProps {
  channels: Channel[];
  series: Record<string, SeriesPoint[]>;
  outliers: Outlier[];
  psdAt: (channelId: string, idx: number) => PsdSnapshot;
  initialChannelId?: string;
  onOpenOutlier?: (o: Outlier) => void;
  onAskAgent?: (scope: { scope: Channel }) => void;
}

type RangeId = "1h" | "shift" | "24h" | "7d" | "30d";
type PsdMode = "percentile" | "sieve";

const RANGE_WINDOW: Record<RangeId, number> = {
  "1h": 60,
  "shift": 480,
  "24h": 1440,
  "7d": 1440,
  "30d": 1440,
};

export function ChannelsScreen({
  channels: CHANNELS,
  series: SERIES,
  outliers: OUTLIERS,
  psdAt,
  initialChannelId,
  onOpenOutlier,
  onAskAgent,
}: ChannelsScreenProps) {
  const [channelId, setChannelId] = useState(initialChannelId || "cv42");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [metric, setMetric] = useState("Topsize");
  const [range, setRange] = useState<RangeId>("24h");
  const [cursor, setCursor] = useState<number | null>(null);
  const [pinned, setPinned] = useState<Array<{ idx: number; label: string }>>([]);
  const [psdMode, setPsdMode] = useState<PsdMode>("percentile");

  useEffect(() => {
    if (initialChannelId) setChannelId(initialChannelId);
  }, [initialChannelId]);

  const channel = CHANNELS.find((c) => c.id === channelId)!;
  const series = SERIES[channelId] || [];
  const windowSize = RANGE_WINDOW[range];
  const visible = series.slice(-windowSize);

  const primarySeries: TimeSeriesSeries = {
    name: channel.name,
    color: channel.color,
    points: visible,
  };
  const overlays: TimeSeriesSeries[] = compareIds.map((id) => {
    const cc = CHANNELS.find((x) => x.id === id)!;
    return { name: cc.name, color: cc.color, points: (SERIES[id] || []).slice(-windowSize) };
  });
  const allSeries: TimeSeriesSeries[] = [primarySeries, ...overlays];

  const channelOutliers = OUTLIERS.filter((o) => o.channelId === channelId);

  const cursorIdx = cursor != null ? cursor : visible.length - 1;
  const primaryAbsoluteIdx = series.length - (visible.length - cursorIdx);
  const primarySnap: DistributionSnapshot = {
    name: "now",
    color: channel.color,
    primary: true,
    ...psdAt(channelId, primaryAbsoluteIdx),
  };
  const pinSnaps: DistributionSnapshot[] = pinned.map((p, i) => ({
    name: p.label,
    color: `var(--ch-${(i % 8) + 1})`,
    ...psdAt(channelId, p.idx),
  }));

  return (
    <div style={{ padding: "20px 24px 32px", maxWidth: 1680, margin: "0 auto" }}>

      {/* Channel header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: channel.color }} />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {channel.name}
          </h1>
          <ChannelSwitcher channels={CHANNELS} current={channelId} onSelect={setChannelId} />
          <Pill mono size="sm">{channel.belt}</Pill>
          {channel.online
            ? <Pill color="var(--ch-4)" bg="rgba(118,217,182,0.10)" border="rgba(118,217,182,0.16)" size="sm">● online</Pill>
            : <Pill color="var(--text-3)" size="sm">offline</Pill>}
        </div>
        <div style={{ flex: 1 }} />
        <CompareControl
          channels={CHANNELS.filter((c) => c.id !== channelId)}
          value={compareIds}
          onChange={setCompareIds}
        />
        <TimeRangePicker value={range} onChange={setRange} />
        <Button
          size="md" variant="ghost" leftIcon="message"
          onClick={() => onAskAgent && onAskAgent({ scope: channel })}
        >
          Ask about this channel
        </Button>
      </div>

      {/* — 1 — Primary time series */}
      <section className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2
              style={{
                margin: 0, fontSize: 12.5, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--text-3)",
              }}
            >
              Time series
            </h2>
            <MetricChooser value={metric} onChange={setMetric} />
            <span className="muted" style={{ fontSize: 11.5 }}>
              · {range} window · {visible.length.toLocaleString()} pts · outliers persist at all zoom
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {allSeries.map((s) => (
              <span
                key={s.name}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 11.5, color: "var(--text-2)",
                }}
              >
                <span style={{ width: 10, height: 2, background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        </header>
        <div style={{ padding: "8px 10px 4px" }}>
          <TimeSeries
            series={allSeries}
            width={1180}
            height={300}
            cursor={cursor}
            onHover={setCursor}
            onMarkerClick={(m) => {
              const o = channelOutliers.find(
                (x) => x.indexInSeries === m.i + (series.length - visible.length),
              );
              if (o && onOpenOutlier) onOpenOutlier(o);
            }}
            yLabel={metric}
          />
        </div>
      </section>

      {/* — 2 + 3 — Distribution and Color Strip — side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* PSD */}
        <section className="panel" style={{ overflow: "hidden" }}>
          <header
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2
                style={{
                  margin: 0, fontSize: 12.5, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: "var(--text-3)",
                }}
              >
                Particle size · snapshot
              </h2>
              <Segmented<PsdMode>
                options={[
                  { id: "percentile", label: "Percentile" },
                  { id: "sieve", label: "Sieve passing" },
                ]}
                value={psdMode}
                onChange={setPsdMode}
              />
            </div>
            <Button
              size="sm" variant="ghost" leftIcon="pin"
              onClick={() =>
                setPinned([
                  ...pinned,
                  { idx: primaryAbsoluteIdx, label: fmtTime(visible[cursorIdx].t) },
                ])
              }
            >
              Pin snapshot
            </Button>
          </header>
          <div style={{ padding: "10px 12px" }}>
            <DistributionChart
              snapshots={[...pinSnaps, primarySnap]}
              mode={psdMode}
              width={720}
              height={220}
            />
            <div
              style={{
                display: "flex", gap: 8, padding: "8px 6px 0",
                flexWrap: "wrap", fontSize: 11.5,
              }}
            >
              {[...pinSnaps, primarySnap].map((s) => (
                <span
                  key={s.name}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    color: "var(--text-2)",
                  }}
                >
                  <span style={{ width: 10, height: 2, background: s.color }} />
                  <span className="mono">{s.name}</span>
                  {!s.primary && (
                    <button
                      onClick={() =>
                        setPinned(pinned.filter((p) => p.label !== s.name))
                      }
                      style={{ marginLeft: 2, color: "var(--text-4)", display: "inline-flex" }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* SIGNATURE: Color Strip */}
        <section className="panel" style={{ overflow: "hidden" }}>
          <header
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2
                style={{
                  margin: 0, fontSize: 12.5, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: "var(--text-3)",
                }}
              >
                Belt material · color over time
              </h2>
              <span className="muted" style={{ fontSize: 11.5 }}>
                average HSL of frame · 60-second buckets
              </span>
            </div>
            <span className="muted" style={{ fontSize: 11 }}>
              {fmtTime(visible[0].t)} → {fmtTime(visible[visible.length - 1].t)}
            </span>
          </header>
          <div style={{ padding: 12 }}>
            <ColorStrip data={visible} height={56} cursor={cursorIdx} onHover={setCursor} label="" />
            <div style={{ marginTop: 8, position: "relative" }}>
              <svg
                width="100%" height={24}
                viewBox={`0 0 ${visible.length} 24`}
                preserveAspectRatio="none"
                style={{ display: "block" }}
              >
                {visible.map((d, i) => {
                  const m = d.color.match(/hsl\(([\d.\-]+)/);
                  const h = m ? parseFloat(m[1]) : 0;
                  const dev = Math.min(20, Math.abs(h - 24));
                  return (
                    <rect
                      key={i} x={i} y={24 - dev}
                      width={1.05} height={dev}
                      fill={d.color} opacity={0.85}
                    />
                  );
                })}
              </svg>
              <div
                style={{
                  fontSize: 10.5, color: "var(--text-3)",
                  marginTop: 4,
                  display: "flex", justifyContent: "space-between",
                }}
              >
                <span>Hue deviation from baseline</span>
                <span className="mono">
                  {cursorIdx != null && visible[cursorIdx] ? visible[cursorIdx].color : "—"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* — 4 — Outlier history table */}
      <section className="panel" style={{ overflow: "hidden" }}>
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2
              style={{
                margin: 0, fontSize: 12.5, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--text-3)",
              }}
            >
              Outlier history
            </h2>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {channelOutliers.length} events · all-time
            </span>
          </div>
          <Button size="sm" variant="ghost" leftIcon="filter">Filter</Button>
        </header>
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "20px 88px 1fr 1.6fr 70px 80px 90px",
              gap: 12, padding: "8px 14px",
              fontSize: 10.5, color: "var(--text-3)",
              textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span></span>
            <span>Time</span>
            <span>Type</span>
            <span>AI summary</span>
            <span>Severity</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Suggested</span>
          </div>
          {channelOutliers.slice(0, 12).map((o) => (
            <div
              key={o.id}
              onClick={() => onOpenOutlier && onOpenOutlier(o)}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 88px 1fr 1.6fr 70px 80px 90px",
                gap: 12, padding: "10px 14px", alignItems: "center",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer", fontSize: 12.5,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
            >
              <SevGlyph sev={o.sev} size={10} />
              <div style={{ display: "flex", flexDirection: "column", fontSize: 11.5 }}>
                <span className="mono">{fmtTime(o.t)}</span>
                <span className="mono dim" style={{ fontSize: 10.5 }}>{fmtAge(o.t)} ago</span>
              </div>
              <span>{o.type}</span>
              <span
                style={{
                  color: "var(--text-2)",
                  textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
                  fontSize: 12,
                }}
              >
                {o.summary}
              </span>
              <SevPillInline sev={o.sev} />
              <StatusPill status={o.status} />
              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button size="sm" variant="ghost">Open</Button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// SevPill but inlined locally — the original used `SevPill` here directly,
// kept the import light for this screen.
function SevPillInline({ sev }: { sev: string }) {
  const map: Record<string, { c: string; bg: string; label: string }> = {
    critical: { c: "var(--sev-crit)", bg: "var(--sev-crit-dim)", label: "Critical" },
    warn:     { c: "var(--sev-warn)", bg: "var(--sev-warn-dim)", label: "Warning" },
    info:     { c: "var(--sev-info)", bg: "var(--sev-info-dim)", label: "Info" },
  };
  const m = map[sev] || map.info;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        height: 18, padding: "0 8px",
        fontSize: 10.5, fontWeight: 600,
        color: m.c, background: m.bg, border: `1px solid ${m.bg}`,
        borderRadius: "var(--r-pill)", letterSpacing: "0.02em",
      }}
    >
      <SevGlyph sev={sev} size={8} /> {m.label}
    </span>
  );
}

// — Channel switcher
function ChannelSwitcher({
  channels, current, onSelect,
}: {
  channels: Channel[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <Button size="sm" variant="ghost" rightIcon="chevdown" onClick={() => setOpen((v) => !v)}>
        Switch
      </Button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            minWidth: 240, maxHeight: 320, overflow: "auto",
            background: "var(--surface-2)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 4, zIndex: 60,
          }}
        >
          {channels.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                onSelect(c.id);
                setOpen(false);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderRadius: "var(--r-sm)",
                background: c.id === current ? "var(--accent-dim)" : "transparent",
                color: c.id === current ? "var(--accent-bright)" : "var(--text-1)",
                cursor: "pointer", fontSize: 13,
              }}
              onMouseEnter={(e) => {
                if (c.id !== current) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
              }}
              onMouseLeave={(e) => {
                if (c.id !== current) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="mono dim" style={{ fontSize: 11 }}>{c.belt}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// — Compare control
function CompareControl({
  channels, value, onChange,
}: {
  channels: Channel[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <Button size="md" variant="secondary" leftIcon="compare" onClick={() => setOpen((v) => !v)}>
        Compare
        {value.length > 0 && <span style={{ color: "var(--accent-bright)" }}> · {value.length}</span>}
      </Button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            minWidth: 260, maxHeight: 380, overflow: "auto",
            background: "var(--surface-2)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 6, zIndex: 60,
          }}
        >
          <div
            style={{
              fontSize: 10.5, color: "var(--text-3)",
              padding: "4px 8px", textTransform: "uppercase",
              letterSpacing: "0.06em", fontWeight: 600,
            }}
          >
            Overlay up to 2 channels
          </div>
          {channels.map((c) => {
            const on = value.includes(c.id);
            const disabled = !on && value.length >= 2;
            return (
              <div
                key={c.id}
                onClick={() => {
                  if (disabled) return;
                  onChange(on ? value.filter((v) => v !== c.id) : [...value, c.id]);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 8px", borderRadius: "var(--r-sm)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1, fontSize: 12.5,
                  background: on ? "var(--accent-dim)" : "transparent",
                  color: on ? "var(--accent-bright)" : "var(--text-1)",
                }}
              >
                <span
                  style={{
                    width: 14, height: 14, border: "1px solid var(--border-strong)",
                    borderRadius: 3,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: on ? "var(--accent)" : "transparent",
                  }}
                >
                  {on && <Icon name="check" size={10} />}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                <span style={{ flex: 1 }}>{c.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}

// — Time range picker
function TimeRangePicker({
  value, onChange,
}: {
  value: RangeId;
  onChange: (id: RangeId) => void;
}) {
  const opts: Array<{ id: RangeId; label: string }> = [
    { id: "1h", label: "Last hour" },
    { id: "shift", label: "This shift" },
    { id: "24h", label: "Last 24h" },
    { id: "7d", label: "Last 7d" },
    { id: "30d", label: "Last 30d" },
  ];
  const [open, setOpen] = useState(false);
  const current = opts.find((o) => o.id === value)!;
  return (
    <span style={{ position: "relative" }}>
      <Button
        size="md" variant="secondary"
        leftIcon="history" rightIcon="chevdown"
        onClick={() => setOpen((v) => !v)}
      >
        {current.label}
      </Button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            minWidth: 200, background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 4, zIndex: 60,
          }}
        >
          {opts.map((o) => (
            <div
              key={o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px", borderRadius: "var(--r-sm)",
                cursor: "pointer", fontSize: 13,
                background: o.id === value ? "var(--accent-dim)" : "transparent",
                color: o.id === value ? "var(--accent-bright)" : "var(--text-1)",
              }}
              onMouseEnter={(e) => {
                if (o.id !== value) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
              }}
              onMouseLeave={(e) => {
                if (o.id !== value) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {o.label}
            </div>
          ))}
          <div
            style={{
              borderTop: "1px solid var(--border)", marginTop: 4,
              padding: "6px 10px", fontSize: 12, color: "var(--text-3)",
            }}
          >
            Custom range…
          </div>
        </div>
      )}
    </span>
  );
}

// — Metric chooser
function MetricChooser({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups: Array<{ name: string; items: string[] }> = [
    { name: "Percentiles", items: ["F10", "F20", "F30", "F50", "F80", "F90", "Topsize"] },
    { name: "Sieves", items: ["Sieve 4mm", "Sieve 12.5mm", "Sieve 19mm", "Sieve 45mm", "Sieve 100mm"] },
    { name: "Color (HSL)", items: ["Hue avg", "Saturation avg", "Lightness avg"] },
    { name: "Color (RGB)", items: ["R avg", "G avg", "B avg"] },
  ];
  return (
    <span style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", fontSize: 12.5, fontWeight: 600,
          background: "var(--surface-2)", color: "var(--text-1)",
          border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
        }}
      >
        <span className="mono" style={{ color: "var(--accent-bright)" }}>y:</span> {value}
        <Icon name="chevdown" size={12} />
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
            minWidth: 220, background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)",
            padding: 4,
          }}
        >
          {groups.map((g) => (
            <div key={g.name}>
              <div
                style={{
                  fontSize: 10, color: "var(--text-3)",
                  padding: "6px 10px 2px",
                  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
                }}
              >
                {g.name}
              </div>
              {g.items.map((it) => (
                <div
                  key={it}
                  onClick={() => {
                    onChange(it);
                    setOpen(false);
                  }}
                  style={{
                    padding: "4px 12px", fontSize: 12.5,
                    cursor: "pointer", borderRadius: "var(--r-sm)",
                    background: value === it ? "var(--accent-dim)" : "transparent",
                    color: value === it ? "var(--accent-bright)" : "var(--text-1)",
                  }}
                  onMouseEnter={(e) => {
                    if (value !== it) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
                  }}
                  onMouseLeave={(e) => {
                    if (value !== it) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {it}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

