"""Structural validation for generated .excalidraw files. Catches the layout
bugs I can't see without a renderer: overlaps, text escaping its container,
orphaned bindings."""
import json
import sys

def extent(e):
    """True (x0, y0, x1, y1) of an element.

    Excalidraw anchors a linear element at its FIRST point and stores `width`
    as the bounding-box span, so `x + width` is wrong for any arrow that runs
    right-to-left or bottom-to-top — it reports an extent past the real one.
    Derive linear extents from the points instead.
    """
    if e.get("type") in ("arrow", "line") and e.get("points"):
        xs = [e["x"] + p[0] for p in e["points"]]
        ys = [e["y"] + p[1] for p in e["points"]]
        return min(xs), min(ys), max(xs), max(ys)
    return e["x"], e["y"], e["x"] + e["width"], e["y"] + e["height"]



def rects_overlap(a, b, pad=0):
    return not (a[0] + a[2] + pad <= b[0] or b[0] + b[2] + pad <= a[0]
                or a[1] + a[3] + pad <= b[1] or b[1] + b[3] + pad <= a[1])


def check(path):
    data = json.load(open(path))
    els = data["elements"]
    ids = {e["id"] for e in els}
    problems = []

    assert data["type"] == "excalidraw" and els, "invalid doc"

    # 1. bindings resolve
    for e in els:
        for key in ("startBinding", "endBinding"):
            b = e.get(key)
            if b and b.get("elementId") not in ids:
                problems.append(f"{e['id']}: {key} → missing {b.get('elementId')}")
        if e.get("containerId") and e["containerId"] not in ids:
            problems.append(f"{e['id']}: containerId → missing {e['containerId']}")
        for be in (e.get("boundElements") or []):
            if be["id"] not in ids:
                problems.append(f"{e['id']}: boundElement → missing {be['id']}")

    by_id = {e["id"]: e for e in els}

    # 2. bound text fits inside its container
    for e in els:
        if e["type"] == "text" and e.get("containerId"):
            p = by_id[e["containerId"]]
            if (e["x"] < p["x"] - 1 or e["y"] < p["y"] - 1
                    or e["x"] + e["width"] > p["x"] + p["width"] + 1
                    or e["y"] + e["height"] > p["y"] + p["height"] + 1):
                problems.append(
                    f"text overflows {p['id']}: text={e['width']:.0f}x{e['height']:.0f} "
                    f"box={p['width']}x{p['height']} :: {e['text'][:40]!r}")

    # 3. filled rectangles must not overlap each other
    filled = [e for e in els
              if e["type"] == "rectangle" and e["backgroundColor"] != "transparent"]
    for i, a in enumerate(filled):
        for b in filled[i + 1:]:
            ra = (a["x"], a["y"], a["width"], a["height"])
            rb = (b["x"], b["y"], b["width"], b["height"])
            if rects_overlap(ra, rb):
                problems.append(f"OVERLAP {a['id']} {ra} ↔ {b['id']} {rb}")

    # 4. free text may sit fully inside a panel (intentional), but must never
    #    PARTIALLY overlap a filled rect — that means it clips the edge.
    def contains(outer, inner):
        return (inner[0] >= outer[0] - 1 and inner[1] >= outer[1] - 1
                and inner[0] + inner[2] <= outer[0] + outer[2] + 1
                and inner[1] + inner[3] <= outer[1] + outer[3] + 1)

    for e in els:
        if e["type"] == "text" and not e.get("containerId"):
            rt = (e["x"], e["y"], e["width"], e["height"])
            for f in filled:
                rf = (f["x"], f["y"], f["width"], f["height"])
                if rects_overlap(rt, rf) and not contains(rf, rt):
                    problems.append(f"TEXT-CLIPS-BOX {e['text'][:34]!r} ↔ {f['id']}")

    xs = [e["x"] for e in els]
    ys = [e["y"] for e in els]
    xe = [extent(e)[2] for e in els]
    ye = [e["y"] + e["height"] for e in els]
    print(f"{path.split('/')[-1]}: {len(els)} elements, "
          f"canvas {min(xs):.0f},{min(ys):.0f} → {max(xe):.0f},{max(ye):.0f}")
    if problems:
        print(f"  {len(problems)} PROBLEM(S):")
        for p in problems[:25]:
            print("   -", p)
    else:
        print("  clean")
    return len(problems)


sys.exit(min(1, sum(check(p) for p in sys.argv[1:])))
