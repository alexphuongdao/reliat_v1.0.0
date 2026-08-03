---
description: Review a pending Alembic migration for safety against a database that already holds real customer data.
argument-hint: "[optional: revision id or migration filename]"
---

# Migration review

This database holds **real ingested CEMEX measurements**, not seed data. A
careless migration destroys the only copy. There is no automated backup and
no staging environment — the migration in front of you is the rehearsal and
the performance at once.

Focus: $1 (if empty, review the newest file in
`services/api/alembic/versions/`).

## Read the migration and check

1. **Does it drop or rewrite data?** `drop_table`, `drop_column`, a type
   change that truncates, or an `UPDATE` without a `WHERE`. If any exist,
   stop and confirm with the user before anything runs.

2. **Is a new NOT NULL column safe on a non-empty table?** The only correct
   order is: add **nullable** → backfill every existing row → `alter_column`
   to `nullable=False`. Adding NOT NULL directly fails the moment a row
   exists. See `b7f31c904e2a_auth_and_tenancy.py` for the pattern.

3. **Does the backfill make sense?** A backfill encodes a factual claim
   about existing rows ("every current channel is CEMEX data"). State that
   claim explicitly and check it still holds — it silently expires the day a
   second customer ingests data.

4. **Does `downgrade()` actually reverse it?** Drops in reverse dependency
   order: constraints → indexes → columns → tables. A `downgrade` that
   errors halfway leaves the schema in a state no revision describes.

5. **Is it dialect-safe?** The app defaults to SQLite
   (`config.py: database_url`) and runs on Postgres in compose. Avoid
   Postgres-only syntax (`ON CONFLICT`, `USING`) in data steps unless the
   migration is Postgres-only by intent.

6. **Does `down_revision` point at the current head?** A wrong parent
   creates a branch that `alembic upgrade head` will refuse.

7. **Do the models match?** The SQLAlchemy models in `app/models.py` and the
   migration must agree — nullability, lengths, FK `ondelete`, index names.
   A mismatch means `create_all()` and `alembic upgrade` produce different
   schemas.

## Rehearse it

Never let a migration meet the real data first. Snapshot, then run both
directions:

```bash
# snapshot the real data first
docker compose exec -T postgres pg_dump -U reliat reliat > /tmp/reliat-pre-migration.sql

docker compose exec -T api alembic upgrade head
docker compose exec -T api alembic downgrade -1   # must not error
docker compose exec -T api alembic upgrade head
```

Then confirm nothing was lost — row counts before and after, and that no
column intended to be fully populated has NULLs:

```bash
docker compose exec -T postgres psql -U reliat -d reliat \
  -c "SELECT count(*) FROM measurements;" \
  -c "SELECT count(*) FROM channels WHERE tenant_id IS NULL;"
```

## Report

State plainly whether it is safe to run against real data. Lead with
anything destructive or irreversible. Quote the actual row counts before and
after — not "data preserved" as an assertion.
