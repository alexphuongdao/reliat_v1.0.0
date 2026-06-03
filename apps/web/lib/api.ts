/**
 * Typed API client for `services/api`.
 *
 * Reads `NEXT_PUBLIC_API_BASE` at build/runtime so the deploy contract
 * is set once in Vercel and the same URL is used by every screen.
 *
 * Phase 1 doesn't call this yet — pages still use `buildMock()`.
 * Phase 3 swaps `buildMock()` calls for `api.channels()` etc.
 *
 * Shapes mirror what the screens already consume (the FastAPI Pydantic
 * schemas were designed to match these field names — no adapter layer
 * is needed).
 */
import { clearToken, getToken } from "./auth";
import type {
  Channel,
  Outlier,
  OutlierStatus,
  PsdSnapshot,
  SeriesPoint,
} from "./types";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * On 401, drop the dead token and send the user back to /login. The
 * caller still gets a thrown error — guards/screens decide whether to
 * surface it.
 */
function handle401(): void {
  if (typeof window === "undefined") return;
  clearToken();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.status === 401) {
    handle401();
    throw new Error(`GET ${path} → 401`);
  }
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    handle401();
    throw new Error(`PATCH ${path} → 401`);
  }
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export type RangeId = "1h" | "shift" | "24h" | "7d" | "30d";

export interface OutlierListParams {
  sev?: string[];
  status?: string[];
  channelId?: string;
  type?: string;
  limit?: number;
}

export const api = {
  base: API_BASE,

  health: () => getJSON<{ ok: boolean; service: string; version: string }>("/api/health"),

  channels: () => getJSON<Channel[]>("/api/channels"),

  channelConfigs: () => getJSON<ChannelConfigOut[]>("/api/channels/configs"),

  updateChannelConfig: (channelName: string, body: ChannelConfigPatch) =>
    patchJSON<ChannelConfigOut>(
      `/api/channels/configs/${encodeURIComponent(channelName)}`,
      body,
    ),

  series: (channelId: string, range: RangeId = "24h") =>
    getJSON<SeriesPoint[]>(
      `/api/channels/${encodeURIComponent(channelId)}/series?range=${range}`,
    ),

  psd: (channelId: string, t?: number) => {
    const qs = t != null ? `?t=${t}` : "";
    return getJSON<PsdSnapshot>(
      `/api/channels/${encodeURIComponent(channelId)}/psd${qs}`,
    );
  },

  outliers: (params?: OutlierListParams) => {
    const sp = new URLSearchParams();
    params?.sev?.forEach((s) => sp.append("sev", s));
    params?.status?.forEach((s) => sp.append("status", s));
    if (params?.channelId) sp.set("channel_id", params.channelId);
    if (params?.type) sp.set("type", params.type);
    if (params?.limit != null) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return getJSON<Outlier[]>(`/api/outliers${qs ? `?${qs}` : ""}`);
  },

  patchOutlier: (
    id: string,
    body: { status?: OutlierStatus; assignee?: string | null },
  ) => patchJSON<Outlier>(`/api/outliers/${encodeURIComponent(id)}`, body),

  ingest: {
    upload: (file: File) => uploadFile<IngestBatchSummary>("/api/ingest/csv", file),
    batches: () => getJSON<IngestBatchSummary[]>("/api/ingest/batches"),
    deleteBatch: (id: string) =>
      deleteJSON<{ deleted: string }>(`/api/ingest/batches/${encodeURIComponent(id)}`),
  },

  analytics: {
    channels: () => getJSON<ChannelSummary[]>("/api/analytics/channels"),
    metrics: () => getJSON<{ id: string; label: string }[]>("/api/analytics/metrics"),
    series: (channel: string, metric: string, window: WindowId = "10m") =>
      getJSON<SeriesWithBands>(
        `/api/analytics/series?channel=${encodeURIComponent(channel)}&metric=${encodeURIComponent(metric)}&window=${window}`,
      ),
    spc: (channel: string, metric: string, window: WindowId = "1h") =>
      getJSON<SpcSeries>(
        `/api/analytics/spc?channel=${encodeURIComponent(channel)}&metric=${encodeURIComponent(metric)}&window=${window}`,
      ),
    psd: (channel: string) =>
      getJSON<PsdCurve>(`/api/analytics/psd?channel=${encodeURIComponent(channel)}`),
    excursions: (params?: { channel?: string; threshold?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.channel) sp.set("channel", params.channel);
      if (params?.threshold != null) sp.set("threshold", String(params.threshold));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return getJSON<Excursion[]>(`/api/analytics/excursions${qs ? `?${qs}` : ""}`);
    },
  },
};

