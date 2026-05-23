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

// — Inbox row (collapsed + expanded variants)
interface InboxRowProps {
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

function OutlierInboxRow({
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

function SectionLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 10.5, color: "var(--text-3)", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
      }}
    >
      <Icon name={icon} size={12} />
      {children}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.min(1, Math.max(0, value));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 36, height: 4, background: "var(--surface-inset)",
          borderRadius: 2, overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block", width: `${pct * 100}%`, height: "100%",
            background:
              pct > 0.75 ? "var(--ch-4)" :
              pct > 0.5  ? "var(--sev-warn)" :
                           "var(--sev-crit)",
          }}
        />
      </span>
      <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
        {(pct * 100).toFixed(0)}%
      </span>
    </span>
  );
}

// — FilterSegment (multi-select severity bar)
interface FilterSegmentOption {
  id: string;
  label: string;
  count: number;
  glyph: string;
}
function FilterSegment({
  label, options, value, onChange,
}: {
  label: string;
  options: FilterSegmentOption[];
  value: Set<Severity>;
  onChange: (updater: (prev: Set<Severity>) => Set<Severity>) => void;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 4, fontWeight: 500 }}>{label}</span>
      <div
        style={{
          display: "inline-flex", padding: 2,
          background: "var(--surface-inset)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
        }}
      >
        {options.map((o) => {
          const on = value.has(o.id as Severity);
          return (
            <button
              key={o.id}
              onClick={() =>
                onChange((ns) => {
                  const next = new Set(ns);
                  if (next.has(o.id as Severity)) next.delete(o.id as Severity);
                  else next.add(o.id as Severity);
                  return next;
                })
              }
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px", fontSize: 11.5, fontWeight: 500,
                background: on ? "var(--surface-3)" : "transparent",
                color: on ? "var(--text-1)" : "var(--text-3)",
                borderRadius: "var(--r-sm)",
              }}
            >
              <SevGlyph sev={o.glyph} size={8} />
              {o.label}
              <span className="mono" style={{ color: "var(--text-3)", fontSize: 10.5 }}>{o.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// — FilterChip (single- or multi-select)
type ChipValue = string | null | Set<string>;
function FilterChip({
  label, current, options, value, onChange, singleSelect, optionLabel,
}: {
  label: string;
  current: string;
  options: string[];
  value: ChipValue;
  onChange:
    | ((next: string | null) => void)
    | ((updater: (prev: Set<string>) => Set<string>) => void);
  singleSelect?: boolean;
  optionLabel?: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", fontSize: 11.5, fontWeight: 500,
          background: "var(--surface-2)", color: "var(--text-2)",
          border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
        }}
      >
        <span style={{ color: "var(--text-3)" }}>{label}:</span>
        <span style={{ color: "var(--text-1)" }}>{current}</span>
        <Icon name="chevdown" size={12} />
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60,
            minWidth: 200, maxHeight: 280, overflow: "auto",
            background: "var(--surface-2)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)", padding: 4,
          }}
        >
          {singleSelect && (
            <div
              onClick={() => {
                (onChange as (next: string | null) => void)(null);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px", fontSize: 12.5, cursor: "pointer",
                borderRadius: "var(--r-sm)",
                color: !value ? "var(--accent-bright)" : "var(--text-2)",
              }}
            >
              All
            </div>
          )}
          {options.map((o) => {
            const on = singleSelect
              ? value === o
              : (value as Set<string>).has(o);
            return (
              <div
                key={o}
                onClick={() => {
                  if (singleSelect) {
                    (onChange as (next: string | null) => void)(o);
                    setOpen(false);
                  } else {
                    (onChange as (updater: (prev: Set<string>) => Set<string>) => void)((ns) => {
                      const next = new Set(ns);
                      if (next.has(o)) next.delete(o);
                      else next.add(o);
                      return next;
                    });
                  }
                }}
                style={{
                  padding: "6px 10px", fontSize: 12.5, cursor: "pointer",
                  borderRadius: "var(--r-sm)",
                  display: "flex", alignItems: "center", gap: 8,
                  color: on ? "var(--accent-bright)" : "var(--text-1)",
                  background: on ? "var(--accent-dim)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!on) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-3)";
                }}
                onMouseLeave={(e) => {
                  if (!on) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                {!singleSelect && (
                  <span
                    style={{
                      width: 13, height: 13, border: "1px solid var(--border-strong)",
                      borderRadius: 3,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: on ? "var(--accent)" : "transparent",
                    }}
                  >
                    {on && <Icon name="check" size={9} />}
                  </span>
                )}
                {optionLabel ? optionLabel(o) : o}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
