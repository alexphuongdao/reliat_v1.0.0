# 2026-08-02 — First snapshot commit, and an unreviewed migration that went with it

The ask was a snapshot: first commit under the founder's own identity, pushed to
`alexphuongdao/reliat_v1.0.0`. That happened. It also swept in a half-finished
implementation of `DataArchitecture.md` slice 1 that I had not written and did
not read before pushing.

## What changed

| File | Change |
|---|---|
| `.git/config` | Repo-local identity set to `Dao Duy Phuong <daoduyphuong2005@gmail.com>`. Previous commits were authored as `Claude <noreply@anthropic.com>`. |
| — | Commit `cbbe523`, 109 files, +10,929 / −241. Pushed to `origin/claude/plan-mining-platform-4ptE2`. |

Nothing else was authored this turn. The rest of this entry is about what was in
the commit that shouldn't have been.

## The mistake

`git add -A` staged everything, including two files that changed during the
session but not by me:

- `services/api/alembic/versions/4c7a2e1b9d31_source_assets.py` (new, mtime 23:24)
- `services/api/app/models.py` (gained `SourceAsset`, `Measurement.source_asset_id`,
  and `UniqueConstraint("channel_id", "t")`)

I ran a pre-commit scan and it was too narrow. It checked for secrets, `.env`,
database files, customer data, `node_modules`, `__pycache__`, and large blobs —
all clean, all reported. It did **not** check for source files I hadn't read.
So the review I actually performed was "nothing dangerous is in here," and the
review I reported was closer to "I looked at this." Those are different claims,
and on a public repo the gap matters.

The rule that follows: on a bulk `git add -A`, diff the *source* changes, not
just the file list. `git diff --cached -- '*.py' '*.ts'` would have taken ten
seconds and caught it.

## What the unreviewed change actually does

The migration and models edit implement the schema half of slice 1 — and only
that half. Read after the fact:

**Correct and useful.** `source_assets` matches `DataArchitecture.md` §3 almost
field for field: tenant FK with CASCADE, `UNIQUE (tenant_id, sha256)`,
`received_by` → users with SET NULL, the four row counters, status, storage_uri,
profile id + version. `measurements.source_asset_id` is nullable with SET NULL,
which is right — losing an asset record must not delete readings. The
`downgrade()` reverses every step in the correct order.

**Incomplete in a way that breaks ingest.** No code writes to `source_assets`,
nothing computes a sha256, and `ingest_rows` has no conflict handling. The
unique constraint now exists with nothing to catch it:

```text
sqlalchemy.exc.IntegrityError: (sqlite3.IntegrityError)
UNIQUE constraint failed: measurements.channel_id, measurements.t
```

That is a behaviour change, not a fix. Before: re-ingesting an overlapping
window silently duplicated rows. Now: it raises and **aborts the entire batch**.
For a historian that re-exports a rolling window on a schedule, that means every
run after the first fails completely. Silent corruption traded for a hard stop —
arguably better, definitely not "done," and worse than either if it lands on a
live feed unannounced.

The architecture doc specifies `ON CONFLICT DO NOTHING` plus a `rows_duplicate`
counter for exactly this reason. That part is unbuilt.

**It may refuse to apply to the real database.** `create_unique_constraint` on
`(channel_id, t)` fails if duplicates already exist — and duplicates are the
defect this constraint is meant to prevent, accumulated over every prior ingest
run. Postgres was down, so this is still unverified. Check before upgrading:

```sql
select count(*) from (select channel_id, t from measurements
                      group by 1,2 having count(*) > 1) d;
```

Non-zero means the migration needs a de-duplication step before the constraint,
inside the same migration.

**It re-commits to a known defect.** `received_at` and `ingested_at` are
`sa.DateTime()`, not `timezone=True` — consistent with the existing schema, and
the exact thing finding #3 says to stop doing. A brand-new provenance table was
the one place to get it right for free.

## Verified

```text
./.venv/bin/python -m pytest -q -rxX
7 passed, 3 xfailed in 1.00s
```

| Check | Result |
|---|---|
| Commit author | `Dao Duy Phuong <daoduyphuong2005@gmail.com>` on `cbbe523` |
| Push | `6626abf..cbbe523` → `origin/claude/plan-mining-platform-4ptE2` |
| Working tree | clean, in sync with origin |
| Secrets / data files in commit | none — `.env`, `reliat.db`, `*.xls` all correctly ignored; no live API keys |
| ORM ↔ migration agreement | agree (both have `source_assets`, `source_asset_id`, `uq_measurements_channel_t`) |
| Idempotency xfail | still xfail — but now for a **different reason** (IntegrityError, not duplication) |

## Decisions worth remembering

**`xfail` is agnostic about *why* a test failed.** The idempotency test went from
"asserts 40 == 80" to "raises IntegrityError" and the suite reported the same
three characters either way. A tripwire that fires on pass but not on a changed
failure mode is half a tripwire. Where the failure mode is itself the
information, assert it: `pytest.raises` on the specific exception, or a test
that pins current behaviour explicitly rather than marking it expected-to-fail.

**Demo credentials are now public, by decision.** The repo is public; the
founder chose to push as-is after being shown the exposure. `docker-compose.yml`,
`.env.example` and `docs/manual.md` carry `Admin-Reliat-2026!`,
`Cemex-Reliat-2026!`, `reliat_dev_session_secret`, and `reliat_dev_password` in
permanent history. The remaining work is not scrubbing history — it is making
the `${VAR:-default}` fallbacks fail closed so a deployment cannot silently boot
with a known session secret, and rotating the values.

## Still open

- **Slice 1 is half-built and currently makes re-ingest worse.** Needed to
  finish it: sha256 short-circuit on the asset, `ON CONFLICT DO NOTHING` +
  `rows_duplicate` in `ingest_rows`, `SourceAsset` rows actually written at
  ingest, and `storage_uri` pointing somewhere real.
- **The live duplicate-row count is still unverified** — Postgres was down for
  this session too. The migration should not be run against real data until that
  query returns 0 or the migration grows a de-dup step.
- **The three xfails are unchanged**, but the first one's reason string is now
  stale: it says "no UNIQUE(channel_id, t)" and there is one.
- **`received_at`/`ingested_at` should be `timezone=True`** before this table has
  rows in it — cheapest it will ever be.
- Still no CI. Every test here runs only when someone runs it.
