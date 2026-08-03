import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser, getOAuthProviders } from "@/lib/session";

export const metadata = { title: "Sign in — Reliat" };

// `proxy.ts` already bounces cookie-holders away from /login, but that check
// is optimistic. This one is authoritative: a stale or forged cookie gets
// here, fails `getCurrentUser()`, and correctly sees the form.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; switch?: string }>;
}) {
  const { next, error, switch: switching } = await searchParams;

  const user = await getCurrentUser();
  // `?switch` means "I know I'm signed in, let me in as someone else".
  if (user && switching === undefined) redirect("/pulse");

  const providers = await getOAuthProviders();

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-0)",
        padding: 24,
      }}
    >
      <LoginForm
        providers={providers}
        next={next && next.startsWith("/") ? next : "/pulse"}
        oauthError={error}
        signedInAs={user ? user.name || user.username : undefined}
      />
    </div>
  );
}
