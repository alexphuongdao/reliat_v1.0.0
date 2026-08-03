# Front End Logs

This directory is the durable handoff for Reliat frontend and landing-page work.
It is intentionally separate from `/logs`, which documents the product,
backend, data, and application work.

## Start here in a new Codex session

Paste this prompt:

> Read `frontend-logs/README.md` and the newest dated file in
> `frontend-logs/` completely. Then inspect the current Git status and the
> landing-page source before changing anything. Work only in
> `Reliat landing-page prototype/` unless I explicitly expand the scope.
> Preserve the established editorial neo-Swiss visual system and treat each
> completed screen redesign as one atomic Git commit. Use the browser to
> inspect and scroll through desktop and phone layouts before presenting a
> result. Do not stage or modify unrelated backend work in this shared repo.

Then tell the agent which screen or issue to continue with.

## Durable working rules

- The cream background is non-negotiable: `#fff8e7`.
- Primary brand green is the quieter logo-derived emerald `#218157`.
- Preserve the lime selection/highlight color `#C1FF72` as a deliberate high
  point, not the default accent.
- Typography is Sora with restrained weights; IBM Plex Mono is used for
  technical labels and metadata.
- The target character is editorial neo-Swiss enterprise design: asymmetric
  hierarchy, square technical geometry, hairline rules, evidence-led content,
  and controlled color.
- Avoid generic SaaS/AI visual habits: repeated rounded cards, excessive pills,
  equal-weight grids, neon accents, gratuitous gradients, and decorative copy.
- Keep mining visuals physically credible. Rock remains rock-colored; the
  conveyor remains industrial rather than recolored to the brand palette.
- Edit the files in `Reliat landing-page prototype/src/`. Never hand-edit
  `Reliat Storyboard.dc.html`; regenerate it with `python3 build.py`.
- On screens below 900 px, the site becomes a normal vertical sequence. It must
  remain readable without horizontal overflow or disappearing animation.
- A completed screen redesign is one atomic unit and receives one Git commit.
  Small implementation iterations inside that screen do not receive separate
  commits.
- Before deployment, build, syntax-check, inspect the diff, and verify the real
  page in a browser at desktop and phone widths.
- This repository is often shared with another agent working on the app and
  backend. Stage explicit frontend paths only. Never sweep unrelated changes
  into a landing-page commit.

## Session index

- [2026-08-03 — Landing-page redesign and production launch](./2026-08-03-landing-page-session.md)
