"use client";

/**
 * OAuth landing page. The FastAPI callback redirects browsers here with
 * the JWT in the URL fragment (#token=...). We read it, store it via
 * the auth context, and bounce to /pulse.
 *
 * The fragment is preferred over a query string because fragments are
 * never sent to servers and don't appear in access logs.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth";

export default function OAuthCallbackPage() {
  const { adoptToken } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const token = params.get("token");
    if (!token) {
      setError("No token returned from the provider.");
      return;
    }

    // Clear the fragment so the token never lingers in the address bar.
    window.history.replaceState(null, "", "/auth/callback");

    adoptToken(token)
      .then(() => router.replace("/pulse"))
      .catch(() => setError("Sign-in failed while validating the token."));
  }, [adoptToken, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--surface-0)",
        color: "var(--text-2)",
        fontSize: "var(--fs-sm)",
      }}
    >
      {error ?? "Finishing sign-in…"}
    </div>
  );
}