// ────────────────────────────────────────────────────────────────────
// Multipart upload + DELETE helpers — only ingest needs these.
// ────────────────────────────────────────────────────────────────────
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  // Do NOT set Content-Type — the browser fills in the multipart boundary.
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: form,
  });
  if (res.status === 401) {
    handle401();
    throw new Error(`POST ${path} → 401`);
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* response not JSON */
    }
    throw new Error(`POST ${path} → ${detail}`);
  }
  return res.json() as Promise<T>;
}

async function deleteJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 401) {
    handle401();
    throw new Error(`DELETE ${path} → 401`);
  }
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ────────────────────────────────────────────────────────────────────
// Ingest + analytics response shapes — mirror the FastAPI returns
// from services/api/app/routes/{ingest,analytics}.py.
// ────────────────────────────────────────────────────────────────────

export interface ChannelConfigOut {
  channel_name: string;
  display_name: string | null;
  belt: string | null;
  iterations_per_minute: number;
  rows_total: number;
}

export interface ChannelConfigPatch {
  display_name?: string | null;
  belt?: string | null;
  iterations_per_minute?: number;
}

export interface IngestBatchSummary {
  id: string;
  filename: string;
  sha256: string;
  uploaded_at: string | null;
  uploaded_by_user_id: string | null;
  rows_ingested: number;
  rows_skipped: number;
  rows_duplicate: number;
  detected_delimiter: string;
  detected_decimal: string;
  detected_date_format: string | null;
  error_report: Record<string, string>;
  already_ingested: boolean;
}

export type WindowId = "1m" | "5m" | "10m" | "30m" | "1h" | "1d";
export type AnalyticsSeverity = "ok" | "info" | "warn" | "critical";

export interface MetricKpi {
  current: number;
  mean_recent: number;
  std_recent: number;
  mean_all: number;
  std_all: number;
  z: number;
  in_range: boolean;
  severity: AnalyticsSeverity;
}

export interface ChannelSummary {
  channel_name: string;
  display_name: string;
  belt: string | null;
  iterations_per_minute: number;
  rows_total: number;
  first_seen: number;
  last_seen: number;
  online: boolean;
  metrics: Record<string, MetricKpi>;
}

export interface SeriesBandPoint { t: number; v: number; mean: number; std: number }
export interface SeriesWithBands {
  channel: string;
  metric: string;
  window: WindowId;
  points: SeriesBandPoint[];
  baseline: { mean: number; std: number; n: number } | null;
}

export interface SpcPoint {
  t: number; v: number; mean: number;
  ucl1: number; lcl1: number;
  ucl2: number; lcl2: number;
  ucl3: number; lcl3: number;
  z: number;
  severity: AnalyticsSeverity;
}
export interface SpcSeries {
  channel: string;
  metric: string;
  window: WindowId;
  points: SpcPoint[];
}

export interface PsdCurvePoint { size_in: number; passing_pct: number }
export interface PsdCurve {
  channel: string;
  rows_aggregated: number;
  from?: number;
  to?: number;
  sieve_curve: PsdCurvePoint[];
  percentiles: Record<string, number>;
}

export interface Excursion {
  t: number;
  channel: string;
  metric: string;
  value: number;
  baseline: number;
  std: number;
  z: number;
  severity: AnalyticsSeverity;
}
