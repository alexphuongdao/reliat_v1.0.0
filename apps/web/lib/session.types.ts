/**
 * Session shapes, split out from `session.ts` because that module is
 * `server-only` — client components need the types without pulling in a
 * module that throws when bundled for the browser.
 */
export interface SessionTenant {
  id: string;
  slug: string;
  name: string;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "superadmin" | "owner" | "member";
  tenant: SessionTenant | null;
  /** True when this principal sees every tenant rather than one. */
  allTenants: boolean;
}

export interface OAuthProvider {
  id: string;
  label: string;
}
