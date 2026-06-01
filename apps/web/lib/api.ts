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
};
