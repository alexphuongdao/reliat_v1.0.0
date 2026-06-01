"use client";

/**
 * Outliers — the triage inbox.
 *
 * Ported 1:1 from frontend/screens/outliers.jsx. Visual parity is the only
 * goal of this Phase-1 port. Mechanical changes:
 *   - `window.ReliatData.{CHANNELS, OUTLIERS}` → component props
 *   - hook aliases (`uState`, `uEffect`, `uRef`) → real React names
 *   - inline `FilterSegment`, `FilterChip`, `OutlierInboxRow`,
 *     `ConfidenceBar`, `SectionLabel` kept in the same file (matches the
 *     original idiom). Extraction into shared modules happens in Phase 2.
 *
 * Triage-action callbacks (`onOpenChannel`, `onAskAgent`) are no-ops by
 * default — they get wired to the app shell in Phase 3.
 */
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Icon, SevGlyph, StatusPill } from "../ui";
import { fmtAge, fmtNum, fmtTime } from "../../lib/format";
import type { Channel, Outlier, Severity } from "../../lib/types";
import { FilterChip } from "./outliers/FilterChip";
import { FilterSegment } from "./outliers/FilterSegment";
import { OutlierInboxRow } from "./outliers/OutlierInboxRow";

export interface OutliersScreenProps {
  channels: Channel[];
  outliers: Outlier[];
  initialOutlierId?: string;
  onOpenChannel?: (c: Channel) => void;
  onAskAgent?: (o: Outlier) => void;
}

