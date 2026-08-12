"""Minimal local SVG preview of an .excalidraw file — enough to eyeball layout.

Not a real Excalidraw renderer (no hand-drawn roughness). Purely local: no
network, no Playwright, no CDN. Used only to check spacing and overlap.
"""
import html
import json
import sys

def esc(s):
    return html.escape(s, quote=True)

def render(path, out):
    d = json.load(open(path))
    els = [e for e in d["elements"] if not e.get("isDeleted")]
    xs = [e["x"] for e in els] + [e["x"] + e["width"] for e in els]
    ys = [e["y"] for e in els] + [e["y"] + e["height"] for e in els]
    pad = 40
    minx, miny = min(xs) - pad, min(ys) - pad
    w, h = max(xs) - minx + pad, max(ys) - miny + pad

    p = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
         f'viewBox="{minx:.0f} {miny:.0f} {w:.0f} {h:.0f}" style="background:#fff">',
         '<defs><marker id="ah" markerWidth="10" markerHeight="7" refX="9" refY="3.5" '
         'orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="context-stroke"/></marker></defs>',
         f'<rect x="{minx}" y="{miny}" width="{w}" height="{h}" fill="#ffffff"/>']

    for e in els:
        t, sc = e["type"], e["strokeColor"]
        bg = e["backgroundColor"]
        dash = ' stroke-dasharray="8 5"' if e.get("strokeStyle") == "dashed" else ""
        sw = e.get("strokeWidth", 2)
        if t == "rectangle":
            rx = 8 if e.get("roundness") else 0
            p.append(f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["width"]}" '
                     f'height="{e["height"]}" rx="{rx}" fill="{bg}" stroke="{sc}" '
                     f'stroke-width="{sw}"{dash}/>')
        elif t == "ellipse":
            p.append(f'<ellipse cx="{e["x"]+e["width"]/2}" cy="{e["y"]+e["height"]/2}" '
                     f'rx="{e["width"]/2}" ry="{e["height"]/2}" fill="{bg}" '
                     f'stroke="{sc}" stroke-width="{sw}"{dash}/>')
        elif t in ("arrow", "line"):
            pts = " ".join(f'{e["x"]+px},{e["y"]+py}' for px, py in e["points"])
            mk = ' marker-end="url(#ah)"' if e.get("endArrowhead") else ""
            p.append(f'<polyline points="{pts}" fill="none" stroke="{sc}" '
                     f'stroke-width="{sw}"{dash}{mk}/>')
        elif t == "text":
            fs = e["fontSize"]
            lines = e["text"].split("\n")
            anchor = {"center": "middle", "right": "end"}.get(e.get("textAlign"), "start")
            tx = e["x"] + (e["width"] / 2 if anchor == "middle" else 0)
            for i, ln in enumerate(lines):
                p.append(f'<text x="{tx}" y="{e["y"] + fs + i*fs*1.25:.1f}" '
                         f'font-family="ui-monospace,Menlo,monospace" font-size="{fs}" '
                         f'fill="{sc}" text-anchor="{anchor}">{esc(ln)}</text>')
    p.append("</svg>")
    open(out, "w").write("\n".join(p))
    print(f"{out}  ({w:.0f}x{h:.0f})")

for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    render(src, dst)
