# 2026-07-30 — Loading states, no mock flash

Small follow-up to the auth work. The Outliers screen initialised its state
from `buildMock()`, so opening it rendered a full inbox of fabricated
outliers for a beat and then replaced them with the real ones. The app
appeared to change its mind about the facts — and during the pause, the
numbers on screen were fiction presented as fact.

## Changed

| File | Change |
|---|---|
| `components/ui.tsx` | New `Spinner`, `ScreenLoading`, `ScreenError` primitives. |
| `app/globals.css` | `@keyframes reliat-spin` + a `prefers-reduced-motion` opt-out. Keyframes can't be inline, which is why this file gains its first rule. |
| `app/(app)/outliers/page.tsx` | No mock seed. `loading → data`, or `loading → error` with Retry. |
| `components/screens/OutliersScreen.tsx` | Spinner next to the Diagnostic Agent button while a model call is in flight. |

## The mock fallback is gone, not moved

Previously a failed fetch left the mock on screen. That's the same defect as
the empty-tenant bug fixed earlier the same day: with tenants in play,
silently rendering demo numbers when the API is unreachable is
indistinguishable from rendering *someone else's plant*. An honest error
with a Retry is worth more than a screen that always looks populated.

Trade-off accepted: if the API is down, Outliers no longer renders anything
demo-able. That is the correct behaviour now that the numbers claim to
belong to a specific customer.

## Verified in the browser

- Sampled the DOM every 120 ms across a cold load: **no frame** ever
  contained a mock id (`OUT-1V5` shape). Real ids (`OUT-2D0F6591C525`)
  only.
- Throttled `/api/` fetches by 4 s → "Loading outliers…" with a live
  `.reliat-spinner`, no mock; resolved to 1,513 real outliers.
- Forced fetch rejection → "Couldn't load outliers." + `Failed to fetch` +
  Retry, no mock.
- Unpatched reload → 1,513 real outliers.

## Still on mock

Pulse, Channels, Agent and Library are unchanged — they render `buildMock()`
outright, with no API call to wait for, so there's no flash to fix and
nothing to spin on. They still show the same fabricated plant to every
tenant. Wiring them to the API is the real fix and is not part of this
change.
