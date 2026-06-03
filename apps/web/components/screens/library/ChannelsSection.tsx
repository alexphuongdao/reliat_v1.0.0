"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Pill } from "../../ui";
import { SectionHeader } from "./SectionHeader";
import {
  api,
  type ChannelConfigOut,
} from "../../../lib/api";
import type { Channel } from "../../../lib/types";

/**
 * Channels section — drives the per-channel `iterations_per_minute`
 * cadence used by the ingest pipeline to synthesize timestamps. The
 * cadence affects every new ingest; previously-ingested rows keep
 * their original synthesized timestamps.
 *
 * `channels` (mock) is still accepted so the screen renders something
 * before any CSV has been ingested. Once real configs exist they take
 * precedence.
 */
export function ChannelsSection({ channels }: { channels: Channel[] }) {
  const [configs, setConfigs] = useState<ChannelConfigOut[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRate, setDraftRate] = useState<string>("1");
  const [draftName, setDraftName] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setConfigs(await api.channelConfigs());
    } catch {
      setConfigs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = useCallback((c: ChannelConfigOut) => {
    setEditingId(c.channel_name);
    setDraftRate(String(c.iterations_per_minute));
    setDraftName(c.display_name ?? c.channel_name);
  }, []);

  const save = useCallback(
    async (channelName: string) => {
      const rate = Number(draftRate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 600) return;
      try {
        await api.updateChannelConfig(channelName, {
          iterations_per_minute: rate,
          display_name: draftName.trim() || null,
        });
        setEditingId(null);
        await load();
      } catch (e) {
        // surface error inline? for now just stay in edit mode
        console.error(e);
      }
    },
    [draftRate, draftName, load],
  );

  // Show real configs if any exist, otherwise fall back to the mock
  // channel list so the screen isn't empty pre-ingest.
  const rows: Array<{ name: string; cfg: ChannelConfigOut | null; mock: Channel | null }> =
    configs !== null && configs.length > 0
      ? configs.map((c) => ({ name: c.channel_name, cfg: c, mock: null }))
      : channels.map((c) => ({ name: c.id, cfg: null, mock: c }));

  return (
    <div>
      <SectionHeader
        title="Channels"
        sub={`${rows.length} configured · ingest cadence affects how raw counts map to wall-clock time`}
      />
      <div className="panel">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "24px 1fr 130px 110px 90px 130px",
            gap: 12, padding: "8px 14px",
            fontSize: 10.5, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span></span>
          <span>Name</span>
          <span className="mono">Cadence (rows/min)</span>
          <span className="mono">Rows ingested</span>
          <span>Status</span>
          <span></span>
        </div>
        {rows.map((row, i) => {
          const isEditing = editingId === row.name;
          return (
            <div
              key={row.name}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr 130px 110px 90px 130px",
                gap: 12, padding: "10px 14px", alignItems: "center",
                borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)",
                fontSize: 12.5,
              }}
            >
              <span
                style={{
                  width: 10, height: 10, borderRadius: 2,
                  background: row.mock?.color ?? "var(--ch-1)",
                }}
              />

              {isEditing ? (
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  style={inputStyle}
                />
              ) : (
                <div>
                  <div style={{ fontSize: 13 }}>
                    {row.cfg?.display_name ?? row.mock?.name ?? row.name}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>
                    {row.name}
                  </div>
                </div>
              )}

              {isEditing ? (
                <input
                  type="number"
                  min={0.1}
                  max={600}
                  step={0.1}
                  value={draftRate}
                  onChange={(e) => setDraftRate(e.target.value)}
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              ) : (
                <span className="mono">
                  {row.cfg?.iterations_per_minute.toFixed(2) ?? "1.00"}
                </span>
              )}

              <span className="mono muted">
                {(row.cfg?.rows_total ?? 0).toLocaleString()}
              </span>

              <span>
                {row.cfg && row.cfg.rows_total > 0 ? (
                  <Pill size="sm" color="var(--ch-4)" bg="rgba(118,217,182,0.10)" border="rgba(118,217,182,0.18)">● ingested</Pill>
                ) : row.mock?.online ? (
                  <Pill size="sm" color="var(--ch-4)" bg="rgba(118,217,182,0.10)" border="rgba(118,217,182,0.18)">● demo</Pill>
                ) : (
                  <Pill size="sm" color="var(--text-3)">no data</Pill>
                )}
              </span>

              {isEditing ? (
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <Button size="sm" variant="primary" onClick={() => void save(row.name)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      row.cfg
                        ? beginEdit(row.cfg)
                        : beginEdit({
                            channel_name: row.name,
                            display_name: row.mock?.name ?? null,
                            belt: row.mock?.belt ?? null,
                            iterations_per_minute: 1.0,
                            rows_total: 0,
                          })
                    }
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface-0)",
  color: "var(--text-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  padding: "4px 8px",
  fontSize: 12.5,
  width: "100%",
};
