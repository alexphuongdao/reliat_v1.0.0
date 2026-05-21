---
name: frontend-design-locked
description: The frontend design language under /frontend is immutable. Only frontend/data.jsx (the data seam) and brand-new files that extend the design using existing primitives may be added. A PreToolUse hook hard-blocks edits to protected design files. Use whenever working on backend integration, when asked to modify UI behavior, or when proposing new screens or components.
---

# Frontend Design Lock

The frontend at `/frontend` was designed externally and is the source of truth for product look-and-feel. **Do not modify the design.** Build the backend to feed the design.

## Hard-blocked files (PreToolUse hook denies Edit/Write)

- `frontend/tokens.css` — design tokens (colors, spacing, radius, motion)
- `frontend/ui.jsx` — UI primitives (Button, Pill, Icon, SevGlyph, StatusPill, …)
- `frontend/charts.jsx` — chart components (TimeSeries, DistributionChart, ColorStrip, …)
- `frontend/app.jsx` — app shell
- `frontend/Reliat v1.html` — HTML harness
- `frontend/screens/*.jsx` — every existing screen

## Freely mutable

- `frontend/data.jsx` — the **seam**. Populates `window.ReliatData` from the backend.
- New files anywhere — allowed if they reuse tokens.css variables and ui.jsx/charts.jsx primitives.

## Extension rules (when adding new files)

1. Reuse design tokens (`--text-*`, `--surface-*`, `--sev-*`, `--accent*`, `--r-*`, `--t-*`). Do not invent new color, spacing, or motion values.
2. Reuse primitives from `ui.jsx` (`Button`, `Pill`, `Icon`, `SevGlyph`, `StatusPill`, `SevPill`) and `charts.jsx` (`TimeSeries`, `DistributionChart`, `ColorStrip`). Do not re-implement a button or pill.
3. Match the existing layout grammar: `panel` sections with sticky headers, uppercase `var(--text-3)` section labels at letter-spacing 0.08em, mono numerics, severity glyphs.
4. Register new components via `window.X = X` (matches how `ui.jsx`, `charts.jsx`, and `screens/*.jsx` already publish themselves — there is no module system at runtime).

## Backend contract — what `data.jsx` must produce

`window.ReliatData` consumed by the screens:

```js
{
  CHANNELS: [{ id, name, belt, color, baseF80, baseTopsize, online, shift }],
  SERIES:   { [channelId]: [{ t, v, outlier, color }] },
  OUTLIERS: [{
    id, channelId, channelName, metric, t, value, baseline, deviation,
    type, confidence, status, summary, action, sev, indexInSeries
  }],
  psdAt: (channelId, idx) => ({ pcts: number[10], sieves: number[5] })
}
```

The HTTP endpoints (in `/backend`) return data in shapes that map 1:1 onto these structures. Never change the shape on the frontend side; adapt the backend response, or adapt the mapping inside `data.jsx`.

## If you genuinely need to modify a protected file

Stop and ask the user. The hook is the safety net; the rule is "do not propose UI changes without explicit approval". A real design need (e.g. a new chart primitive that screens require) is the only valid reason — and even then, the user approves first.
