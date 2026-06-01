"use client";

/**
 * Sign-in surface. Renders the brand mark, password fields, and any
 * OAuth provider buttons the backend has configured (queried via
 * /api/auth/providers). New file; reuses tokens + Button + Input.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "../ui";
import { useAuth } from "../../lib/auth";
import { Input } from "../auth/Input";
import { GitHubGlyph, GoogleGlyph } from "../auth/OAuthLogos";

export function LoginScreen() {
  const { login, oauthLogin, providers, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If we're already signed in (e.g. visiting /login with a valid token),
  // bounce to the landing surface.
  useEffect(() => {
    if (status === "authenticated") router.replace("/pulse");
  }, [status, router]);

  // Surface OAuth callback errors (?error=oauth | ?error=email).
  useEffect(() => {
    const e = params.get("error");
    if (e === "oauth") setError("OAuth provider declined the request — please try again.");
    else if (e === "email") setError("That provider didn't return a usable email address.");
  }, [params]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/pulse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return <AuthShell error={error}>
    <h1
      style={{
        margin: 0,
        fontSize: "var(--fs-xl)",
        fontWeight: "var(--fw-semibold)" as unknown as number,
        color: "var(--text-1)",
        letterSpacing: "-0.01em",
      }}
    >
      Sign in
    </h1>
    <p
      style={{
        margin: "4px 0 20px",
        fontSize: "var(--fs-sm)",
        color: "var(--text-3)",
      }}
    >
      Welcome back to Reliat.
    </p>

    {providers?.password !== false && (
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={submitting}
          style={{ marginTop: 4, justifyContent: "center", width: "100%" }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    )}

    {(providers?.google || providers?.github) && (
      <Divider label="or continue with" />
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {providers?.google && (
        <Button
          variant="secondary"
          size="lg"
          onClick={() => oauthLogin("google")}
          style={{ justifyContent: "center", width: "100%", gap: 10 }}
        >
          <GoogleGlyph size={16} />
          Continue with Google
        </Button>
      )}
      {providers?.github && (
        <Button
          variant="secondary"
          size="lg"
          onClick={() => oauthLogin("github")}
          style={{ justifyContent: "center", width: "100%", gap: 10 }}
        >
          <GitHubGlyph size={16} />
          Continue with GitHub
        </Button>
      )}
    </div>

    <p
      style={{
        marginTop: 22,
        fontSize: "var(--fs-sm)",
        color: "var(--text-3)",
        textAlign: "center",
      }}
    >
      No account?{" "}
      <Link
        href="/register"
        style={{ color: "var(--accent)", fontWeight: "var(--fw-medium)" as unknown as number }}
      >
        Create one
      </Link>
    </p>
  </AuthShell>;
}

// ───────────────────────────────────────────────────────────────────
// Shared layout chrome for login/register — kept inline here because
// it's only used by these two screens.

export function AuthShell({ children, error }: { children: React.ReactNode; error?: string | null }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-0)",
        padding: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 24,
          color: "var(--text-1)",
        }}
      >
        <BrandMark />
        <span
          style={{
            fontSize: "var(--fs-md)",
            fontWeight: "var(--fw-semibold)" as unknown as number,
            letterSpacing: "0.02em",
          }}
        >
          Reliat
        </span>
      </div>

      <div
        className="panel"
        style={{
          width: "100%",
          maxWidth: 380,
          padding: "28px 28px 24px",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
        }}
      >
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              background: "var(--sev-crit-dim)",
              color: "var(--sev-crit)",
              border: "1px solid var(--sev-crit-dim)",
              borderRadius: "var(--r-sm)",
              fontSize: "var(--fs-sm)",
            }}
          >
            {error}
          </div>
        )}
        {children}
      </div>

      <p
        style={{
          marginTop: 20,
          fontSize: "var(--fs-xs)",
          color: "var(--text-4)",
        }}
      >
        Mining intelligence · v1.0.0
      </p>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "22px 0 16px",
        color: "var(--text-4)",
        fontSize: "var(--fs-xs)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

function BrandMark() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        display: "grid",
        placeItems: "center",
        background: "var(--accent-dim)",
        color: "var(--accent-bright)",
        border: "1px solid var(--accent-line)",
        borderRadius: "var(--r-sm)",
        fontSize: 14,
        fontWeight: "var(--fw-semibold)" as unknown as number,
      }}
    >
      R
    </div>
  );
}