export function OutliersScreen({
  channels: CHANNELS,
  outliers: OUTLIERS,
  initialOutlierId,
  onOpenChannel,
  onAskAgent,
}: OutliersScreenProps) {
  const [sevFilter, setSevFilter] = useState<Set<Severity>>(
    new Set<Severity>(["critical", "warn", "info"]),
  );
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set(["open", "acknowledged"]),
  );
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(initialOutlierId || null);
  const [rightRail, setRightRail] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialOutlierId) setExpanded(initialOutlierId);
  }, [initialOutlierId]);

  const filtered = OUTLIERS.filter((o) =>
    sevFilter.has(o.sev) &&
    statusFilter.has(o.status) &&
    (!channelFilter || o.channelId === channelFilter) &&
    (!classFilter || o.type === classFilter),
  );

  // — keyboard nav (j/k, x, enter)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === "j") {
        e.preventDefault();
        setFocused((f) => Math.min(filtered.length - 1, f + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocused((f) => Math.max(0, f - 1));
      } else if (e.key === "x") {
        e.preventDefault();
        const o = filtered[focused];
        if (!o) return;
        setSelected((s) => {
          const ns = new Set(s);
          if (ns.has(o.id)) ns.delete(o.id);
          else ns.add(o.id);
          return ns;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const o = filtered[focused];
        if (o) setExpanded(expanded === o.id ? null : o.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, focused, expanded]);

  const sevCounts = {
    critical: OUTLIERS.filter((o) => o.sev === "critical" && statusFilter.has(o.status)).length,
    warn:     OUTLIERS.filter((o) => o.sev === "warn"     && statusFilter.has(o.status)).length,
    info:     OUTLIERS.filter((o) => o.sev === "info"     && statusFilter.has(o.status)).length,
  };

  // hour histogram from filtered
  const hourBuckets = Array<number>(24).fill(0);
  filtered.forEach((o) => {
    hourBuckets[new Date(o.t).getHours()]++;
  });
  const maxHour = Math.max(...hourBuckets, 1);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: rightRail ? "1fr 280px" : "1fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={{ overflow: "auto", display: "flex", flexDirection: "column" }}>

        {/* Filter bar */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 20px",
            borderBottom: "1px solid var(--border)", background: "var(--surface-0)",
            position: "sticky", top: 0, zIndex: 5,
          }}
        >
          <FilterSegment
            label="Severity"
            options={[
              { id: "critical", label: "Critical", count: sevCounts.critical, glyph: "critical" },
              { id: "warn",     label: "Warning",  count: sevCounts.warn,     glyph: "warn" },
              { id: "info",     label: "Info",     count: sevCounts.info,     glyph: "info" },
            ]}
            value={sevFilter}
            onChange={setSevFilter}
          />
          <span style={{ width: 1, height: 18, background: "var(--border)" }} />
          <FilterChip
            label="Status"
            current={[...statusFilter].join(", ") || "any"}
            options={["open", "acknowledged", "resolved", "dismissed"]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterChip
            label="Channel"
            current={channelFilter ? CHANNELS.find((c) => c.id === channelFilter)?.name ?? "all" : "all"}
            singleSelect
            options={CHANNELS.map((c) => c.id)}
            value={channelFilter}
            onChange={setChannelFilter as (v: string | null | Set<string>) => void}
            optionLabel={(id: string) => CHANNELS.find((c) => c.id === id)?.name ?? id}
          />
          <FilterChip
            label="Classification"
            current={classFilter || "any"}
            singleSelect
            options={[
              "Particle-size spike", "Topsize excursion", "Fines collapse",
              "Color shift", "Sieve drift", "Sensor flutter",
            ]}
            value={classFilter}
            onChange={setClassFilter as (v: string | null | Set<string>) => void}
          />
          <span style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>
            {filtered.length.toLocaleString()} of {OUTLIERS.length.toLocaleString()} outliers
          </span>
          <Button
            size="sm"
            variant="ghost"
            leftIcon={rightRail ? "panel-r" : "panel-l"}
            onClick={() => setRightRail((v) => !v)}
          >
            {rightRail ? "Hide rail" : "Show rail"}
          </Button>
        </div>

        {/* Bulk-action bar (appears with selection) */}
        {selected.size > 0 && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              background: "var(--accent-dim)",
              borderBottom: "1px solid var(--accent-line)",
            }}
          >
            <span style={{ color: "var(--accent-bright)", fontWeight: 600, fontSize: 13 }}>
              {selected.size} selected
            </span>
            <span style={{ width: 1, height: 16, background: "var(--accent-line)" }} />
            <Button size="sm" variant="ghost" leftIcon="check">
              Acknowledge <span className="kbd" style={{ marginLeft: 4 }}>E</span>
            </Button>
            <Button size="sm" variant="ghost" leftIcon="circle">
              Resolve <span className="kbd" style={{ marginLeft: 4 }}>R</span>
            </Button>
            <Button size="sm" variant="ghost" leftIcon="user">
              Assign <span className="kbd" style={{ marginLeft: 4 }}>A</span>
            </Button>
            <Button size="sm" variant="ghost" leftIcon="x">Dismiss</Button>
            <span style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {/* column header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "32px 18px 76px 1fr 130px 80px 1.4fr 76px 88px 76px",
            gap: 12, padding: "8px 20px",
            fontSize: 10.5, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
            borderBottom: "1px solid var(--border)",
            position: "sticky", top: 52, background: "var(--surface-0)", zIndex: 4,
          }}
        >
          <span><input type="checkbox" disabled style={{ accentColor: "var(--accent)" }} /></span>
          <span></span>
          <span>ID</span>
          <span>Channel · metric</span>
          <span>Detected</span>
          <span style={{ textAlign: "right" }}>Value</span>
          <span>Classification</span>
          <span>Conf.</span>
          <span>Status</span>
          <span style={{ textAlign: "right" }}>Age</span>
        </div>

        {/* Rows */}
        <div ref={listRef}>
          {filtered.map((o, i) => (
            <OutlierInboxRow
              key={o.id}
              o={o}
              channels={CHANNELS}
              focused={i === focused}
              isSelected={selected.has(o.id)}
              expanded={expanded === o.id}
              onFocus={() => setFocused(i)}
              onToggleSelect={() =>
                setSelected((s) => {
                  const ns = new Set(s);
                  if (ns.has(o.id)) ns.delete(o.id);
                  else ns.add(o.id);
                  return ns;
                })
              }
              onToggleExpand={() => setExpanded(expanded === o.id ? null : o.id)}
              onOpenChannel={() => {
                const c = CHANNELS.find((c) => c.id === o.channelId);
                if (c && onOpenChannel) onOpenChannel(c);
              }}
              onAsk={() => onAskAgent && onAskAgent(o)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No outliers match these filters. Last detection at <span className="mono">02:47</span> on{" "}
              <span style={{ color: "var(--text-2)" }}>CV09 ROM</span>.
              <div style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSevFilter(new Set<Severity>(["critical", "warn", "info"]));
                    setStatusFilter(new Set(["open", "acknowledged", "resolved", "dismissed"]));
                    setChannelFilter(null);
                    setClassFilter(null);
                  }}
                >
                  Reset filters
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right rail — aggregate stats */}
      {rightRail && (
        <aside
          style={{
            borderLeft: "1px solid var(--border)",
            background: "var(--surface-1)", overflow: "auto",
            padding: "16px 16px 32px",
          }}
        >
          <div style={{ marginBottom: 18 }}>
            <h3
              style={{
                fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase",
                letterSpacing: "0.08em", fontWeight: 600, margin: "0 0 10px",
              }}
            >
              Filter aggregate
            </h3>
            <div className="mono" style={{ fontSize: 28, fontWeight: 600 }}>
              {filtered.length.toLocaleString()}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>outliers in current view</div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h4
              style={{
                fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase",
                letterSpacing: "0.08em", fontWeight: 600, margin: "0 0 8px",
              }}
            >
              By severity
            </h4>
            {(["critical", "warn", "info"] as Severity[]).map((s) => {
              const n = filtered.filter((o) => o.sev === s).length;
              const pct = filtered.length === 0 ? 0 : n / filtered.length;
              const color =
                s === "critical" ? "var(--sev-crit)" :
                s === "warn"     ? "var(--sev-warn)" :
                                   "var(--sev-info)";
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <SevGlyph sev={s} size={9} />
                  <span style={{ fontSize: 12, flex: 0, width: 60, color: "var(--text-2)" }}>
                    {s === "warn" ? "warning" : s}
                  </span>
                  <div
                    style={{
                      flex: 1, height: 6, background: "var(--surface-inset)",
                      borderRadius: 3, overflow: "hidden",
                    }}
                  >
                    <div style={{ width: `${pct * 100}%`, height: "100%", background: color }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11.5, width: 32, textAlign: "right" }}>{n}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: 20 }}>
            <h4
              style={{
                fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase",
                letterSpacing: "0.08em", fontWeight: 600, margin: "0 0 8px",
              }}
            >
              By channel
            </h4>
            {CHANNELS.map((c) => {
              const n = filtered.filter((o) => o.channelId === c.id).length;
              if (n === 0) return null;
              const max = Math.max(
                ...CHANNELS.map((cc) => filtered.filter((o) => o.channelId === cc.id).length),
                1,
              );
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 8, height: 8, background: c.color, borderRadius: 2 }} />
                  <span
                    style={{
                      fontSize: 12, flex: 1, color: "var(--text-2)",
                      textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </span>
                  <div
                    style={{
                      width: 56, height: 4, background: "var(--surface-inset)",
                      borderRadius: 2, overflow: "hidden",
                    }}
                  >
                    <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: c.color, opacity: 0.7 }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11.5, width: 24, textAlign: "right" }}>{n}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: 16 }}>
            <h4
              style={{
                fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase",
                letterSpacing: "0.08em", fontWeight: 600, margin: "0 0 8px",
              }}
            >
              Hour histogram
            </h4>
            <svg
              width="100%" height={56} viewBox="0 0 240 56"
              preserveAspectRatio="none" style={{ display: "block" }}
            >
              {hourBuckets.map((n, i) => {
                const h = (n / maxHour) * 50;
                return (
                  <rect
                    key={i}
                    x={i * 10}
                    y={56 - h}
                    width={8}
                    height={h}
                    fill={`var(--ch-${(i % 8) + 1})`}
                    opacity={0.5}
                  />
                );
              })}
            </svg>
            <div
              className="mono"
              style={{
                fontSize: 10, color: "var(--text-3)",
                display: "flex", justifyContent: "space-between", marginTop: 2,
              }}
            >
              <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

