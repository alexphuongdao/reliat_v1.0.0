"use client";

import { useState } from "react";
import { Button, SevGlyph, SevPill } from "../../ui";
import { Sparkline } from "../../charts";
import { fmtAge, fmtNum, fmtTime } from "../../../lib/format";
import type { Channel, Outlier, SeriesPoint } from "../../../lib/types";

export interface OutlierRowProps {
  o: Outlier;
  channels: Channel[];
  series: Record<string, SeriesPoint[]>;
  onOpen: () => void;
  onAsk: () => void;
  last: boolean;
}

export function OutlierRow({ o, channels, series, onOpen, onAsk, last }: OutlierRowProps) {
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{o.channelName}</span>
          <span className="mono muted" style={{ fontSize: 11 }}>{o.id}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>· {o.type}</span>
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
