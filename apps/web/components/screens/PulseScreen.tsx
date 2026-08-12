"use client";

/**
 * Pulse — landing surface. Ported 1:1 from frontend/screens/pulse.jsx.
 * Visual output unchanged. window.ReliatData → component props.
 */
import { useState } from "react";
import { Button, Icon, KPI, SevGlyph, SevPill } from "../ui";
import { Sparkline } from "../charts";
import { fmtAge, fmtNum, fmtTime } from "../../lib/format";
import type { Channel, Outlier, SeriesPoint } from "../../lib/types";

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

  // The newest reading this tenant actually holds. This KPI used to read a
  // hardcoded "00:11 ago" on every screen for every tenant, while CEMEX's
  // newest row was 98 days old — the first number on the page, and false.
  const lastIngestAt = Object.values(SERIES).reduce<number | null>((newest, points) => {
    const last = points.length ? points[points.length - 1].t : null;
    if (last == null) return newest;
    const ms = new Date(last).getTime();
    return newest == null || ms > newest ? ms : newest;
  }, null);

  // `shift` is a real column on the channel. How long a shift runs and when it
  // ends is plant configuration we do not have, so the countdown that used to
  // sit here ("4h 12m", "ends 14:00" — identical for every tenant) is gone
  // rather than guessed.
  const shift = CHANNELS.find((c) => c.shift)?.shift ?? null;

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
          <KPI
            label="Last ingest"
            value={lastIngestAt == null ? "—" : fmtAge(lastIngestAt)}
            unit={lastIngestAt == null ? "no readings" : "ago"}
          />
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
            <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{shift ?? "—"}</div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right", maxWidth: 90 }}>
            shift hours
            <br />
            <span style={{ color: "var(--text-3)" }}>not configured</span>
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

interface OutlierRowProps {
  o: Outlier;
  channels: Channel[];
  series: Record<string, SeriesPoint[]>;
  onOpen: () => void;
  onAsk: () => void;
  last: boolean;
}
function OutlierRow({ o, channels, series, onOpen, onAsk, last }: OutlierRowProps) {
  const last60 = (series[o.channelId] || []).slice(-60);
  const channel = channels.find((c) => c.id === o.channelId);
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "22px 1fr 130px 110px 56px 72px 220px",
        alignItems: "center", gap: 14,
        padding: "12px 16px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        background: hover ? "var(--surface-2)" : "transparent",
        transition: "background var(--t-instant)",
        cursor: "pointer",
      }}
    >
      <SevGlyph sev={o.sev} size={10} />
      <div style={{ minWidth: 0 }}>
        {/* Every child here needs to be able to shrink. Without `minWidth: 0`
            on the row and truncation on the two long spans, the id and the
            classification overflowed this grid cell and rendered *on top of*
            the value column below ~1500px — i.e. on a 13" laptop. */}
        <div
          style={{
            display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3,
            minWidth: 0, overflow: "hidden",
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600, flexShrink: 0 }}>{o.channelName}</span>
          <span
            className="mono muted"
            style={{
              fontSize: 11, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {o.id}
          </span>
          <span
            style={{
              fontSize: 11.5, color: "var(--text-3)", flexShrink: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            · {o.type}
          </span>
        </div>
        <div
          style={{
            fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45,
            textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
          }}
        >
          {o.summary}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
          {fmtNum(o.value, 2)}{" "}
          <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{o.unit}</span>
        </span>
        <span className="mono muted" style={{ fontSize: 11 }}>
          {o.deviation > 0 ? "+" : ""}{fmtNum(o.deviation, 1)}σ
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
        {fmtTime(o.t)} <span className="dim" style={{ fontSize: 10.5 }}>· {fmtAge(o.t)}</span>
      </div>
      <Sparkline data={last60} color={channel?.color || "var(--ch-1)"} width={56} height={22} />
      <SevPill sev={o.sev} size="sm" />
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <Button
          size="sm" variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onAsk();
          }}
        >
          Ask
        </Button>
        <Button size="sm" variant="ghost">Ack</Button>
        <Button
          size="sm" variant="secondary" rightIcon="arrowright"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Open
        </Button>
      </div>
    </div>
  );
}

interface ChannelVitalRowProps {
  c: Channel;
  series: SeriesPoint[];
  outliers: Outlier[];
  onOpen: () => void;
  last: boolean;
}
function ChannelVitalRow({ c, series, outliers, onOpen, last }: ChannelVitalRowProps) {
  const [hover, setHover] = useState(false);
  const current = series.length > 0 ? series[series.length - 1].v : 0;
  const oCounts = {
    critical: outliers.filter((o) => o.sev === "critical" && o.status === "open").length,
    warn: outliers.filter((o) => o.sev === "warn" && o.status === "open").length,
    info: outliers.filter((o) => o.sev === "info" && o.status === "open").length,
  };
  const status: "ok" | "critical" | "warn" | "offline" = !c.online
    ? "offline"
    : oCounts.critical
      ? "critical"
      : oCounts.warn
        ? "warn"
        : "ok";
  const dotColor =
    status === "ok"
      ? "var(--ch-4)"
      : status === "critical"
        ? "var(--sev-crit)"
        : status === "warn"
          ? "var(--sev-warn)"
          : "var(--text-4)";
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "8px 1fr 60px 60px",
        gap: 12, alignItems: "center",
        padding: "10px 16px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        background: hover ? "var(--surface-2)" : "transparent",
        cursor: "pointer",
        transition: "background var(--t-instant)",
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: 2,
          background: dotColor,
          opacity: status === "offline" ? 0.5 : 1,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5, fontWeight: 500,
            color: c.online ? "var(--text-1)" : "var(--text-3)",
            textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
          }}
        >
          {c.name}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-4)", display: "flex", gap: 8 }}>
          <span>{c.belt}</span>
          {!c.online && <span style={{ color: "var(--text-3)" }}>offline · service</span>}
          {c.online && oCounts.critical > 0 && (
            <span style={{ color: "var(--sev-crit)" }}>{oCounts.critical} crit</span>
          )}
          {c.online && oCounts.warn > 0 && (
            <span style={{ color: "var(--sev-warn)" }}>{oCounts.warn} warn</span>
          )}
        </div>
      </div>
      <Sparkline data={series.slice(-200)} color={c.color} width={60} height={22} />
      <div
        className="mono"
        style={{
          fontSize: 12, fontWeight: 600, textAlign: "right",
          color: c.online ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        {fmtNum(current, 1)}
      </div>
    </div>
  );
}
