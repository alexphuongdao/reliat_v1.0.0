"use client";

/**
 * Account creation surface. Reuses AuthShell from LoginScreen so the
 * brand chrome stays identical across the two pages.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "../ui";
import { useAuth } from "../../lib/auth";
import { Input } from "../auth/Input";
import { GitHubGlyph, GoogleGlyph } from "../auth/OAuthLogos";
import { AuthShell } from "./LoginScreen";

export function RegisterScreen() {
  const { register, oauthLogin, providers, status } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/pulse");
  }, [status, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await register(email.trim(), username.trim(), password);
      router.replace("/pulse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
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
      Create account
    </h1>
    <p
      style={{
        margin: "4px 0 20px",
        fontSize: "var(--fs-sm)",
        color: "var(--text-3)",
      }}
    >
      Set up your Reliat workspace.
    </p>

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
        label="Username"
        autoComplete="username"
        required
        minLength={1}
        maxLength={64}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 8 characters."
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={submitting}
        style={{ marginTop: 4, justifyContent: "center", width: "100%" }}
      >
        {submitting ? "Creating account…" : "Create account"}
      </Button>
    </form>

    {(providers?.google || providers?.github) && (
      <>
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
          <span>or sign up with</span>
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
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
      </>
    )}

    <p
      style={{
        marginTop: 22,
        fontSize: "var(--fs-sm)",
        color: "var(--text-3)",
        textAlign: "center",
      }}
    >
      Already have an account?{" "}
      <Link
        href="/login"
        style={{ color: "var(--accent)", fontWeight: "var(--fw-medium)" as unknown as number }}
      >
        Sign in
      </Link>
    </p>
  </AuthShell>;
}
