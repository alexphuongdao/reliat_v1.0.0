# 2026-08-12 — Demo hardening

Fixing what the audit in `logs/2026-08-12-pre-demo-audit.md` found, ahead of a
real customer demo. One tagged commit per working state so progress is
traceable; this file is updated per commit.

| Version | What landed | Suite |
|---|---|---|
| `v1.0.1` | Baseline: per-tenant harness, honest empty states, architecture docs | 27 pass / 3 xfail |
| `v1.0.2` | Cross-tenant leak test over every route | 31 pass / 3 xfail |

---

## v1.0.2 — cross-tenant leak test

### The gap it closes

`test_route_isolation.py` proved every route **requires a principal**. That is
weaker than it sounds: a route can authenticate perfectly and then run an
unscoped query. It passes that test and leaks every customer's data.

Isolation today is per-route discipline — the same two lines copy-pasted into
eight handlers:

```python
if principal.tenant_id is not None:
    q = q.filter(Channel.tenant_id == principal.tenant_id)
```

Every one is correct right now. Nothing structural keeps the ninth one honest.

### What changed

| File | Change |
|---|---|
| `services/api/tests/test_cross_tenant_leak.py` | New. Seeds two tenants, signs in as ALPHA through the real session machinery, and asserts no response ever contains BRAVO data. |

Routes are **enumerated from the app**, not listed — the failure this exists to
catch is a route someone adds later, and a hand-written list is guaranteed to
omit exactly the one that matters. A parameterised route with no entry in
`PARAM_VALUES` fails the test rather than being silently skipped.

Three assertions:

1. Every parameterised route returns **404** for BRAVO's ids.
2. No response body from any route contains a BRAVO marker string.
3. ALPHA can still see its own data — a boundary that returns nothing to anyone
   would pass 1 and 2.

### Decisions worth remembering

**Scan whole response bodies, not parsed fields.** Checking specific keys would
miss a leak through a field added later. The markers (`chan-bravo`,
`BRAVO SECRET CHANNEL`, `bravo-confidential-root-cause`) are unique enough that
a substring scan over `res.text` is the stronger assertion.

**404 for data routes, 403 for admin routes — and the difference is tested.**
`POST /api/auth/tenants/{tenant_id}/users` answers 403, which normally would be
an enumeration oracle. It is safe here only because `_require_admin_of` runs
*before* the existence lookup, so the response is identical for a real and a
fake tenant. Rather than trusting that, `test_admin_routes_do_not_confirm_
whether_a_tenant_exists` calls it with BRAVO's id and with a ghost id and
asserts the status codes match.

**The diagnose route is called cross-tenant but not same-tenant.** A real call
would hit the Anthropic API — billable, non-deterministic, offline in CI. The
cross-tenant half still runs, because `_owned_outlier` raises 404 long before
any model call, which is exactly the property under test.

### Bug found during verification

**`StaticPool` is required for the in-memory database.** Without it every
SQLAlchemy session opens its own connection, and each connection to
`sqlite:///:memory:` gets its own empty database. Everything seeded in
`setUpClass` was invisible to the request handlers:

```
sqlalchemy.exc.OperationalError: no such table: sessions
```

**A route existed that I had not seen.** The enumeration immediately surfaced
`POST /api/auth/tenants/{tenant_id}/users`, which takes a tenant id straight
off the path. It is correctly guarded — but it is precisely the shape of route
that a hand-written test list would have missed.

**422 masked the authorization check.** Posting `{}` failed body validation
before reaching `_require_admin_of`, so the test was asserting on the wrong
code path. Fixed with `VALID_BODIES` — a body valid enough to reach the guard.

### Verified

A security test that cannot fail is worthless, so the filters were deliberately
sabotaged to confirm it catches a real leak.

| Check | Result |
|---|---|
| Full suite, clean tree | **31 passed, 3 xfailed** (was 27/3) |
| Sabotage `owned_channel`'s tenant filter | **FAIL** — `GET /api/channels/chan-bravo/series returned 200, expected 404`, with the leaked body in the message |
| Sabotage `list_channels`' tenant filter | **FAIL** — `GET /api/channels leaked 'chan-bravo' from tenant BRAVO (status 200)` |
| Restore both | `git diff` empty, 31 passed again |

Both halves of the test — the 404 check and the marker scan — were shown to
catch a leak independently.

### Still open

- This tests **HTTP responses**. It cannot catch a leak through a background
  job, a log line, or the agent's prompt. Those need their own tests.
- Still one shared database with `tenant_id` columns. RLS is the next real
  hardening step; DB-per-tenant is designed in `docs/PlatformArchitecture.md`
  §2.2 but not built.
- `NOT_TENANT_SCOPED` is a hand-maintained allowlist. It is small and each
  entry is deliberate, but it is the one part of this test that can rot.
