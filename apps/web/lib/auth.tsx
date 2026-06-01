"use client";

/**
 * Auth context — single source of truth for "is there a user signed in?"
 *
 * Token is kept in localStorage under `reliat.token`; the user object is
 * hydrated from `/api/auth/me` on mount. Components read state via
 * `useAuth()`. API calls in `lib/api.ts` read the token directly from
 * storage so they don't depend on this context being available.
 *
 * Trade-off acknowledged: localStorage is XSS-readable. We're on
 * cross-site (*.vercel.app ↔ *.up.railway.app), so httpOnly cookies cost
 * more than they buy right now. The hardening swap (cookie + same
 * registrable domain) is documented in CLAUDE.md.
 */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AuthProviders, UserOut } from "./types";

const TOKEN_KEY = "reliat.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  user: UserOut | null;
  providers: AuthProviders | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Begin an OAuth redirect dance — backend handles the rest. */
  oauthLogin: (provider: "google" | "github") => void;
  /** Adopt an externally issued token (used by /auth/callback). */
  adoptToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail;
    } catch {
      /* response wasn't JSON */
    }
    throw new Error(detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<UserOut | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  // On mount: fetch provider availability (for the login screen buttons),
  // and if a token is in storage, ask the backend who we are.
  useEffect(() => {
    let cancelled = false;

    fetchJSON<AuthProviders>("/api/auth/providers")
      .then((p) => {
        if (!cancelled) setProviders(p);
      })
      .catch(() => {
        // Non-fatal — login screen just won't show OAuth buttons.
        if (!cancelled) setProviders({ google: false, github: false, password: true });
      });

    const token = getToken();
    if (!token) {
      setStatus("anonymous");
      return;
    }
    fetchJSON<UserOut>("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus("authenticated");
      })
      .catch(() => {
        // Token is stale or invalid — wipe and fall back to anonymous.
        clearToken();
        if (!cancelled) {
          setUser(null);
          setStatus("anonymous");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const adoptToken = useCallback(async (token: string) => {
    setToken(token);
    setStatus("loading");
    const u = await fetchJSON<UserOut>("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    setUser(u);
    setStatus("authenticated");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetchJSON<{ access_token: string; user: UserOut }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      setToken(res.access_token);
      setUser(res.user);
      setStatus("authenticated");
    },
    [],
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await fetchJSON<{ access_token: string; user: UserOut }>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify({ email, username, password }) },
      );
      setToken(res.access_token);
      setUser(res.user);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const oauthLogin = useCallback((provider: "google" | "github") => {
    // Top-level navigation — Authlib needs a real redirect, not a fetch,
    // so the state cookie + provider redirect chain works.
    window.location.assign(`${API_BASE}/api/auth/${provider}/login`);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, providers, login, register, logout, oauthLogin, adoptToken }),
    [status, user, providers, login, register, logout, oauthLogin, adoptToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
