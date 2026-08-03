"use server";

/**
 * Login/logout as Server Actions.
 *
 * Credentials go browser → Next server → API. They are never handled by
 * client-side JavaScript, and the session cookie the API returns is copied
 * onto the Next response so it lands httpOnly in the browser.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";

const INTERNAL_BASE = (
  process.env.API_INTERNAL_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8000"
).replace(/\/$/, "");

export interface LoginState {
  error?: string;
}

/** Only allow same-origin relative paths through `?next=` — an open
 *  redirect on a login form is a phishing primitive. */
function safeNext(next: FormDataEntryValue | null): string {
  const raw = typeof next === "string" ? next : "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/pulse";
}

export async function login(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!username || !password) {
    return { error: "Enter a username and password." };
  }

  let res: Response;
  try {
    res = await fetch(`${INTERNAL_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
  } catch {
    return { error: "Can't reach the API. Is the stack running?" };
  }

  if (res.status === 401) return { error: "Invalid username or password." };
  if (res.status === 403) return { error: "That account is disabled." };
  if (!res.ok) return { error: `Login failed (${res.status}).` };

  // Lift the API's Set-Cookie onto our own cookie jar. Reading the value out
  // and re-setting it (rather than forwarding the raw header) keeps the
  // attributes under this app's control.
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /reliat_session=([^;]+)/.exec(setCookie);
  if (!match) return { error: "Login succeeded but no session was issued." };

  const jar = await cookies();

  // Switching accounts: the previous session row would otherwise stay valid
  // server-side even though its cookie has been overwritten — an orphaned
  // live session nobody can see or revoke.
  const previous = jar.get(SESSION_COOKIE)?.value;
  if (previous && previous !== match[1]) {
    try {
      await fetch(`${INTERNAL_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${previous}` },
        cache: "no-store",
      });
    } catch {
      // Non-fatal: the new session below still takes effect.
    }
  }

  jar.set(SESSION_COOKIE, match[1], {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 3600,
  });

  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      // Revoke server-side too — deleting only the cookie would leave a live
      // session row that a copied token could still use.
      await fetch(`${INTERNAL_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
        cache: "no-store",
      });
    } catch {
      // Best effort — still clear the cookie below.
    }
  }

  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
