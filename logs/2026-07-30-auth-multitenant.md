# 2026-07-30 — Credential auth + multi-tenant customers

Plan: `docs/AuthPlan.md`. Before this, anyone who opened the URL got the
CEMEX dataset. Now every request resolves to a user, who belongs to a
customer, who sees only their own plant data.

---

## What changed

### Backend — `services/api`

| File | Change |
|---|---|
| `app/models.py` | New `Tenant`, `User`, `UserSession`, `OAuthAccount`. `Channel` gains `tenant_id`. |
| `app/auth.py` | **new** — Argon2id hashing, server-side sessions, the `Principal` dependency that resolves who is calling and what tenant they may read. |
| `app/oauth.py` | **new** — Authlib provider registry, built from config. |
| `app/bootstrap.py` | **new** — idempotent first-boot creation of the CEMEX tenant + the two profiles. |
| `app/tenancy.py` | **new** — default-tenant constants shared by the three ingest paths. |
| `app/routes/auth.py` | **new** — login/logout/me/providers, OAuth authorize+callback, tenant & user admin. |
| `app/routes/channels.py` | Every endpoint requires a principal and filters by `Channel.tenant_id`. |
| `app/routes/outliers.py` | Same, via a join through `channels`. Ownership is checked *before* `/diagnose` so an unauthorised id can't spend Anthropic credits. |
| `app/routes/usage.py` | Token spend joined through outlier → channel → tenant. |
| `app/main.py` | `SessionMiddleware` (OAuth state), CORS switched to `allow_credentials=True`, auth router mounted, bootstrap on startup. |
| `app/config.py` | Session TTL, cookie policy, seed passwords, OAuth provider config. |
| `app/{seed,etl,ingest_minitab}.py` | Channel creation now assigns a tenant. |
| `alembic/versions/b7f31c904e2a_auth_and_tenancy.py` | **new** migration. |
| `pyproject.toml` | `argon2-cffi`, `authlib`, `itsdangerous`. |

### Frontend — `apps/web`

| File | Change |
|---|---|
| `app/(app)/…` | All six screens moved under a route group; relative imports rewritten to the `@/` alias. URLs unchanged. |
| `app/(app)/layout.tsx` | **new** — owns `AppShell` *and* the authoritative session check. |
| `app/(auth)/login/page.tsx` | **new** — login screen, rendered with no shell. |
| `app/layout.tsx` | Stripped to fonts + `<body>`; no longer wraps everything in `AppShell`. |
| `app/actions/auth.ts` | **new** — login/logout Server Actions. Credentials never touch client JS. |
| `proxy.ts` | **new** — Next 16's renamed middleware. Optimistic cookie check only. |
| `lib/session.ts` / `lib/session.types.ts` | **new** — server-side `getCurrentUser()`/`requireUser()`; types split out so client components can import them. |
| `lib/api.ts` | `credentials: "include"` on every call; a 401 bounces to `/login`. |
| `components/auth/LoginForm.tsx` | **new**. |
| `components/shell/AccountMenu.tsx` | **new** — replaces the hardcoded "You" chip. |
| `components/shell/AppShell.tsx` | Takes a `user` prop; top bar shows the real tenant instead of "Karingal Pit · West". |
| `app/(app)/outliers/page.tsx` | **Bug fix** — see below. |

### Ops

`docker-compose.yml` and `.env.example` gained the auth and OAuth env vars;
the `web` container gained `API_INTERNAL_BASE=http://api:8000` for
server-to-server calls.

---

## Decisions worth remembering

**The API owns identity, not Next.js.** Every row a customer can see is
behind FastAPI, so the tenant filter has to live in the query layer
regardless of who issues the credential. Putting sessions in the Node tier
would have created a second place that decides "which tenant is this?" — two
sources of truth for a security boundary.

**Opaque sessions, not JWTs.** An admin has to be able to kill a session
(fired operator, lost laptop). A JWT stays valid until it expires. Verified:
a token copied before logout returns 401 after.

