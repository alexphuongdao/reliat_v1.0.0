# 2026-08-12 — Pre-demo audit: what actually renders, per tenant

Brought the stack back up after a nine-day shutdown and walked every screen as
both tenants ahead of a real customer demo. **No code changed this session.**
This is an inspection record: what works, what is broken, and which defects a
customer would notice in the first sixty seconds.

Isolation and the per-tenant harness both hold up end-to-end, including through
the live model. The UI does not: nine defects, four of them visible on the first
screen a customer sees.

## Verified — isolation

Two independent cookie jars, live Postgres, no mocks.

| Check | Result |
|---|---|
| `cemex` → `/api/channels` | `1 channel: ['cv42']` |
| `test` → `/api/channels` | `11 channels: ['cv03'…'cv77']` |
| `cemex` → demo's `/api/channels/cv28/series` | **404** (not 403 — no enumeration oracle) |
| `test` → cemex's `/api/channels/cv42/series` | **404** |
| `cemex` → own `cv42/series` | 200 |
| `test` → own `cv28/series` | 200 |
| `cemex` → demo's `cv28/psd` | **404** |
| no cookie → `cv42/series` | **401** |
| `cemex` → `/api/outliers?limit=2000` | 1513, all `cv42` |
| `test` → `/api/outliers?limit=2000` | 45, across 11 channels |
| `cemex` → `/api/usage` | 30 calls, $0.8151 |
| `test` → `/api/usage` | 2 calls, $0.0140 |

The usage endpoint is correctly tenant-scoped via `Outlier → Channel → tenant`
(`routes/usage.py`), and says why in a comment. Worth keeping — spend totals are
an easy place to leak another customer's activity.

Row counts survived the shutdown intact: `tn_cemex` 21,138 / `tn_demo` 15,840.
`reliat_pgdata` untouched.

## Verified — the per-tenant harness, through the live model

`GET /api/harness` resolved from the caller's principal:

| | cemex | demo |
|---|---|---|
| window before/after | 20 / 5 | 12 / 4 |
| evidence fields | 9 — incl. `SDRatio10_5`, `VideoR/G/B` | 5 — `F80, Topsize, Hue, Sat, Light` |
| instrument | MINITAB CV42 belt-mounted PSD camera | simulated belt PSD analyzer |

Then ran the real Diagnostic Agent once per tenant. **The divergence shows up in
the model's own output**, which is the proof that matters:

- **cemex** cited `RGB 149/166/101` and Hue/Sat/Light to rule out instrument
  fault. 4,571 tokens, **$0.0103**, `claude-haiku-4-5`.
- **demo** cited only F80 (6.66σ from baseline 38.6 → 32.2 mm) and Topsize.
  **No RGB — its harness does not expose those columns.** 2,934 tokens,
  **$0.0064**.

The token counts differ because the window and field count differ. The harness
is visible in the bill, not just in the prompt.

Measured cost per diagnosis: **~$0.0064–$0.0103 on Haiku**, ~$0.031 on Sonnet
(25 historical Sonnet calls, $0.7707).

## Bugs found — demo blockers

### 1. `/channels` crashes for any tenant without a channel named `cv42`

Hard error page ("This page couldn't load") for the demo tenant. CEMEX is fine
*only because `cv42` happens to be its channel*. The chain:

```ts
// app/(app)/channels/page.tsx:14
const initialChannelId = params.get("c") || "cv42";     // CEMEX id as global default
// components/screens/ChannelsScreen.tsx:55
const [channelId, setChannelId] = useState(initialChannelId || "cv42");
// :67  channel falls back correctly…
const channel = CHANNELS.find((c) => c.id === channelId) ?? CHANNELS[0];
// :71  …but the series lookup still uses the stale id → []
const series = SERIES[channelId] || [];
// :293 → TypeError on empty array
{fmtTime(visible[0].t)} → {fmtTime(visible[visible.length - 1].t)}
```

