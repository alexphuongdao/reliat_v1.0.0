/**
 * Server-side session verification.
 *
 * Server-only by construction: `next/headers` throws if this module is ever
 * pulled into a client component, so no `server-only` package is needed.
 * Types live in `session.types.ts` precisely so client code can import them
 * without touching this file.
 *
 * This is the check that actually matters. `proxy.ts` does a cookie-presence
 * check for speed, but a cookie can be forged/stale — only the API can say
 * whether a session is real, so every protected render goes through here.
 *
 * Two different base URLs, deliberately:
 *   - `API_INTERNAL_BASE` — server→server, inside the compose network
 *     (`http://api:8000`). `localhost` from inside the web container is the
 *     web container, not the API.
 *   - `NEXT_PUBLIC_API_BASE` — what the browser uses.
 */
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

export type { OAuthProvider, SessionTenant, SessionUser } from "./session.types";

import type { OAuthProvider, SessionUser } from "./session.types";

export const SESSION_COOKIE = "reliat_session";

const INTERNAL_BASE = (
  process.env.API_INTERNAL_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8000"
).replace(/\/$/, "");

/**
 * Resolve the current user, or null. `cache()` dedupes this across a single
 * render pass so the layout and any page can both call it for one round trip.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${INTERNAL_BASE}/api/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    // API unreachable — treat as unauthenticated rather than rendering a
    // shell with no data behind it.
    return null;
  }
});

/** Same, but bounce to /login instead of returning null. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Which OAuth buttons to render. Empty unless a provider is configured. */
export async function getOAuthProviders(): Promise<OAuthProvider[]> {
  try {
    const res = await fetch(`${INTERNAL_BASE}/api/auth/providers`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as OAuthProvider[];
  } catch {
    return [];
  }
}
