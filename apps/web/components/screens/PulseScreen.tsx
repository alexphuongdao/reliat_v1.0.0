"use client";

/**
 * Pulse — landing surface. Ported 1:1 from frontend/screens/pulse.jsx.
 * Visual output unchanged. window.ReliatData → component props.
 */
import { Button, Icon, KPI, SevGlyph, SevPill } from "../ui";
import { Sparkline } from "../charts";
import { fmtAge, fmtNum, fmtTime } from "../../lib/format";
import type { Channel, Outlier, SeriesPoint } from "../../lib/types";
import { ChannelVitalRow } from "./pulse/ChannelVitalRow";
import { OutlierRow } from "./pulse/OutlierRow";

export interface PulseScreenProps {
  channels: Channel[];
  series: Record<string, SeriesPoint[]>;
  outliers: Outlier[];
  shiftSummary: string;
  onOpenOutlier?: (o: Outlier) => void;
  onOpenChannel?: (c: Channel) => void;
  onAskAgent?: (scope: string | Outlier | Channel) => void;
}

export function PulseScreen({
  channels: CHANNELS,
  series: SERIES,
  outliers: OUTLIERS,
  shiftSummary: SHIFT_SUMMARY,
  onOpenOutlier,
  onOpenChannel,
  onAskAgent,
}: PulseScreenProps) {
  const activeOutliers = OUTLIERS.filter(
    (o) => o.status === "open" || o.status === "acknowledged",
  ).slice(0, 10);

  const liveCount = CHANNELS.filter((c) => c.online).length;
  const withOutliers = new Set(activeOutliers.map((o) => o.channelId)).size;
  const critCount = OUTLIERS.filter((o) => o.sev === "critical" && o.status === "open").length;
  const warnCount = OUTLIERS.filter((o) => o.sev === "warn" && o.status === "open").length;

  return (
    <div style={{ padding: "20px 24px 32px", maxWidth: 1680, margin: "0 auto" }}>

      {/* status header */}
      <div
        className="panel"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          marginBottom: 20,
          background: "linear-gradient(180deg, var(--surface-1) 0%, var(--surface-1) 100%)",
        }}
      >
        <KPI label="Channels live" value={`${liveCount}`} unit={`/ ${CHANNELS.length}`} />
        <div style={{ borderLeft: "1px solid var(--border)" }}>
          <KPI label="With outliers" value={`${withOutliers}`} unit="channels" />
        </div>
        <div style={{ borderLeft: "1px solid var(--border)" }}>
          <KPI label="Critical open" value={`${critCount}`} delta={critCount > 0 ? "attention" : null} />
        </div>
        <div style={{ borderLeft: "1px solid var(--border)" }}>
          <KPI label="Warnings open" value={`${warnCount}`} />
        </div>
        <div style={{ borderLeft: "1px solid var(--border)" }}>
          <KPI label="Last ingest" value="00:11" unit="ago" />
        </div>
        <div
          style={{
            borderLeft: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 14px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5, color: "var(--text-3)",
                textTransform: "uppercase", letterSpacing: "0.08em",
                fontWeight: 600, marginBottom: 4,
              }}
            >
              Shift
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>A · 4h 12m</div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right" }}>
            ends
            <br />
            <span className="mono" style={{ color: "var(--text-2)", fontSize: 12 }}>14:00</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>

        {/* LEFT — Outliers right now */}
        <section className="panel" style={{ minHeight: 480, overflow: "hidden" }}>
          <header
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, letterSpacing: "0.01em" }}>
                Outliers right now
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {activeOutliers.length} active · ranked by severity, then deviation
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="sm" variant="ghost" leftIcon="filter">Filter</Button>
              <Button
                size="sm" variant="ghost" rightIcon="arrowright"
                onClick={() => onAskAgent && onAskAgent("outliers")}
              >
                All outliers
              </Button>
            </div>
          </header>

          <div>
            {activeOutliers.map((o, i) => (
              <OutlierRow
                key={o.id}
                o={o}
                channels={CHANNELS}
                series={SERIES}
                onOpen={() => onOpenOutlier && onOpenOutlier(o)}
                onAsk={() => onAskAgent && onAskAgent(o)}
                last={i === activeOutliers.length - 1}
              />
            ))}
          </div>
        </section>

        {/* RIGHT — Channel vitals */}
        <section className="panel" style={{ minHeight: 480, overflow: "hidden" }}>
          <header
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderBottom: "1px solid var(--border)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Channel vitals</h2>
            <span className="muted" style={{ fontSize: 11.5 }}>24h</span>
          </header>
          <div>
            {CHANNELS.map((c, i) => (
              <ChannelVitalRow
                key={c.id}
                c={c}
                series={SERIES[c.id] || []}
                outliers={OUTLIERS.filter((o) => o.channelId === c.id)}
                onOpen={() => onOpenChannel && onOpenChannel(c)}
                last={i === CHANNELS.length - 1}
              />
            ))}
          </div>
        </section>
      </div>

      {/* shift summary — agent-generated */}
      <section className="panel" style={{ marginTop: 20, padding: "14px 16px" }}>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkle" size={14} />
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Shift summary</h2>
            <span className="muted" style={{ fontSize: 11.5 }}>generated 6m ago · agent</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="sm" variant="ghost" leftIcon="spark">Regenerate</Button>
            <Button
              size="sm" variant="ghost" leftIcon="message"
              onClick={() => onAskAgent && onAskAgent("shift")}
            >
              Open in agent
            </Button>
          </div>
        </div>
        <p
          style={{
            margin: 0, fontSize: 13.5, lineHeight: 1.65,
            color: "var(--text-2)", maxWidth: "88ch",
            textWrap: "pretty",
          }}
        >
          {SHIFT_SUMMARY}
        </p>
      </section>
    </div>
  );
}
