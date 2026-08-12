# Diagrams

Two views of the system, both editable.

| File | What it answers |
|---|---|
| `reliat-system-architecture.excalidraw` | One request, top to bottom. Where tenant identity is established and where it is enforced. Where the harness sits. |
| `reliat-data-architecture.excalidraw` | How a file of unknown shape becomes a cited answer. The three planes, the promotion gate, the three retrieval modes, the context budget. |
| `reliat-agent-harness.excalidraw` | The `ask` path. The bounded tool loop, the action space, the 15k-token ceiling, and the four properties that make it defensible. |
| `reliat-harness-detail.excalidraw` | The objects. Both entry points, the harness field by field with real per-tenant values, one tool round trip in full, and the repo layout. |

Solid = built and running. Dashed = designed, not built. Red = the isolation
boundary.

## Opening them

- **excalidraw.com** → Open → pick the file. It runs client-side; the file is
  not uploaded.
- **VS Code** → the *Excalidraw* extension opens `.excalidraw` natively.
- **Just looking** → the `.svg` next to each file is a flat preview that
  renders anywhere, including in GitHub.

Edit the `.excalidraw` freely — it is the source of truth. The `.svg` is a
snapshot and will go stale once you do.

## Regenerating

The diagrams were generated rather than hand-placed, so layout stays
consistent:

```bash
python3 docs/diagrams/_tools/gen_system.py
python3 docs/diagrams/_tools/gen_data.py
python3 docs/diagrams/_tools/gen_agent.py
python3 docs/diagrams/_tools/gen_harness_detail.py
python3 docs/diagrams/_tools/check.py docs/diagrams/*.excalidraw
python3 docs/diagrams/_tools/preview.py \
    docs/diagrams/reliat-system-architecture.excalidraw docs/diagrams/reliat-system-architecture.svg \
    docs/diagrams/reliat-data-architecture.excalidraw  docs/diagrams/reliat-data-architecture.svg \
    docs/diagrams/reliat-agent-harness.excalidraw     docs/diagrams/reliat-agent-harness.svg \
    docs/diagrams/reliat-harness-detail.excalidraw    docs/diagrams/reliat-harness-detail.svg
```

**Regenerating overwrites hand edits.** Once you start editing in Excalidraw,
treat the generators as dead and the `.excalidraw` as the source.

`check.py` is the useful part: it catches overlapping boxes, text escaping its
container, text clipping a box edge, and dangling arrow bindings — the layout
bugs that are invisible without rendering.

`preview.py` is a ~60-line local SVG renderer. It is deliberately *not* the
renderer bundled with the `excalidraw-diagram` skill, which pulls Excalidraw
from `https://esm.sh` unpinned at render time and needs a 150 MB Playwright
Chromium. Nothing here touches the network.
