# 2026-08-12 — Demo hardening

Fixing what the audit in `logs/2026-08-12-pre-demo-audit.md` found, ahead of a
real customer demo. One tagged commit per working state so progress is
traceable; this file is updated per commit.

| Version | What landed | Suite |
|---|---|---|
| `v1.0.1` | Baseline: per-tenant harness, honest empty states, architecture docs | 27 pass / 3 xfail |
| `v1.0.2` | Cross-tenant leak test over every route | 31 pass / 3 xfail |
| `v1.0.3` | `/channels` no longer crashes for tenants without `cv42` | 31 pass / 3 xfail |
| `v1.0.4` | Detector stops asserting root causes it never inferred | 31 pass / 3 xfail |
| `v1.0.5` | Real status chrome, per-tenant chart precision, row overlap | 31 pass / 3 xfail |
| `v1.0.6` | Stored diagnoses load on expand instead of being re-bought | 31 pass / 3 xfail |

---

## v1.0.6 — the UI was hiding diagnoses it had already paid for

### Found while verifying v1.0.4

After the UI rework I re-opened an outlier I had run the agent on earlier in the
session. The panel offered **"Run Diagnostic Agent"** as though nothing had ever
happened. The API disagreed:

```
GET /api/outliers/OUT-2D0F6591C525/diagnoses  →  8 stored diagnoses
  DIAG-5df16d9fd542  claude-haiku-4-5   $0.010315
  DIAG-0c865db4db36  claude-sonnet-5    $0.030069
  ...                                   ≈ $0.14 total, on one outlier
```

`OutlierInboxRow` initialised `diagnosis` to `null` and only ever set it from a
*new* run. `api.diagnoses(id)` already existed and was never called. So every
page reload discarded the visible result of work that had been done, stored, and
billed — and invited the operator to buy the same answer again.

Bad in a demo. Worse in production, where it is a per-tenant cost leak with no
symptom other than a bill.

### What changed

| File | Change |
|---|---|
| `apps/web/components/screens/OutliersScreen.tsx` | On expand, fetch stored diagnoses and show the most recent non-error one. Failure is swallowed — the run button still works and the detector's measurement is already on screen. |

### Verified

| Check | Result |
|---|---|
| Reload, expand `OUT-2D0F6591C525` | Heading **"Agent diagnosis"**, ranked hypotheses 62 / 25 / 15%, `claude-sonnet-5 · 4218 tokens · $0.0302` |
| Button label | "Re-run Diagnostic Agent" |
| Outlier with no diagnosis | "What the detector measured" + "No recommended action yet" |
| Backend suite | 31 passed, 3 xfailed |

Both branches of the v1.0.4 heading logic are now exercised on real data.

## v1.0.5 — status chrome, chart precision, row overlap

Three cosmetic-looking defects, one of which was the first number on the page
and wrong for every tenant.

### What changed

| File | Change |
|---|---|
| `apps/web/components/screens/PulseScreen.tsx` | "Last ingest" computed from the newest point across the tenant's series. Shift shows the real letter; the invented countdown is gone. Outlier-row header truncates instead of overflowing. |
| `apps/web/components/shell/AppShell.tsx` | Hardcoded `● live · last ingest 00:11` removed. Notification badge `2` removed. |
| `apps/web/components/charts.tsx` | Distribution y-axis tick precision derived from the data range. |

### The three

**1. "Last ingest" was a string literal.** `● live · last ingest 00:11` in the
shell, `KPI value="00:11"` on Pulse — for every tenant, while CEMEX's newest
reading was 98 days old. Pulse now reduces over `SERIES` for the newest point.
The shell version is deleted rather than reimplemented: the shell does not load
series, so it cannot compute the real value, and it was duplicating the KPI
anyway.

**2. Shift countdown was invented.** `A · 4h 12m`, `ends 14:00`, identical for
both tenants. `channel.shift` is a real column, so the letter stays. Shift
length and boundaries are plant configuration nobody has given us, so the
countdown reads "shift hours — not configured" instead of a plausible guess.

**3. The distribution y-axis rounded to integers.** `v.toFixed(0)` is fine for
the demo tenant's ~40–80 mm values. CEMEX's F80 spans about 0–1.1 mm, so every
tick collapsed to `1` or `0` and the axis read **`1, 1, 0, 0, 0`**. Precision
now follows the range: `yR/4 >= 10 → 0` digits, `>= 1 → 1`, `>= 0.1 → 2`,
else `3`.

