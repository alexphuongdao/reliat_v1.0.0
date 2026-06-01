"use client";

import { useState } from "react";
import { Sparkline } from "../../charts";
import { fmtNum } from "../../../lib/format";
import type { Channel, Outlier, SeriesPoint } from "../../../lib/types";

export interface ChannelVitalRowProps {
  c: Channel;
  series: SeriesPoint[];
  outliers: Outlier[];
  onOpen: () => void;
  last: boolean;
}

export function ChannelVitalRow({ c, series, outliers, onOpen, last }: ChannelVitalRowProps) {
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