The `?? CHANNELS[0]` at :67 *looks* like it handles the miss, which is why this
survived. It only rescues the channel object; the series lookup on the next line
still uses the unresolved id. Fix is `SERIES[channel.id]` plus a guard at :293 —
but the real fix is that no shared component should name a customer's channel.

### 2. Templated detector text is labelled "AI EXPLANATION" and "Agent suggests"

`detector.py:19–35` holds six hardcoded format strings that assert specific
physical root causes that were never inferred:

- "Consistent with oversized fragments bypassing the grizzly screen."
- "Likely material transition — high-iron ore on belt."
- "**Inspect grizzly screen panel C-3** for damage at next downtime."

`panel C-3` is a fabricated asset. All 1,513 CEMEX outliers render this text
under an "AI EXPLANATION" heading and a teal "Agent suggests:" callout until
someone clicks *Run Diagnostic Agent* on that specific row. A customer scrolling
the outlier list is reading invented diagnoses presented as model output.

This is the same failure as the mock data that was already removed, one layer up:
the data is real now, the *reasoning* is still fake. Worse than mock data,
because a plant engineer can check whether panel C-3 exists.

### 3–5. Hardcoded status chrome contradicting real data

| Where | Renders | Reality |
|---|---|---|
| `AppShell.tsx:437` | `● live · last ingest 00:11` | cemex newest row is **98 days** old; demo **9 days** |
| `PulseScreen.tsx:84,89` | `SHIFT A · 4h 12m` … `ends 14:00` | static string, identical for both tenants |
| `AppShell.tsx` bell | `2` | static |

The "live" indicator is the worst of the three: it is the first thing on the
screen and it is false for both tenants.

### 6. PSD y-axis collapses for CEMEX

`charts.tsx:423` — `v.toFixed(0)`. CEMEX F80 spans ~0–1.1 mm, so the axis renders
`1, 1, 0, 0, 0`. Invisible on demo data (~78 mm). A tenant-range-dependent bug
hidden by the synthetic tenant's larger magnitudes.

### 7. Outlier row text overlaps below ~1500px

Metric label and value render on top of each other in the Pulse outlier list.
Clean at 1568px, broken at 1487px — i.e. **broken on a 13" MacBook**, which is
what a demo is likely to run on.

### 8. All 1,513 CEMEX outliers are `OPEN`

Nothing acknowledged or resolved. A triage inbox where nothing has been triaged
reads as an unused product.

### 9. Belt-material colour strip renders black for CEMEX

`hsl(0:0 0.0% 0.1%)`. Either the real HSL columns are near-zero or the mapping is
wrong. Not diagnosed this session.

## Also noted

- Client-side nav *does* work — an early screenshot caught a mid-navigation
  frame and made it look broken. The destination was crashing, not the router.
- `Switch account` on the login page is good: it names who is currently signed in
  before you overwrite the session.
- The `Unavailable` panels (Predicted downstream effect, Similar past outliers)
  are behaving exactly as intended — they explain *why* the data is absent rather
  than faking it. This is the pattern the two "AI EXPLANATION" surfaces should
  follow.
- Raw-row panel shows real provenance with UTC timestamps
  (`2026-05-06T04:42:22.000Z`, baseline `0.6740`, deviation `3.752σ`).

## Still open

- **Nothing above is fixed.** No code changed this session.
- Two tabs cannot show two tenants at once: the session cookie is host-scoped to
  `localhost` and client calls go to `localhost:8000` with `credentials:
  "include"`. Splitting via `127.0.0.1` fails too — SameSite drops the cookie on
  the cross-site fetch. Use an Incognito window for the second account.
- `acme` tenant still exists, 0 channels, left from earlier isolation testing.
- The ~40 uncommitted files from the harness build are still uncommitted, now
  ~26 plus this session's docs.
- Suggested fix order before the demo: **1 → 2 → 3 → 7**. Item 1 is a hard crash,
  item 2 is a credibility risk, items 3 and 7 are the first things visible.