**4. Outlier rows overlapped below ~1500px.** The header flex row inside the
Pulse outlier list had no `minWidth: 0` and no truncation, so the id and the
classification overflowed their grid cell and painted on top of the value
column — on a 13" MacBook, which is what a demo runs on.

### Decisions worth remembering

**Delete, don't reimplement, when the component lacks the data.** The shell's
"last ingest" could have been made real by adding a series fetch to `AppShell`.
That would mean loading every channel's series on every screen to render one
label that Pulse already shows. Removing it is the smaller and more honest
change.

**Tick precision is a per-tenant concern, not a styling choice.** This bug was
invisible for nine days because the synthetic tenant's numbers are an order of
magnitude larger than the real one's. Anything that formats a measurement has to
derive its precision from the data, not from a constant chosen while looking at
one dataset.

### Verified

| Check | Result |
|---|---|
| Demo tenant "Last ingest" | **9d ago** — matches `now() - max(t)` of `9 days 12:44` |
| CEMEX "Last ingest" | **98d ago** — matches `98 days 14:59` |
| CEMEX PSD y-axis | **0.75 / 0.57 / 0.38 / 0.20 / 0.01** (was `1, 1, 0, 0, 0`) |
| Demo PSD y-axis | 50 / 39 / 29 / 19 / 9 — still integers, correct for the range |
| Pulse rows at **1440×900** | No overlap; id truncates to `OUT-16…`, classification intact |
| Shift KPI | `A` · "shift hours not configured" |
| `tsc --noEmit` | clean |
| Backend suite | 31 passed, 3 xfailed |

## v1.0.4 — the detector stops claiming to be the agent

### What was wrong

`detector.py` held six templated explanations and six suggested actions. They
asserted physical root causes nothing had inferred, and rendered under a heading
that said **"AI explanation"** with a teal **"Agent suggests:"** callout — for
every outlier, without a model ever running.

Three separate falsehoods, in increasing order of seriousness:

1. **Invented causes.** "Consistent with oversized fragments bypassing the
   grizzly screen." "Likely material transition — high-iron ore on belt."
2. **Invented equipment.** `"Inspect grizzly screen panel C-3 for damage at next
   downtime."` Panel C-3 does not exist. A plant engineer can walk out and check.
3. **An invented measurement.** The duration in "held above for 3m 41s" came
   from the loop counter:

   ```python
   dur = f"{2 + (counter % 6)}m {(10 + counter * 7) % 60:02d}s"
   ```

   Not derived from the data at all. That is why the durations cycled.

The backfill dry run then surfaced a fourth: the templates asserted a
**direction contradicted by the stored numbers**. One row read "F80 jumped 13.7σ
*above* the rolling baseline" while holding `value 44.15, baseline 66.42` — it
was below.

### What changed

| File | Change |
|---|---|
| `services/api/app/detector.py` | `EXPLANATIONS` and `SUGGESTED` deleted, with a comment recording why. New `_summarize()` states the measurement only. `action=""`. Fabricated `dur` removed. |
| `services/api/app/backfill_summaries.py` | New. Rewrites already-stored summaries from the numbers beside them. Dry run by default. |
| `apps/web/components/screens/OutliersScreen.tsx` | Heading follows content: "Agent diagnosis" with a diagnosis, "What the detector measured" without. "Agent suggests" only renders when an agent actually suggested something; otherwise an `Unavailable` pointing at the button. |
| `apps/web/components/screens/ChannelsScreen.tsx` | Outlier-history column header "AI summary" → "Detection". |

New summary format:

```
F80 32.21mm against a rolling baseline of 38.60mm over the previous 60 samples — 6.7σ below (-17%).
```

### Decisions worth remembering

**A z-score knows one thing: this value is N sigma from its baseline.** It does
not know why. Root cause is the agent's job — per-tenant, cited, ~$0.01. The
honest output before it runs is the measurement itself. That is the same
principle as the `Unavailable` panels, applied to a surface that was *filling*
the gap rather than admitting it, which is strictly worse than leaving it empty.

**Backfill rather than re-detect.** Re-running detection would mint new ids and
discard triage state and diagnosis links. The rewrite derives each summary from
the row's own `metric/value/baseline/deviation`, so nothing but the prose moves.
The sign of the deviation is recovered from `value` vs `baseline`, since
`deviation` is stored absolute.

