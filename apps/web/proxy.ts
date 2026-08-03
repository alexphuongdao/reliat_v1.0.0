/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` — same mechanism.
 *
 * This is an OPTIMISTIC check only, per the Next auth guide: it looks at
 * whether a session cookie exists and nothing more. It never calls the API
 * and never reads the database, because it runs on every request including
 * prefetches.
 *
 * The real gate is `getCurrentUser()` in `app/(app)/layout.tsx`, which asks
 * the API whether the session is actually valid. A forged cookie gets past
 * this file and is stopped there.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "reliat_session";
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.nextUrl);
    // Remember where they were headed so login can send them back.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users don't need the login page — except when they're
  // deliberately switching accounts. Without this exception there is no way
  // to reach a login form once a session exists (the sign-out control is
  // behind the account menu), which reads as "that other account is broken".
  const switching = request.nextUrl.searchParams.has("switch");
  if (hasSession && isPublic && !switching) {
    return NextResponse.redirect(new URL("/pulse", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets. Auth wants broad coverage.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp)$).*)"],
};
