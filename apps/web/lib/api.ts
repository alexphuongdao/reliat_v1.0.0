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
import type { SessionUser } from "./session.types";
import type {
  AgentThreadDetail,
  AgentThreadSummary,
  Channel,
  Diagnosis,
  Outlier,
  OutlierStatus,
  PsdSnapshot,
  SeriesPoint,
} from "./types";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

/**
 * Every request carries the session cookie. The API is a different origin
 * (port 3300 vs 8000), so the browser only attaches it when we ask with
 * `credentials: "include"` AND the API names our exact origin back in
 * `Access-Control-Allow-Origin` — hence `RELIAT_CORS_ORIGINS` in compose.
 */
const CREDENTIALED: RequestInit = { credentials: "include", cache: "no-store" };

/**
 * A 401 means the session died out from under the page (expired, revoked,
 * or the API restarted). Bounce to login rather than letting screens render
 * an empty state that looks like "this customer has no data".
 */
function guardAuth(res: Response, path: string): void {
  if (res.status === 401 && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
    throw new Error(`unauthenticated on ${path}`);
  }
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, CREDENTIALED);
  guardAuth(res, path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...CREDENTIALED,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  guardAuth(res, path);
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...CREDENTIALED, method: "POST" });
  guardAuth(res, path);
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
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

  diagnoseOutlier: (id: string) =>
    postJSON<Diagnosis>(`/api/outliers/${encodeURIComponent(id)}/diagnose`),

  diagnoses: (id: string) =>
    getJSON<Diagnosis[]>(`/api/outliers/${encodeURIComponent(id)}/diagnoses`),

  /** Durable agent conversations. Tenant-scoped server-side from the session. */
  agentThreads: () => getJSON<AgentThreadSummary[]>("/api/agent/threads"),

  agentThread: (id: string) =>
    getJSON<AgentThreadDetail>(`/api/agent/threads/${encodeURIComponent(id)}`),

  me: () => getJSON<SessionUser>("/api/auth/me"),
};
