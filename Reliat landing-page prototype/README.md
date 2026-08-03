# Landing page prototype — source layout

`Reliat Storyboard.dc.html` is a **build artifact** — generated from the
files in `src/`. Never hand-edit it directly; regenerate it instead:

```bash
python3 build.py
```

## Why it's split up

The single file is a component export for a custom `<x-dc>` runtime
(`support.js`) — fonts/style, `{{ }}` template bindings, a
`<script type="text/x-dc" data-props="...">` block. That contract has to stay
a single document at serve time, so `build.py` just concatenates the ordered
parts in `src/MANIFEST.txt`, byte for byte, back into one file. Splitting it
this way makes it editable in normal-sized chunks without risking any change
to what actually renders.

**Verified lossless**: the very first build from the split parts matched the
pre-split original byte-for-byte (`sha256
2771776551e85cfab374e7dcb0ac49cfbdbbd08d69cf7ed24639ae3460c69e8e`) — the
decomposition changed nothing about the output.

## Source files (edit these)

| File | What it is |
|---|---|
| `src/00-head-and-style.html` | doctype, fonts, global CSS |
| `src/01-chrome-and-chip.html` | fixed top nav + persistent incident chip |
| `src/02-track-open.html` | scroll-track / canvas / video setup |
| `src/03-scene-hero.html` | Scene 0 — Hero |
| `src/04-scene-belt-scan.html` | Scene 1 — Belt & scan |
| `src/05-scene-analysis.html` | Scene 2 — Size data & anomaly |
| `src/06-scene-evidence.html` | Scene 3 — Evidence grid |
| `src/07-scene-hypotheses.html` | Scene 4 — Ranked hypotheses |
| `src/08-scene-topology.html` | Scene 5 — Propagation topology |
| `src/09-scene-artifact-cta.html` | Scene 6 — Incident artifact + closing CTA |
| `src/10-track-close.html` | closing wrapper divs |
| `src/11-behavior-open.html` | `<script>` open tag + props schema |
| `src/12-behavior.js` | the scroll/canvas animation engine (pure JS) |
| `src/13-foot.html` | closing tags |

Each scene file is self-contained HTML you can edit directly — copy, layout,
colors, links. After editing, run `python3 build.py`, then refresh the
browser tab serving `localhost:4173`.

## Visual verification

Since this is scroll-driven and canvas-animated, describing a change in text
isn't enough to confirm it looks right — use the `claude-in-chrome` skill to
actually load the page, screenshot it, and scroll through the real states
after any edit, rather than trusting the HTML alone.
