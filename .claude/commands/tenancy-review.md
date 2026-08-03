---
description: Audit every API route and query for tenant isolation — the boundary that keeps one customer out of another's plant data.
argument-hint: "[optional: file or route to focus on]"
---

# Tenancy review

Reliat is multi-tenant. `tenant_id` lives **only** on `channels`;
`measurements`, `outliers` and `outlier_diagnoses` inherit ownership through
a foreign key to a channel. Every read and write must be scoped through that
chain. Design notes: `docs/AuthPlan.md`.

A single unscoped query leaks one customer's plant data to another. This is
the highest-severity defect class in this repo.

Focus: $1 (if empty, audit every route under `services/api/app/routes/`).

## Check each endpoint

1. **Does it require a principal?** Every data route needs
   `principal: Principal = Depends(get_principal)`. A route without it is
   readable by anyone on the network. `/api/health` and
   `/api/auth/{login,providers,session-status}` are the only legitimate
   exceptions.

2. **Is every query filtered?** For each `session.query(...)` / `select(...)`
   in the handler, confirm it is constrained by the caller's tenant:
   - `Channel` → `.filter(Channel.tenant_id == principal.tenant_id)`
   - `Outlier`, `Measurement` → join `Channel`, filter on
     `Channel.tenant_id`
   - `OutlierDiagnosis` → join `Outlier` → `Channel`, filter on
     `Channel.tenant_id`

3. **Is the superadmin case deliberate?** `principal.tenant_id is None` means
   "all tenants" and correctly skips the filter. Confirm each such skip is
   intentional and reachable *only* by `role == "superadmin"` — never as a
   fallback when a lookup returned nothing.

4. **Does it 404 rather than 403 on a cross-tenant id?** A 403 confirms the
   id exists, which lets one customer enumerate another's channel ids. Use
   the `_owned_*` helpers.

5. **Is ownership checked before expensive or destructive work?**
   `POST /api/outliers/{id}/diagnose` spends real Anthropic credits — the
   ownership check must come *before* the model call, not after.

6. **Do new tables carry ownership?** Any new table holding customer data
   needs a path to `tenant_id`, plus a migration that backfills existing
   rows rather than leaving them orphaned.

## Then prove it

Static reading is not sufficient — a filter that looks right can still be
bypassed by a route that never calls it. Create a throwaway second tenant
and confirm empirically:

```bash
# as admin: create tenant + user
curl -s -c /tmp/admin.jar -X POST localhost:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"<see docs/manual.md>"}'
curl -s -b /tmp/admin.jar -X POST localhost:8000/api/auth/tenants \
  -H 'content-type: application/json' -d '{"slug":"probe","name":"Probe"}'
# → create a user in that tenant, log in as them, then for EVERY endpoint:
#   expect [] on lists, 404 on a known CEMEX id
```

Every list endpoint → `[]`. Every by-id endpoint against a CEMEX id → `404`.
Any endpoint returning data is a leak.

## Report

For each endpoint: scoped / unscoped / intentionally public. Lead with
anything unscoped, and say exactly which customer data it exposes to whom.
If nothing is wrong, say so plainly — don't invent findings.
