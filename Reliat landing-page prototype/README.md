# Reliat landing page

This directory contains only the public marketing page for Reliat. The
authenticated product UI in `apps/web/` is a separate project.

## Directory map

| Directory | Purpose | Edit it? | Commit it? |
|---|---|---:|---:|
| `src/` | Page markup, styles, scenes, and animation behavior | Yes | Yes |
| `public/` | Static files copied to the website unchanged | Yes | Yes |
| `production/` | Storyboards, prompts, and working AI-video files | Yes | Selectively |
| `dist/` | Complete generated website ready to serve or deploy | No | No |

The apparent asset duplication is intentional: `public/assets/` is the source;
`dist/assets/` is its generated deployment copy. Delete `dist/` at any time and
run the build to reproduce it.

## Build and preview

From this directory, run:

```bash
python3 build.py
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`. Upload the contents of `dist/` to a static
host; React or Next.js is not required.

## Why the page source is split up

The generated page is a component export for a custom `<x-dc>` runtime
(`public/support.js`) — fonts/style, `{{ }}` template bindings, and a
`<script type="text/x-dc" data-props="...">` block. That contract has to stay
a single document at serve time, so `build.py` concatenates the ordered parts
in `src/MANIFEST.txt`, byte for byte, into `dist/index.html`.

Splitting the source this way keeps scenes editable without changing the page
contract. The original source decomposition was verified byte-for-byte against
the pre-split page (`sha256
2771776551e85cfab374e7dcb0ac49cfbdbbd08d69cf7ed24639ae3460c69e8e`).

## Page source files

| File | What it is |
|---|---|
| `src/00-head-and-style.html` | doctype, fonts, global CSS |
| `src/01-chrome-and-chip.html` | fixed top nav + persistent incident chip |
| `src/02-track-open.html` | scroll-track / canvas / video setup |
| `src/03-scene-hero.html` | Legacy scene-0 structure retained for animation indexing; hidden from the visitor flow |
| `src/04-scene-belt-scan.html` | Scene 1 — Belt & scan |
| `src/05-scene-analysis.html` | Scene 2 — Size data & anomaly |
| `src/06-scene-evidence.html` | Scene 3 — Evidence grid |
| `src/07-scene-hypotheses.html` | Scene 4 — Ranked hypotheses |
| `src/08-scene-topology.html` | Scene 5 — Propagation topology |
| `src/09-scene-artifact-cta.html` | Scene 6 — Incident artifact + closing CTA |
| `src/10-track-close.html` | closing wrapper divs |
| `src/11-behavior-open.html` | `<script>` open tag + props schema |
| `src/12-behavior.js` | scroll/canvas animation engine |
| `src/13-foot.html` | closing tags |

Edit source files, run `python3 build.py`, and refresh the browser tab serving
`localhost:4173`.

## Static website assets

- Brand artwork: `public/assets/brand/`
- Approved browser videos: `public/assets/video/`
  - `mine-hero-desktop.mp4` — one-shot truck / primary-crusher opening
  - `mine-conveyor-loop.mp4` — mirrored left-to-right conveyor footage with a
    two-layer crossfade loop applied by `src/12-behavior.js`
- Runtime required by the generated page: `public/support.js`

Keep working files and large source exports out of `public/`; only final files
that the browser actually loads belong there.

## Mine-hero production workflow

All AI-video work belongs under `production/hero-mine/`:

- `brief/` — creative direction, shot list, timing, and acceptance criteria
- `prompts/` — exact generation prompts and iteration notes
- `storyboard/` — approved keyframes and visual references
- `raw/` — untouched downloads from the generation tool
- `selects/` — promising clips under review

The large contents of `raw/` and `selects/` stay local and are ignored by Git.
Their README files remain tracked so the workflow is self-documenting. Once a
desktop or mobile export is approved and web-optimized, copy only that final
asset into `public/assets/video/`.

## Visual verification

Because this is scroll-driven and canvas-animated, a successful build is not
enough. Load the built page, screenshot it, and scroll through the real desktop
and mobile states after every visual edit.

The current visual system is intentionally dark: deep navy-green page and
panel surfaces, warm-white type, restrained teal/green instrumentation, and
brightness concentrated in the two photographic video scenes.
