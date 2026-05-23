/**
 * Mock substrate — ported from frontend/data.jsx (the original Babel
 * prototype). Used during Phase 1 of the migration so screens can be
 * visually verified without depending on the backend. Phase 3 replaces
 * this with a real API client.
 *
 * Deterministic by design — Mulberry32 seeded from channel id so the
 * rendered shape is stable between reloads.
 */
import type {
  AgentTurnMsg,
  Channel,
  Command,
  Outlier,
  SeriesPoint,
  Severity,
} from "./types";

function rng(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const CHANNEL_SEED: ReadonlyArray<Channel> = [
  { id: "cv42", name: "CV42 Tunnel",      belt: "Primary",   color: "var(--ch-1)",  baseF80: 78.2,  baseTopsize: 142, online: true,  shift: "A" },
  { id: "cv18", name: "CV18 Mill Feed",   belt: "Mill",      color: "var(--ch-4)",  baseF80: 64.8,  baseTopsize: 118, online: true,  shift: "A" },
  { id: "cv07", name: "CV07 Stockpile",   belt: "Stockpile", color: "var(--ch-6)",  baseF80: 92.4,  baseTopsize: 164, online: true,  shift: "A" },
  { id: "cv33", name: "CV33 Crusher Out", belt: "Crusher",   color: "var(--ch-3)",  baseF80: 84.1,  baseTopsize: 156, online: true,  shift: "A" },
  { id: "cv51", name: "CV51 Reclaim",     belt: "Reclaim",   color: "var(--ch-2)",  baseF80: 71.6,  baseTopsize: 132, online: true,  shift: "A" },
  { id: "cv09", name: "CV09 ROM",         belt: "ROM",       color: "var(--ch-5)",  baseF80: 116.4, baseTopsize: 218, online: true,  shift: "A" },
  { id: "cv24", name: "CV24 Conveyor B",  belt: "Transfer",  color: "var(--ch-7)",  baseF80: 68.2,  baseTopsize: 124, online: true,  shift: "A" },
  { id: "cv12", name: "CV12 Tertiary",    belt: "Tertiary",  color: "var(--ch-8)",  baseF80: 52.8,  baseTopsize: 96,  online: true,  shift: "A" },
  { id: "cv66", name: "CV66 Screening",   belt: "Screen",    color: "var(--ch-10)", baseF80: 38.4,  baseTopsize: 74,  online: true,  shift: "A" },
  { id: "cv28", name: "CV28 SAG Feed",    belt: "SAG",       color: "var(--ch-9)",  baseF80: 88.9,  baseTopsize: 168, online: false, shift: "A" },
  { id: "cv03", name: "CV03 Pebble",      belt: "Pebble",    color: "var(--ch-11)", baseF80: 42.1,  baseTopsize: 82,  online: true,  shift: "A" },
  { id: "cv77", name: "CV77 Fines",       belt: "Fines",     color: "var(--ch-12)", baseF80: 21.6,  baseTopsize: 42,  online: true,  shift: "A" },
];

const OUTLIER_TYPES = [
  { tag: "Particle-size spike", metric: "F80",        unit: "mm" },
  { tag: "Topsize excursion",   metric: "Topsize",    unit: "mm" },
  { tag: "Fines collapse",      metric: "F10",        unit: "mm" },
  { tag: "Color shift",         metric: "Hue avg",    unit: "°"  },
  { tag: "Sieve drift",         metric: "Sieve 12.5", unit: "%"  },
  { tag: "Sensor flutter",      metric: "Topsize",    unit: "mm" },
];

const STATUSES = ["open", "open", "open", "acknowledged", "resolved", "dismissed"] as const;
const ASSIGNEES: (string | null)[] = [null, null, "You", "M. Okafor", "A. Lindqvist", "R. Patel"];

const EXPLANATIONS: Record<string, string> = {
  "Particle-size spike": "F80 jumped %DEV%σ above the rolling baseline over ~3min. Pattern matches a feed pulse from the upstream stockpile reclaim — not the crusher.",
  "Topsize excursion":   "Topsize crossed the alarm band and held above for %DUR%. Consistent with oversized fragments bypassing the grizzly screen.",
  "Fines collapse":      "F10 dropped sharply with no corresponding F80 change. Suggests dust suppression water surge rather than a real fines reduction.",
  "Color shift":         "Average belt hue shifted from earth-brown into a redder band for %DUR%. Likely material transition — high-iron ore on belt.",
  "Sieve drift":         "12.5mm passing % drifted out of band gradually over the last hour. No discrete event; trend is the signal.",
  "Sensor flutter":      "High-frequency oscillation on Topsize with no PSD change. Likely camera vibration during conveyor restart, not material.",
};

const SUGGESTED: Record<string, string> = {
  "Particle-size spike": "Cross-check stockpile reclaim feeder rate at the same window.",
  "Topsize excursion":   "Inspect grizzly screen panel C-3 for damage at next downtime.",
  "Fines collapse":      "Confirm dust suppression nozzle sequence — likely a programming artifact.",
  "Color shift":         "Notify downstream of high-iron pulse — expect SAG draw +6%.",
  "Sieve drift":         "No immediate action. Re-evaluate at end of shift.",
  "Sensor flutter":      "Mark as instrumentation; suppress for next 15 min.",
};

function buildSeries(channel: Channel, points = 1440, now: number): SeriesPoint[] {
  const r = rng(channel.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  const out: SeriesPoint[] = [];
  const base = channel.baseF80;
  const outlierIdx = new Set<number>();
  const nOut = Math.floor(r() * 5);
  for (let i = 0; i < nOut; i++) outlierIdx.add(Math.floor(r() * points));
  const colorDrift = r() > 0.45 ? { start: Math.floor(r() * points * 0.7), len: Math.floor(60 + r() * 180) } : null;

  let walk = 0;
  for (let i = 0; i < points; i++) {
    walk += (r() - 0.5) * 0.4;
    walk *= 0.985;
    const diurn = Math.sin((i / points) * Math.PI * 2) * (base * 0.04);
    let v = base + walk + diurn + (r() - 0.5) * (base * 0.012);

    let outlier: SeriesPoint["outlier"] = null;
    if (outlierIdx.has(i)) {
      const sevR = r();
      const sev: Severity = sevR < 0.18 ? "critical" : sevR < 0.55 ? "warn" : "info";
      const dir = r() > 0.5 ? 1 : -1;
      const mag = (sev === "critical" ? 0.34 : sev === "warn" ? 0.18 : 0.08) * base;
      v += dir * mag;
      outlier = { sev, deviation: (dir * mag) / (base * 0.05) };
    }

    let h = 24 + Math.sin(i / 60) * 6 + (r() - 0.5) * 4;
    let s = 24 + Math.sin(i / 120) * 6 + (r() - 0.5) * 4;
    let l = 28 + Math.sin(i / 180) * 4 + (r() - 0.5) * 3;
    if (colorDrift && i >= colorDrift.start && i < colorDrift.start + colorDrift.len) {
      const t = (i - colorDrift.start) / colorDrift.len;
      const bell = Math.sin(t * Math.PI);
      h += bell * (channel.id === "cv42" ? -14 : channel.id === "cv33" ? 28 : 18);
      s += bell * 18;
      l += bell * (channel.id === "cv66" ? -6 : 6);
    }
    out.push({
      t: now - (points - i) * 60_000,
      v,
      outlier,
      color: `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`,
    });
  }
  return out;
}

export interface MockSubstrate {
  channels: Channel[];
  series: Record<string, SeriesPoint[]>;
  outliers: Outlier[];
  agentThread: AgentTurnMsg[];
  shiftSummary: string;
  commands: Command[];
}

// ─── Agent thread seed (one prefilled Q&A — matches the original) ───
function buildAgentThread(now: number): AgentTurnMsg[] {
  return [
    {
      role: "user",
      content: "Why did CV42 Tunnel spike at 02:47 this morning?",
      t: now - 1000 * 60 * 32,
    },
    {
      role: "agent",
      t: now - 1000 * 60 * 31,
      answer: [
        "CV42 Tunnel's Topsize crossed the upper alarm band at 02:47:14 and held there for 4m 12s. The deviation was 3.6σ above the trailing 7-day baseline for the same shift slot.",
        "This is consistent with a feed pulse from CV51 Reclaim, not the upstream crusher — the timing aligns with the reclaim feeder ramp at 02:46:51 and the PSD shape (F80↑, F10 flat) matches reclaim signatures from 11 prior events this quarter.",
        "Downstream effect, predicted: SAG mill draw on CV28 will rise ~6% over the next 18–24 minutes. CV28 is currently offline for scheduled service so the effect is absorbed.",
      ],
      refs: [
        { kind: "outlier", id: "OUT-1L" },
        { kind: "channel", id: "cv51" },
      ],
      evidence: [
        { tool: "series.query", args: "channel=cv42 metric=Topsize window=02:30..03:00", rows: 1840 },
        { tool: "baseline.compare", args: "channel=cv42 metric=Topsize lookback=7d match=shift", sigma: 3.6 },
        { tool: "similar.vector_search", args: "embed(OUT-1L) k=20 filter=channel=cv42", returned: 11 },
        { tool: "cascade.predict", args: "origin=cv42 horizon=30m", confidence: 0.81 },
      ],
      followups: [
        "Show the 11 similar past events on CV42.",
        "What did we do last time CV51 caused this?",
        "Is the SAG service window still on schedule?",
      ],
    },
  ];
}

const SHIFT_SUMMARY =
  "Shift A is 4h 12m in. Throughput tracking 3.1% above the 7-day mean; CV42 Tunnel and CV33 Crusher Out account for 71% of feed. Three open outliers: one critical (CV09 ROM Topsize, 02:47), two warnings (CV66 Screening drift, CV51 Reclaim color shift). CV28 SAG Feed is offline for scheduled service; CV33 is absorbing the diverted load with no anomalies. Recommended attention: confirm CV09 ROM grizzly screen at next downtime — same outlier signature appeared on three prior shifts this week.";

const STATIC_COMMANDS: Command[] = [
  { id: "go.pulse",     label: "Go to Pulse",            kind: "Navigate", shortcut: "G P", surface: "pulse" },
  { id: "go.channels",  label: "Go to Channels",         kind: "Navigate", shortcut: "G C", surface: "channels" },
  { id: "go.outliers",  label: "Go to Outliers",         kind: "Navigate", shortcut: "G O", surface: "outliers" },
  { id: "go.agent",     label: "Go to Agent",            kind: "Navigate", shortcut: "G A", surface: "agent" },
  { id: "go.library",   label: "Go to Library",          kind: "Navigate", shortcut: "G L", surface: "library" },
  { id: "go.notes",     label: "Open Design Notes",      kind: "Navigate", surface: "notes" },
  { id: "agent.toggle", label: "Toggle Agent drawer",    kind: "Action", shortcut: "⌘J" },
  { id: "theme.toggle", label: "Toggle density: compact",kind: "Preference" },
  { id: "view.shift",   label: "Open saved view: Shift handoff", kind: "Saved view" },
  { id: "view.crit",    label: "Open saved view: Critical only", kind: "Saved view" },
  { id: "kbd.help",     label: "Show keyboard shortcuts",kind: "Help", shortcut: "?" },
];

/**
 * Build the mock substrate. Pass `now` to make it deterministic
 * (Server Components want stable output across renders).
 */
export function buildMock(now: number = 0): MockSubstrate {
  const stamp = now || Date.now();
  const channels: Channel[] = CHANNEL_SEED.map((c) => ({ ...c }));
  const series: Record<string, SeriesPoint[]> = {};
  for (const c of channels) series[c.id] = buildSeries(c, 1440, stamp);

  const outliers: Outlier[] = [];
  for (const c of channels) {
    series[c.id].forEach((pt, i) => {
      if (!pt.outlier) return;
      const r = rng(i + c.id.charCodeAt(2));
      const type = OUTLIER_TYPES[Math.floor(r() * OUTLIER_TYPES.length)];
      const dev = Math.abs(pt.outlier.deviation);
      const confidence = 0.62 + r() * 0.36;
      const id = `OUT-${(2400 + outliers.length).toString(36).toUpperCase()}`;
      const status = STATUSES[Math.floor(r() * STATUSES.length)];
      outliers.push({
        id,
        channelId: c.id,
        channelName: c.name,
        t: pt.t,
        metric: type.metric,
        unit: type.unit,
        value: pt.v,
        baseline: c.baseF80,
        deviation: dev,
        sev: pt.outlier.sev,
        type: type.tag,
        confidence,
        status,
        assignee: ASSIGNEES[Math.floor(r() * ASSIGNEES.length)],
        summary: (EXPLANATIONS[type.tag] || "")
          .replace("%DEV%", dev.toFixed(1))
          .replace("%DUR%", `${2 + Math.floor(r() * 7)}m ${10 + Math.floor(r() * 50)}s`),
        action: SUGGESTED[type.tag] || "",
        indexInSeries: i,
      });
    });
  }
  outliers.sort((a, b) => b.t - a.t);
  return {
    channels,
    series,
    outliers,
    agentThread: buildAgentThread(stamp),
    shiftSummary: SHIFT_SUMMARY,
    commands: STATIC_COMMANDS,
  };
}