**`confidence` is left alone but documented.** It is `0.55 + min(σ,6)/12` — a
rescaling of the deviation, not a probability. Monotonic in the evidence, which
is all the triage sort needs. A comment now says so; the UI still shows it as a
percentage, which is still misleading. Logged below.

### Verified

| Check | Result |
|---|---|
| Backfill dry run | 1,558 outliers, **1,558** carrying a fabricated cause and an action |
| After `--apply` | `still_fabricated: 0` of 1,558 |
| Stored sample | `Topsize 191.17mm against a rolling baseline of 90.14mm … 7.4σ above (+112%)` |
| Demo tenant, expanded row, in-browser | Heading reads **"What the detector measured"**; text matches RAW ROW exactly (`value 32.2093`, `baseline 38.5988`, `deviation 6.656σ`) |
| Action block with no diagnosis | "No recommended action yet. Run the Diagnostic Agent…" |
| `tsc --noEmit` | clean |
| Backend suite | 31 passed, 3 xfailed |

### Still open

- **`confidence` still renders as `98%`** in the outliers table under a column
  headed `CONF.`. It is a rescaled sigma. Either relabel it or show sigma.
- The Library and Agent screens still read from `lib/mockData.ts`.
- Nothing prevents a future template from reintroducing this. A test asserting
  that `outliers.summary` contains no causal language would be cheap.

## v1.0.3 — `/channels` crash

### Symptom

Hard error page ("This page couldn't load") on `/channels` for the demo tenant.
CEMEX was fine — but only because its one channel happens to be called `cv42`.

### Cause

A CEMEX channel id had been hardcoded as the global default in a component
every tenant shares:

```ts
// app/(app)/channels/page.tsx:14
const initialChannelId = params.get("c") || "cv42";
```

The fallback at `ChannelsScreen.tsx:67` *looks* like it handles a miss, which is
why this survived review:

```ts
const channel = CHANNELS.find((c) => c.id === channelId) ?? CHANNELS[0];  // ✅ resolves
const series  = SERIES[channelId] || [];      // ❌ still the *requested* id → []
...
{fmtTime(visible[0].t)}                       // ❌ TypeError on []
```

It rescues the channel *object* and then the very next line looks the series up
by the unresolved id. Empty series, then a dereference of `visible[0]`.

### What changed

| File | Change |
|---|---|
| `apps/web/app/(app)/channels/page.tsx` | No default channel. `params.get("c") ?? undefined` — the screen picks the tenant's first channel. |
| `apps/web/components/screens/ChannelsScreen.tsx` | Split *requested* id from *resolved* id. Everything downstream uses `channel.id`. |
| ↳ | Empty channel list renders `Unavailable` instead of bare text. |
| ↳ | `compareIds` overlay drops a missing channel instead of `!`-asserting it. |
| ↳ | Colour-strip header shows "no readings in range" instead of dereferencing `visible[0]`. |

### Decisions worth remembering

**Resolve once, then use only the resolved value.** The bug was not the missing
fallback — the fallback existed. It was keeping two ids in scope where one was
already known to be unresolvable. Introducing `const channelId = channel.id`
below the guard makes the unresolved id unreachable by construction, so the same
mistake cannot be made again in a line added later.

**The non-null assertion on overlays was the same bug waiting to happen.**
`CHANNELS.find(...)!` would throw the moment a compare selection outlived a
tenant switch. Changed to `flatMap` + drop.

### Verified

| Check | Result |
|---|---|
| CEMEX `/channels?c=cv99-does-not-exist` (the exact crash branch) | Renders, falls back to CV42 Tunnel |
| Demo tenant `/channels` in-browser | **Renders CV03 Pebble** — full series, PSD snapshot, colour strip |
| CEMEX `/channels` still correct | CV42 Tunnel, 1,513 outlier history |
| `tsc --noEmit` | clean |
| Backend suite | 31 passed, 3 xfailed |

### Bug found during verification

**`form_input` does not drive React controlled inputs.** It sets the DOM value
without firing the events React listens for, so the login Server Action received
empty fields and silently did nothing — no `POST /api/auth/login` ever reached
the API. Clicking the field *by ref* and using `type` works. Worth remembering
for any future UI verification in this repo.

**A failed sign-in shows no error.** The form cleared and stayed on the page
with no message. Not fixed here — logged under Still open.

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
