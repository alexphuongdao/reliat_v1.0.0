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
import { ChannelSwitcher } from "./channels/ChannelSwitcher";
import { CompareControl } from "./channels/CompareControl";
import { MetricChooser } from "./channels/MetricChooser";
import { SevPillInline } from "./channels/SevPillInline";
import { TimeRangePicker } from "./channels/TimeRangePicker";
import type { RangeId } from "./channels/types";

export interface ChannelsScreenProps {
  channels: Channel[];
  series: Record<string, SeriesPoint[]>;
  outliers: Outlier[];
  psdAt: (channelId: string, idx: number) => PsdSnapshot;
  initialChannelId?: string;
  onOpenOutlier?: (o: Outlier) => void;
  onAskAgent?: (scope: { scope: Channel }) => void;
}

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

