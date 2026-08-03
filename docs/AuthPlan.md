# Auth + Multi-Tenancy Plan

**Status:** implemented (2026-07-30) — see `logs/2026-07-30-auth-multitenant.md`
for what actually shipped.

Goal: stop serving one hardcoded dataset to whoever opens the URL. Every
request must resolve to *a user*, who belongs to *a customer*, who sees
*only their own plant data*.

---

## The short answer on "do you need a database for credentials?"

**No new database.** We already run Postgres (`pgvector/pgvector:pg16`) in
compose, and all the domain data lives there. Identity goes in the same
database as four new tables. One database, one migration system (alembic),
one backup story. Adding a second store (Auth0, a separate auth DB) would
mean the tenant boundary lives in one system while the data it protects
lives in another — that's the failure mode that leaks customer data.

---

## Where auth lives, and why

The API owns identity. Not the Next.js app.

Every row a customer can see is behind FastAPI. Tenant isolation therefore
*has* to be enforced in the SQLAlchemy query layer — no matter who issues
the credential. If Next.js owned sessions, FastAPI would still need its own
verification path, and we'd have two places that decide "which tenant is
this?" Two sources of truth for a security boundary is how tenants leak
into each other.

So: FastAPI authenticates, FastAPI issues the session, FastAPI scopes every
query. Next.js is a client that holds a cookie and renders a login form.

### Libraries

Modern and boring, not hand-rolled crypto:

| Concern | Choice | Why |
|---|---|---|
| Password hashing | **argon2-cffi** (Argon2id) | OWASP's current first recommendation. Reference implementation, no wrapper indirection. Handles `verify` + `check_needs_rehash` for painless parameter upgrades. |
| Session | **DB-backed opaque token**, httpOnly cookie | Revocable server-side (JWTs are not). Next.js' own auth guide calls this the more secure of the two options. Lookup cost is one indexed query — irrelevant at our scale. |
| OAuth / OIDC | **Authlib** | The standard Python OAuth client. Generic OIDC discovery means adding Google, Microsoft Entra ID, or a customer's own IdP is config, not code. |

Deliberately **not** using NextAuth/Better Auth/Clerk: they'd put identity
in the Node tier, away from the data they're protecting (see above), and
Clerk/Auth0 add a per-seat cost and an external dependency before we have a
single paying customer.

### Why opaque sessions instead of JWT

An admin needs to be able to kill a session — a fired plant operator, a
leaked laptop. A JWT stays valid until it expires; there is no revoke.
Opaque token → row in `sessions` → `DELETE` is instant logout everywhere.
When we eventually need stateless verification across services, the JWT
layer sits on top of this, not instead of it.

---

## Data model

Four new tables, plus one column on an existing table.

```
tenants          the customer (CEMEX, next customer, …)
  id, slug, name, active, created_at

users            a person who logs in
  id, tenant_id → tenants (NULL = platform staff), email, username,
  password_hash, name, role, active, created_at, last_login_at

sessions         one live login
  id, user_id → users, token_hash, created_at, expires_at,
  last_seen_at, revoked_at, ip, user_agent

oauth_accounts   an external identity linked to a user
  id, user_id → users, provider, provider_account_id, email, created_at

channels         + tenant_id → tenants        (NEW COLUMN)
```

### Why `tenant_id` goes on `channels` and nowhere else

`measurements`, `outliers`, and `outlier_diagnoses` all hang off
`channels` by foreign key. Tagging the channel scopes the entire tree
through a join. Copying `tenant_id` onto every table would be faster to
query but adds three more places where a bug can put a row in the wrong
tenant. One owner, joined — correctness over a join we don't need to
optimise yet.

### Roles

| Role | `tenant_id` | Sees |
|---|---|---|
| `superadmin` | `NULL` | Every tenant. Can create tenants and users. |
| `owner` | set | Their tenant. Can manage their tenant's users. |
| `member` | set | Their tenant, read + triage. |

The token stores nothing but the session ID. Role and tenant are read from
the database on every request, so a demotion takes effect immediately
rather than at token expiry.

---

## Request flow

