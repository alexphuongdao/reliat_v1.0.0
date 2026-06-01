"use client";

import { Button, Pill } from "../../ui";
import type { Channel } from "../../../lib/types";
import { SectionHeader } from "./SectionHeader";

export function ChannelsSection({ channels }: { channels: Channel[] }) {
  return (
    <div>
      <SectionHeader
        title="Channels"
        sub={`${channels.length} configured · per-channel alert thresholds and metadata`}
      />
      <div className="panel">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "24px 1fr 100px 120px 100px 90px 60px",
            gap: 12, padding: "8px 14px",
            fontSize: 10.5, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span></span>
          <span>Name</span>
          <span>Belt</span>
          <span className="mono">Crit threshold</span>
          <span className="mono">Warn threshold</span>
          <span>Status</span>
          <span></span>
        </div>
        {channels.map((c, i) => (
          <div
            key={c.id}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr 100px 120px 100px 90px 60px",
              gap: 12, padding: "10px 14px", alignItems: "center",
              borderBottom: i === channels.length - 1 ? "none" : "1px solid var(--border)",
              fontSize: 12.5,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
            <div>
              <div style={{ fontSize: 13 }}>{c.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>
                {c.id} · F80 base {c.baseF80.toFixed(1)}mm
              </div>
            </div>
            <span className="mono muted">{c.belt}</span>
            <span className="mono">{(c.baseF80 * 1.18).toFixed(1)}mm</span>
            <span className="mono">{(c.baseF80 * 1.10).toFixed(1)}mm</span>
            <span>
              {c.online ? (
                <Pill size="sm" color="var(--ch-4)" bg="rgba(118,217,182,0.10)" border="rgba(118,217,182,0.18)">● online</Pill>
              ) : (
                <Pill size="sm" color="var(--text-3)">offline</Pill>
              )}
            </span>
            <Button size="sm" variant="ghost">Edit</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
