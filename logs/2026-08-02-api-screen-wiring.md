# 2026-08-02 — API-backed operational screens

Outliers was the only operational screen using tenant-scoped API data. Pulse,
Channels, Agent, and Library still rendered the global design mock, so a new or
empty tenant could see another plant's channels and activity. This pass wires
those screens to the authenticated API and makes their loading/error behavior
explicit.

## What changed

| File | Change |
|---|---|
| `apps/web/lib/loadWorkspace.ts` | Shared loader for tenant channels, outliers, time series, and current PSD snapshots. |
| `apps/web/app/(app)/pulse/page.tsx` | Loads live workspace data and derives the visible summary counts. |
| `apps/web/app/(app)/channels/page.tsx` | Loads live channels, series, outliers, and PSD data; handles an empty tenant. |
| `apps/web/app/(app)/agent/page.tsx` | Loads live channel/outlier context and starts with an empty thread instead of mock history. |
| `apps/web/app/(app)/library/page.tsx` | Loads tenant channels for the configuration view. |
| `apps/web/components/screens/ChannelsScreen.tsx` | Avoids a crash when no channel is available. |
| `apps/web/app/layout.tsx` | Removes the build-time Google Fonts fetch; the existing local CSS font stack remains authoritative. |

## Decisions worth remembering

The shared loader fetches each channel's series and latest PSD in parallel after
the channel list arrives. The current API has no historical PSD endpoint, so the
Channels snapshot panel uses each channel's latest snapshot for now; adding a
time-indexed PSD API is a separate backend enhancement.

## Verified

| Check | Result |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | Passed with no diagnostics. |
| `./node_modules/.bin/next build` | Passed; all 11 routes generated. |
| Offline build | Passed after removing `next/font/google`, which previously failed while fetching Google Fonts. |

## Still open

The Agent screen's send action is still a local placeholder response; there is
no conversation endpoint yet. Library uploads, user management, and channel
editing remain presentation-only. Pulse's shift summary is a concise client
summary rather than an agent-generated backend summary. Historical PSD snapshots
also remain unavailable.