**`tenant_id` lives only on `channels`.** Measurements, outliers and
diagnoses all hang off a channel, so one column scopes the whole tree.
Denormalising it onto four tables would be faster to query and would add
three more places a bug could file a row under the wrong customer.

**404, not 403, on cross-tenant ids.** A 403 confirms the id exists. CEMEX
should not be able to enumerate another customer's channel ids.

---

## Bug found during verification

Logged in as a brand-new tenant with zero channels, the Outliers screen
still showed 12 outliers of CEMEX-shaped data.

Cause: `app/(app)/outliers/page.tsx` had

```ts
if (o.length) setOutliers(o);   // only replace mock when non-empty
```

which conflates *"the API didn't answer"* with *"the API answered with
nothing"*. That was harmless when there was one global dataset. The moment a
tenant boundary exists, an empty response is the **correct** answer for a new
customer — and falling back to the demo mock shows them another plant's
numbers, with no way to tell it's fake.

Fixed to set state unconditionally on success; the mock now only survives an
actual fetch rejection.

---

## Second bug: no way to switch accounts

Reported as "the admin account does not work". It wasn't — `admin` /
`Admin-Reliat-2026!` returned 200 the whole time.

The actual fault: `proxy.ts` redirected `/login` → `/pulse` whenever a
session cookie existed. Signed in as `cemex`, going to `/login` to try the
admin profile silently bounced you back into CEMEX, with no form and no
error. The only sign-out control was hidden inside the account-menu
dropdown. It looks exactly like a broken account.

Fixed:

- `proxy.ts` and the login page let `/login?switch=1` through with a live
  session; the form then says "Currently signed in as X".
- **Switch account** added to the account menu.
- `app/actions/auth.ts` now revokes the *previous* session when a login
  replaces it. Without that, overwriting the cookie left the old session row
  valid server-side — a live session nobody could see or revoke. Verified:
  the `cemex` session went to `revoked` the moment `admin` signed in.

Worth noting the general shape: the auth was correct and the *reachability*
of it was not. Every check I'd run was an API check.

## Verified

Backend, via curl:

| Check | Result |
|---|---|
| Unauthenticated `/api/channels` | 401 |
| Wrong password | 401 (same message + cost as unknown user) |
| `cemex` login | owner of CEMEX, 12 channels, 500 outliers |
| `admin` login | superadmin, `allTenants: true`, sees all 12 |
| New tenant `acme` → channels / outliers | `[]` / `[]` |
| `acme` GET CEMEX channel `cv42` series / psd | 404 / 404 |
| `acme` PATCH a CEMEX outlier | 404 |
| `acme` list a CEMEX outlier's diagnoses | 404 |
| `cemex` same two calls | 200 / 200 |
| Token reused after logout | 401 |

Frontend, in Chrome:

- `/outliers` while logged out → redirect to `/login?next=/outliers`
- Wrong password → inline error, no redirect
- Correct password → lands on `/outliers` (honours `next`), 1,513 real
  outliers with real ids (`OUT-2D0F6591C525`), breadcrumb reads "CEMEX"
- Account menu shows real name, email, `OWNER` badge, tenant
- Sign out → back to `/login`; session revoked server-side
- Logged in as `acme` → "0 of 0 outliers", empty state
- Data migration: all 12 pre-existing channels backfilled to CEMEX, no rows
  lost

---

## Still open

- **Other screens still render `buildMock()`.** Pulse, Channels, Agent and
  Library are unchanged by this work, so they show the same fabricated plant
  regardless of who logs in. Only Outliers reads the API. This is visible in
  a demo — `acme` has an empty Outliers inbox but a fully populated Pulse.
- **⌘K palette is mock-fed**, from the layout's `buildMock()`, so it lists
  CEMEX channel names to every tenant.
- No self-service signup, password reset, MFA, or login rate limiting.
- No UI for creating tenants/users — API only (`POST /api/auth/tenants`,
  `POST /api/auth/tenants/{id}/users`).
- Superadmin tenant-pinning works over the API (`?tenant=<slug>`) but has no
  UI switcher.
- A hydration warning (React #418) appears in the console on the Outliers
  route; pre-existing, unrelated to auth, harmless but worth cleaning up.