```
Browser (localhost:3300)                 API (localhost:8000)
   │
   ├─ POST /api/auth/login ─────────────▶ verify Argon2id hash
   │                                      create sessions row
   │  ◀───── Set-Cookie: reliat_session   (httpOnly, SameSite=Lax)
   │
   ├─ GET /api/outliers  (cookie) ──────▶ resolve session → user → tenant
   │                                      WHERE channels.tenant_id = :tenant
   │  ◀───── only that tenant's rows
```

Cookies ignore port, so `localhost:3300` and `localhost:8000` share a
cookie jar and `SameSite=Lax` is satisfied (same site — the port is not
part of the site). CORS moves to `allow_credentials=True` with an explicit
origin list; the wildcard origin is illegal alongside credentials, which is
the correct constraint.

In production both halves sit under one registrable domain
(`app.reliat.com` / `api.reliat.com`) so the same cookie policy holds with
`Domain=.reliat.com` and `Secure`.

### The OAuth layer

`GET /api/auth/oauth/{provider}/authorize` → provider consent screen →
`GET /api/auth/oauth/{provider}/callback` → look up `oauth_accounts` →
issue exactly the same session cookie as a password login.

OAuth is an *additional* way to obtain a session, never a second session
system. Providers are configured, not coded:

```
RELIAT_OAUTH_GOOGLE_CLIENT_ID / _SECRET
RELIAT_OAUTH_MICROSOFT_CLIENT_ID / _SECRET / _TENANT
```

Unconfigured providers are simply absent from `/api/auth/providers`, and
the login page renders no button for them. So the layer ships wired and
dormant — the day CEMEX wants Entra ID SSO it's two env vars, not a
sprint.

**Deliberate constraint:** OAuth logins only work for an email that already
maps to a provisioned user. No self-signup. A stranger with a Google
account must not be able to create themselves an account and land inside a
customer's plant data.

---

## Frontend (Next.js 16)

> Next 16 renamed `middleware.ts` to **`proxy.ts`**. Same mechanism, and
> the docs are explicit that it is for *optimistic* checks only.

- `app/(app)/…` — every existing screen, moved under a route group so
  `AppShell` wraps only authenticated surfaces. Route group parentheses
  don't appear in URLs, so `/pulse`, `/outliers`, … are unchanged.
- `app/(auth)/login` — credential form (Server Action) + OAuth buttons,
  rendered with no shell.
- `proxy.ts` — cookie-presence check, redirects to `/login`. Fast, and
  wrong on its own — it never touches the database.
- `app/(app)/layout.tsx` — the *real* check: server-side `GET /api/auth/me`
  with the cookie forwarded. This is the gate that matters.
- `lib/api.ts` — every fetch gains `credentials: "include"`; a `401`
  bounces to `/login`.

Two layers because the Next docs say so, and they're right: the proxy is a
UX shortcut, the layout check is the security boundary.

---

## Seeded profiles

Created idempotently at API startup — see `docs/manual.md` for the actual
credentials.

| Profile | Role | Tenant | Sees |
|---|---|---|---|
| `cemex` | `owner` | CEMEX | The existing CEMEX PSD data |
| `admin` | `superadmin` | — | All tenants |

Passwords are env-overridable (`RELIAT_SEED_CEMEX_PASSWORD`,
`RELIAT_SEED_ADMIN_PASSWORD`) and defaulted for local demo only. The
defaults are in a git-tracked doc, which makes them public — they are demo
credentials against demo data, and the first thing to change before this
faces a real network.

---

## Migration of existing data

The database already holds real ingested CEMEX measurements. The migration
must not drop them:

1. Create the four tables.
2. Add `channels.tenant_id`, nullable.
3. Insert the CEMEX tenant.
4. `UPDATE channels SET tenant_id = <cemex>` — every existing channel is
   CEMEX data, because CEMEX is the only customer so far.
5. Make the column `NOT NULL`.

Reversible in `downgrade()`. No data loss, no reseed.

---

## What this explicitly does not do yet

Named so nobody assumes otherwise:

- **No self-service signup.** Users are provisioned by a superadmin.
- **No password reset email.** No mail transport is wired up.
- **No MFA.** Next after SSO, and largely obviated by it.
- **No per-channel permissions.** Tenant is the only boundary; everyone
  inside a tenant sees all of that tenant's channels.
- **No audit log.** `sessions` records logins, which is a start, not an
  audit trail.
- **No rate limiting on login.** Argon2id makes offline cracking expensive
  but does nothing about online guessing. Needed before public exposure.
