"use client";

/**
 * Wraps protected routes. While the auth state resolves on first paint,
 * we render a minimal full-surface placeholder so the AppShell chrome
 * never flashes for anonymous users. Once we know there's no user,
 * push them to /login.
 */
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useAuth } from "../../lib/auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--surface-0)",
        }}
      />
    );
  }
  return <>{children}</>;
}
