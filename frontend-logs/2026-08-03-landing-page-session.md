# 2026-08-03 — Landing-page redesign and production launch

## Current production state

- Production domain: <https://reliat.live>
- Cloudflare Pages URL: <https://reliat-landing.pages.dev>
- GitHub repository: `alexphuongdao/reliat_v1.0.0`
- Production branch: `main`
- Production commit at the end of this session: `088a105`
- Verified production HTML SHA-256:
  `e513a7939aa325f7cf7a403f278022f9fba4856a29de68bac6654f97cc2e4ece`
- Cloudflare deploys automatically after an approved push to `main`.

The production HTML was fetched from `reliat.live` and matched the reviewed
local build byte for byte at the end of the session.

## Product story

The page follows one oversize material event from the conveyor through
detection, particle-size analysis, evidence assembly, root-cause ranking,
plant propagation, and the final incident artifact. The user should feel that
Reliat reconstructs a real industrial event rather than displaying a generic
analytics dashboard.

The intended tone is precise, quiet, credible, and slightly luxurious. It
should resemble a high-end engineering publication or serious enterprise
instrument, not an AI-generated SaaS template.

## Visual system

### Color

- Cream background: `#fff8e7` — must remain.
- Deep Reliat emerald: `#218157` — primary outlines, event path, status
  accents, progress, and CTA backgrounds.
- Lime highlight: `#C1FF72` — reserved for the hero text highlight and rare
  emphasis.
- Dark purple: `#260E69`.
- Blue: `#1F41BB`.
- Light blue: `#38B6FF`.
- Dark blue/navy: `#101728`.
- Rocks and conveyor use physically plausible mining colors, not brand green.

The original bright `#00BF63` accent was rejected because it looked synthetic
against the cream background. The current `#218157` was chosen from the darker
range of the logo and gives the cream-white CTA text approximately 4.75:1
contrast.

### Typography

- Primary font: Sora from Google Fonts.
- Headlines use light weights to retain the concise, luxury quality the user
  liked in Codec Pro Light.
- Technical labels: IBM Plex Mono.
- Codec Pro was not purchased or bundled.

### Shape and hierarchy

- Prefer square or nearly square technical plates.
- Use hairline separators and structured metadata rails.
- Use rounded pills only when the object is genuinely a status chip or CTA.
- Establish a clear primary finding; do not make every card equally important.
- Use green as information, not decoration.

## Completed work

### Foundation and responsive behavior

- Removed the overlapping “scroll to follow the event” helper.
- Made the conveyor visible from the hero and carried it into the scan scene as
  the user scrolls.
- Removed the Motion Full / Motion Reduced controls and their dead code.
- Added automatic responsive behavior. Desktop uses the scroll-driven cinematic
  treatment; viewports below 900 px and reduced-motion environments use a
  readable vertical sequence.
- Added the Reliat logo assets under
  `Reliat landing-page prototype/assets/brand/`.
- Replaced the previous font treatment with Sora.
- Added the permanent lime highlight around “oversize event” in the hero.
- Temporarily removed the app/auth link from the primary public CTA and used a
  linkless Contact us button.

### Propagation / incident trace

- Rebuilt the late pipeline chart as an industrial incident-trace plate.
- Replaced generic pills with numbered equipment, square geometry, metadata,
  and a restrained engineering fact rail.
- Docked the incident chip so it does not cross the heading.
- Increased the desktop scroll track from `1200vh` to `1500vh`.
- Added requestAnimationFrame-based exponential scroll smoothing and removed
  competing CSS transitions that caused double-easing.
- The event path now draws sequentially across the plant and holds long enough
  to read.

### Phase 01 — Evidence

- Replaced five equal rounded cards with one editorial evidence dossier.
- Made P80 particle size the dominant finding.
- Arranged four corroborating signals in a disciplined 2×2 matrix.
- Added the incident ID, correlation window, aligned-signal count, and event
  path verdict in a shared metadata rail.
- Sparklines draw progressively, and evidence resolves in reading order.
- Mobile becomes one vertical dossier without horizontal overflow.

