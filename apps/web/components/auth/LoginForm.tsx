"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import type { OAuthProvider } from "@/lib/session";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

// Errors the API bounces back through `?error=` on the OAuth callback.
const OAUTH_ERRORS: Record<string, string> = {
  oauth_failed: "That sign-in didn't complete. Try again.",
  oauth_no_email: "The provider didn't share an email address.",
  oauth_not_provisioned:
    "No Reliat account is linked to that address. Ask an admin to provision it first.",
  account_disabled: "That account is disabled.",
};

export function LoginForm({
  providers,
  next,
  oauthError,
  signedInAs,
}: {
  providers: OAuthProvider[];
  next: string;
  oauthError?: string;
  /** Set when arriving via "Switch account" with a live session. */
  signedInAs?: string;
}) {
  const [state, action, pending] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined,
  );

  const error =
    state?.error ?? (oauthError ? OAUTH_ERRORS[oauthError] ?? "Sign-in failed." : undefined);

  return (
    <div style={{ width: "min(400px, 92vw)" }}>
      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg, var(--accent) 0%, #2D6F7A 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#062028", fontWeight: 700,
            fontFamily: "var(--font-mono)", fontSize: 15,
          }}
        >
          R
        </div>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Reliat
        </span>
      </div>

      <h1 style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 600, letterSpacing: "-0.015em" }}>
        Sign in
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-3)" }}>
        Plant intelligence for your operation.
      </p>

      {signedInAs && (
        <div
          style={{
            marginBottom: 18,
            fontSize: 12.5,
            color: "var(--text-2)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-sm)",
            padding: "9px 11px",
          }}
        >
          Currently signed in as <strong>{signedInAs}</strong>. Signing in
          below switches accounts.
        </div>
      )}

      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input type="hidden" name="next" value={next} />

        <Field label="Username or email">
          <input
            name="username"
            autoComplete="username"
            autoFocus
            required
            style={inputStyle}
          />
        </Field>

        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </Field>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12.5,
              color: "#F0857A",
              background: "rgba(240,133,122,0.08)",
              border: "1px solid rgba(240,133,122,0.25)",
              borderRadius: "var(--r-sm)",
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{
            marginTop: 4,
            padding: "10px 14px",
            background: "var(--accent)",
            color: "#062028",
            border: "none",
            borderRadius: "var(--r-sm)",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            transition: "opacity var(--t-instant)",
          }}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {providers.length > 0 && (
        <>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              margin: "20px 0 16px",
              fontSize: 11, color: "var(--text-4)",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            or
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {providers.map((p) => (
              <a
                key={p.id}
                href={`${API_BASE}/api/auth/oauth/${p.id}/authorize`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "9px 14px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--r-sm)",
                  fontSize: 13, color: "var(--text-1)",
                  textDecoration: "none",
                }}
              >
                Continue with {p.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--r-sm)",
  color: "var(--text-1)",
  fontSize: 13.5,
  fontFamily: "inherit",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
