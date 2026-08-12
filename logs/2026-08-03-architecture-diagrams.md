# 2026-08-03 — Architecture diagrams, and a security review of the skill that draws them

Two asks: check whether `coleam00/excalidraw-diagram-skill` is malware before
installing it, then draw the system and data architectures so the plan can be
inspected visually rather than read across five documents.

## What changed

| File | Change |
|---|---|
| `.claude/skills/excalidraw-diagram/` | Installed after review — **minus running anything**. All 8 files copied from a reviewed clone, no `.git`. |
| `docs/diagrams/reliat-system-architecture.excalidraw` | New. 95 elements. Request path top to bottom; where the tenant boundary is set and enforced. |
| `docs/diagrams/reliat-data-architecture.excalidraw` | New. 181 elements. Ingestion split, three planes, promotion gate, three retrieval modes, context budget, build order. |
| `docs/diagrams/*.svg` | Flat previews that render anywhere, including GitHub. |
| `docs/diagrams/_tools/` | Generators, a layout validator, and a local SVG previewer. |
| `docs/diagrams/README.md` | How to open, how to regenerate, and when to stop regenerating. |

## Security review of the skill

**Verdict: not malware.** Reviewed by cloning to a scratchpad and reading every
file — never into `.claude/skills` first, and nothing executed.

9 files, 2 commits, both from Cole Medin (`cole@dynamous.ai`), March 2026. One
executable: `references/render_excalidraw.py`, which reads a `.excalidraw`,
computes a bounding box, launches headless Chromium via Playwright, and
screenshots the SVG. No `subprocess`, `os.system`, `eval`, `exec`, `base64`,
sockets, `requests`/`urllib`, env var reads, or credential access. Filesystem
access is limited to reading the input and writing a PNG beside it. Grepped
every file for instruction-injection patterns (`ignore previous`, `system
prompt`, `silently`, exfil verbs) — zero hits. `SKILL.md` is genuinely 24 KB of
diagram design methodology.

**One real risk, and it is a supply-chain one:**

```html
import { exportToSvg } from "https://esm.sh/@excalidraw/excalidraw?bundle";
```

`render_template.html` pulls Excalidraw from a CDN at render time — unpinned,
no version, no SRI. If esm.sh were compromised or the package hijacked,
arbitrary JS runs in the Chromium launched on this machine. Sandboxed in a
headless browser loading a `file://` page, so the blast radius is small, but it
is unreviewed third-party code executing locally, refetched on every render.

## Decisions worth remembering

**Installed the skill, skipped the renderer.** The value is the methodology and
the JSON format; producing `.excalidraw` files needs no Python, no Playwright,
and no CDN. The user opens the file in Excalidraw where it is *editable*, which
is better for architecture diagrams that will be revised than a flat PNG. Both
risks disappear and nothing is lost.

**Generated the JSON instead of hand-writing it.** `SKILL.md` warns that
comprehensive diagrams blow the output token limit and must be built
section-by-section. A ~120-line generator sidesteps that entirely and keeps
spacing arithmetically consistent — 276 elements across two diagrams, none of
them hand-placed.

**Wrote a layout validator, because structural checks are not the same as
looking.** `check.py` catches overlapping filled rectangles, bound text
escaping its container, free text clipping a box edge, and dangling arrow
bindings. It found 3 real collisions in the system diagram and 8 in the data
diagram on first run.

**Fixed the validator when it was wrong, rather than the diagram.** It
initially flagged 11 "TEXT-ON-BOX" problems that were text deliberately placed
*inside* a panel — correct design. The right rule is: full containment is fine,
*partial* overlap means the text clips an edge. Tightening the check turned 19
findings into 8 real ones.

**Built a 60-line local SVG previewer rather than trusting the validator
alone.** Not a real Excalidraw renderer — no hand-drawn roughness — but enough
to see spacing, contrast, and flow. Entirely local: no network, no Playwright,
no CDN. Served over `python3 -m http.server` because the browser tool refuses
`file://` URLs.

**The diagrams state what is NOT built.** Dashed borders and an explicit legend
throughout: mapping profiles, canonicalizer, the knowledge plane, the promotion
gate, modes B and C, and 7 of 8 build-order steps are all marked planned. A
diagram that shows the target as though it exists is worse than no diagram — it
is the same failure as the mock data that used to render as real.

## Verified

```text
reliat-system-architecture.excalidraw: 95 elements,  canvas 140,36 → 1900,1880  clean
reliat-data-architecture.excalidraw:  181 elements, canvas 140,36 → 2140,2150  clean
```

Both regenerate from repo-relative paths and re-validate clean after the
generators were made portable.

Rendered locally and inspected in the browser at four scroll positions across
both files. Confirmed by eye: white-on-blue text in the API band has adequate
contrast (a low-res screenshot suggested otherwise; zooming showed it was
fine), the knowledge plane's apparent clipping was the viewport edge and not a
layout bug, and every band label, arrow, and legend lands where intended.

## Still open

- **The `.svg` previews go stale the moment the `.excalidraw` is edited.** They
  are a convenience for GitHub viewing, not a source of truth. Noted in the
  diagrams README.
- **Regenerating overwrites hand edits.** Once the diagrams are edited in
  Excalidraw, `_tools/` should be treated as dead.
- **`references/render_excalidraw.py` and `render_template.html` are on disk**
  inside the installed skill. Nothing invokes them, but if the renderer is ever
  wanted, pin the esm.sh import to a specific version with an SRI hash first.
- **Whitespace alignment inside centered labels** (e.g. `failure_modes      FM-014`)
  collapses in the SVG preview. Excalidraw itself preserves it; harmless either
  way since the labels are centered.
- Nothing from the previous session changed: slice 2 still unbuilt, no CI, and
  the repo still has ~40 uncommitted files.
