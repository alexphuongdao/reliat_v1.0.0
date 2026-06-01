"use client";

import { type CSSProperties } from "react";
import { Button, Icon, SevGlyph, StatusPill } from "../../ui";
import { fmtAge, fmtNum, fmtTime } from "../../../lib/format";
import type { Channel, Outlier } from "../../../lib/types";
import { ConfidenceBar } from "./ConfidenceBar";
import { SectionLabel } from "./SectionLabel";

export interface InboxRowProps {
  o: Outlier;
  channels: Channel[];
  focused: boolean;
  isSelected: boolean;
  expanded: boolean;
  onFocus: () => void;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onOpenChannel: () => void;
  onAsk: () => void;
}

export function OutlierInboxRow({
  o, channels, focused, isSelected, expanded,
  onFocus, onToggleSelect, onToggleExpand, onOpenChannel, onAsk,
}: InboxRowProps) {
  const channel = channels.find((c) => c.id === o.channelId);
  return (
    <div
      onMouseEnter={onFocus}
      onClick={onToggleExpand}
      style={{
        borderBottom: "1px solid var(--border)",
        background: focused
          ? "var(--surface-2)"
          : isSelected
            ? "var(--accent-dim)"
            : "transparent",
        borderLeft: focused
          ? "2px solid var(--accent)"
          : isSelected
            ? "2px solid var(--accent)"
            : "2px solid transparent",
        cursor: "pointer",
        transition: "background var(--t-instant)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px 18px 76px 1fr 130px 80px 1.4fr 76px 88px 76px",
          gap: 12, padding: "10px 20px", alignItems: "center",
        }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          style={{ display: "flex" }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            style={{ accentColor: "var(--accent)", cursor: "pointer" }}
          />
        </span>
        <SevGlyph sev={o.sev} size={10} />
        <span className="mono" style={{ fontSize: 11.5, color: "var(--text-2)" }}>{o.id}</span>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: 2,
              background: channel?.color, flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 13, fontWeight: 500,
              textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
            }}
          >
            {o.channelName}
          </span>
          <span className="mono muted" style={{ fontSize: 11.5 }}>· {o.metric}</span>
        </div>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          {fmtTime(o.t, { withSec: true })}
        </span>
        <span style={{ textAlign: "right" }}>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtNum(o.value, 2)}</span>
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              color: o.deviation > 2 ? "var(--sev-warn)" : "var(--text-3)",
            }}
          >
            {o.deviation > 0 ? "+" : ""}
            {fmtNum(o.deviation, 1)}σ
          </div>
        </span>
        <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{o.type}</span>
        <span>
          <ConfidenceBar value={o.confidence} />
        </span>
        <StatusPill status={o.status} />
        <span
          className="mono"
          style={{ fontSize: 11.5, color: "var(--text-3)", textAlign: "right" }}
        >
          {fmtAge(o.t)}
        </span>
      </div>

      {/* Expanded */}
      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: "0 20px 20px 56px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            background: focused ? "var(--surface-2)" : "transparent",
            borderTop: "1px solid var(--border)",
            paddingTop: 14,
          }}
        >
          <div>
            <SectionLabel icon="sparkle">AI explanation</SectionLabel>
            <p
              style={{
                fontSize: 13, color: "var(--text-2)", lineHeight: 1.6,
                margin: "0 0 14px", textWrap: "pretty" as CSSProperties["textWrap"],
              }}
            >
              {o.summary}
            </p>

            <SectionLabel icon="zap">Predicted downstream effect</SectionLabel>
            <p
              style={{
                fontSize: 13, color: "var(--text-2)", lineHeight: 1.6,
                margin: "0 0 14px", textWrap: "pretty" as CSSProperties["textWrap"],
              }}
            >
              Next 18–24 min: <span style={{ color: "var(--text-1)" }}>+6% draw on CV28 SAG Feed</span>.
              Currently absorbed (CV28 offline). Confirm at next belt restart.
            </p>

            <SectionLabel icon="history">Similar past outliers</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)", fontSize: 11.5,
                  }}
                >
                  <SevGlyph sev={i === 1 ? "critical" : "warn"} size={8} />
                  <span className="mono">OUT-{(2300 - i * 7).toString(36).toUpperCase()}</span>
                  <span className="muted" style={{ marginLeft: "auto" }}>
                    {i * 3}d ago · 0.{91 - i * 4} match
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon="layers">Raw row</SectionLabel>
            <div
              className="mono"
              style={{
                fontSize: 11.5, color: "var(--text-2)",
                background: "var(--surface-inset)", border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)", padding: "10px 12px", marginBottom: 14,
                maxHeight: 140, overflow: "auto",
                lineHeight: 1.7,
              }}
            >
              <div><span className="dim">id</span>            {o.id}</div>
              <div><span className="dim">channel</span>       {o.channelId}</div>
              <div><span className="dim">ts</span>            {new Date(o.t).toISOString()}</div>
              <div><span className="dim">metric</span>        {o.metric}</div>
              <div><span className="dim">value</span>         {o.value.toFixed(4)}</div>
              <div><span className="dim">baseline</span>      {o.baseline.toFixed(4)}</div>
              <div><span className="dim">deviation</span>     {o.deviation.toFixed(3)}σ</div>
              <div><span className="dim">F10</span>           {(o.baseline * 0.22).toFixed(3)}</div>
              <div><span className="dim">F50</span>           {(o.baseline * 0.62).toFixed(3)}</div>
              <div><span className="dim">F80</span>           {o.value.toFixed(3)}</div>
              <div><span className="dim">topsize</span>       {(o.value * 1.85).toFixed(3)}</div>
              <div><span className="dim">color_hue</span>     34.2</div>
              <div><span className="dim">color_sat</span>     28.7</div>
            </div>

            <SectionLabel icon="zap">Actions</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button size="sm" variant="primary" leftIcon="check">Acknowledge</Button>
              <Button size="sm" variant="secondary" leftIcon="circle">Resolve</Button>
              <Button size="sm" variant="secondary" leftIcon="user">Assign</Button>
              <Button size="sm" variant="ghost" leftIcon="message" onClick={onAsk}>Ask agent</Button>
              <Button size="sm" variant="ghost" leftIcon="belt" onClick={onOpenChannel}>Open channel</Button>
            </div>
            <div
              style={{
                marginTop: 12, padding: 10,
                background: "var(--accent-dim)", borderLeft: "2px solid var(--accent)",
                borderRadius: "var(--r-sm)",
                fontSize: 12.5, color: "var(--text-2)",
              }}
            >
              <span style={{ color: "var(--accent-bright)", fontWeight: 600 }}>Agent suggests:</span> {o.action}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
