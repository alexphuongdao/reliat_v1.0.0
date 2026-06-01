/**
 * Domain types — mirror the shapes the original screens read from
 * `window.ReliatData` and the FastAPI responses. Field names are
 * camelCase because that's what the design code already consumes.
 */

export type Severity = "critical" | "warn" | "info";
export type OutlierStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export interface Channel {
  id: string;
  name: string;
  belt: string;
  color: string;            // CSS color or var() string, e.g. "var(--ch-1)"
  baseF80: number;
  baseTopsize: number;
  online: boolean;
  shift: string;
}

export interface SeriesPoint {
  t: number;                                 // epoch ms
  v: number;                                 // measurement value
  outlier: { sev: Severity; deviation: number } | null;
  color: string;                             // hsl(...) string
}

export interface PsdPercentile { name: string; x: number; y: number }
export interface PsdSieve { size: number; passing: number }
export interface PsdSnapshot { pcts: PsdPercentile[]; sieves: PsdSieve[] }

export interface Outlier {
  id: string;
  channelId: string;
  channelName: string;
  t: number;
  metric: string;
  unit: string;
  value: number;
  baseline: number;
  deviation: number;
  sev: Severity;
  type: string;
  confidence: number;
  status: OutlierStatus;
  assignee: string | null;
  summary: string;
  action: string;
  indexInSeries: number;
}

// ─── Agent ──────────────────────────────────────────────────────────
export interface AgentRef {
  kind: "outlier" | "channel";
  id: string;
}

// Heterogeneous evidence rows — every entry has tool + args, plus an
// arbitrary set of named result fields (rows, sigma, returned, …).
export interface AgentEvidence {
  tool: string;
  args: string;
  [k: string]: string | number | boolean | undefined;
}

export interface UserTurn {
  role: "user";
  t: number;
  content: string;
}

export interface AgentReply {
  role: "agent";
  t: number;
  answer: string[];
  refs?: AgentRef[];
  evidence: AgentEvidence[];
  followups?: string[];
}

export type AgentTurnMsg = UserTurn | AgentReply;

// ─── Command palette ────────────────────────────────────────────────
export interface Command {
  id: string;
  label: string;
  kind: string;
  shortcut?: string;
  surface?: string;
  channelId?: string;
  outlierId?: string;
}

// ─── Auth ───────────────────────────────────────────────────────────
export interface UserOut {
  id: string;
  email: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  provider: string | null;
}

export interface AuthProviders {
  google: boolean;
  github: boolean;
  password: boolean;
}