### Phase 01 — Root Cause

- Replaced three generic cards with a ranked engineering assessment.
- The leading hypothesis is clearly distinct from the two alternatives.
- Each row exposes supporting, contradicting, and missing evidence.
- Added assessment basis, provisional status, next-best check, confidence
  values, and visible ranking labels.
- Tightened motion timing so every evidence column and confidence bar resolves
  before Phase 02 begins.
- Mobile metadata expands into readable rows rather than truncating.

### Brand green refinement

- Replaced the saturated `#00BF63` site accent with `#218157`.
- Applied it consistently to CTAs, progress, incident status, evidence rules,
  root-cause hierarchy, topology paths, and phase labels.
- Preserved lime and lighter chart colors so the page still has visual range.

## Source architecture

The landing page is intentionally a static, framework-free component. React or
Next.js is not needed for hosting or maintenance.

- `Reliat landing-page prototype/src/00-head-and-style.html` — fonts and CSS.
- `src/01-chrome-and-chip.html` — fixed navigation and incident chip.
- `src/02-track-open.html` — track, world, canvas, and video setup.
- `src/03-scene-hero.html` — hero.
- `src/04-scene-belt-scan.html` — conveyor detection.
- `src/05-scene-analysis.html` — size distribution and bounded anomaly.
- `src/06-scene-evidence.html` — Evidence dossier.
- `src/07-scene-hypotheses.html` — Root Cause assessment.
- `src/08-scene-topology.html` — plant propagation trace.
- `src/09-scene-artifact-cta.html` — artifact and final CTA.
- `src/12-behavior.js` — scroll, canvas, charts, topology, responsive mode, and
  animation timing.
- `build.py` — assembles the source parts into `Reliat Storyboard.dc.html` and
  `dist/index.html`.

Edit source parts, then build:

```bash
cd "Reliat landing-page prototype"
python3 build.py
node --check src/12-behavior.js
git diff --check -- .
```

For local review:

```bash
cd "Reliat landing-page prototype"
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/Reliat%20Storyboard.dc.html
```

Scroll through the actual page at several progress values. Do not approve a
motion change from source inspection alone.

## Atomic commit history

The landing work was developed on a shared feature branch and transplanted as
landing-only commits onto production `main`. The production hashes are the
canonical deployment history:

- `a3756a5` — incident-trace motion and visual polish.
- `be61f6d` — Evidence neo-Swiss dossier.
- `2668e9b` — Root Cause ranked assessment.
- `088a105` — deeper primary green accent.

The corresponding development-branch commits were:

- `e6ca773`
- `6eccfef`
- `2e6c326`
- `34d82e2`

## Safe deployment workflow

Because another agent can be working in the same checkout, do not assume the
currently checked-out branch should be pushed to production.

1. Inspect `git status -sb`, `git branch -avv`, and the commit graph.
2. Commit only the completed frontend atomic unit.
3. Fetch `origin/main`.
4. If the active branch contains unrelated backend history, create a temporary
   worktree from `origin/main`.
5. Cherry-pick only the approved landing commits.
6. Compare the entire landing directory with the reviewed checkout.
7. Run the build and syntax checks in the clean worktree.
8. Push the verified clean HEAD to `main`.
9. Fetch `https://reliat.live` with a cache-busting query and verify the served
   HTML hash and expected copy/color markers.

Never stage the repository root while backend work is present.

## What to improve next

- Continue auditing earlier detection and resolution scenes for generic visual
  patterns, but redesign only one screen at a time.
- The final incident artifact still uses more rounded-card styling than the
  newer Evidence, Root Cause, and Propagation scenes. It is the most likely next
  candidate for the same editorial treatment.
- Reassess pills and rounded CTAs only after content hierarchy is correct; do
  not remove useful status semantics merely to make the page square.
- Preserve the current motion pacing unless a real scroll review identifies a
  specific reading problem.

## Shared-workspace warning

At the end of this session, unrelated application and backend files remained
modified or untracked in the primary checkout. They belong to another work
stream. Do not discard, stage, commit, or deploy them as part of landing-page
work.
