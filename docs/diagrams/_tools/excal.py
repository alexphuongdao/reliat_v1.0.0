"""Tiny Excalidraw JSON builder. No third-party deps, nothing executed from the skill."""
from __future__ import annotations

import json
import random

# Palette (from .claude/skills/excalidraw-diagram/references/color-palette.md)
PRIMARY   = ("#3b82f6", "#1e3a5f")
SECONDARY = ("#60a5fa", "#1e3a5f")
TERTIARY  = ("#93c5fd", "#1e3a5f")
TRIGGER   = ("#fed7aa", "#c2410c")
SUCCESS   = ("#a7f3d0", "#047857")
WARNING   = ("#fee2e2", "#dc2626")
DECISION  = ("#fef3c7", "#b45309")
AI        = ("#ddd6fe", "#6d28d9")
INACTIVE  = ("#dbeafe", "#1e40af")
ERROR     = ("#fecaca", "#b91c1c")

T_TITLE = "#1e40af"
T_SUB   = "#3b82f6"
T_BODY  = "#64748b"
T_ON    = "#374151"
SLATE   = "#64748b"
CODE_BG = "#1e293b"
CODE_FG = "#22c55e"


def dims(s: str, size: int) -> tuple[float, float]:
    lines = s.split("\n")
    return max(len(l) for l in lines) * size * 0.6, len(lines) * size * 1.25


class Canvas:
    def __init__(self) -> None:
        self.els: list[dict] = []
        self.rng = random.Random(7)
        self.n = 0

    def _id(self, p: str) -> str:
        self.n += 1
        return f"{p}{self.n}"

    def _base(self, eid: str, typ: str, x, y, w, h, stroke, bg, *,
              dashed=False, sw=2, opacity=100, roughness=1) -> dict:
        return {
            "id": eid, "type": typ, "x": x, "y": y, "width": w, "height": h,
            "angle": 0, "strokeColor": stroke, "backgroundColor": bg,
            "fillStyle": "solid", "strokeWidth": sw,
            "strokeStyle": "dashed" if dashed else "solid",
            "roughness": roughness, "opacity": opacity,
            "seed": self.rng.randint(1, 2**31), "version": 1,
            "versionNonce": self.rng.randint(1, 2**31), "isDeleted": False,
            "groupIds": [], "boundElements": None, "updated": 1,
            "link": None, "locked": False, "frameId": None,
        }

    def text(self, x, y, s, size=16, color=T_BODY, align="left", eid=None) -> str:
        eid = eid or self._id("t")
        w, h = dims(s, size)
        e = self._base(eid, "text", x, y, w, h, color, "transparent", sw=1, roughness=0)
        e.update({
            "text": s, "originalText": s, "fontSize": size, "fontFamily": 3,
            "textAlign": align, "verticalAlign": "top", "containerId": None,
            "lineHeight": 1.25, "autoResize": True,
        })
        self.els.append(e)
        return eid

    def rect(self, x, y, w, h, label="", pal=PRIMARY, *, size=14, dashed=False,
             text_color=None, roughness=1, sw=2, bg=None, eid=None) -> str:
        eid = eid or self._id("r")
        fill, stroke = pal
        e = self._base(eid, "rectangle", x, y, w, h, stroke,
                       bg if bg is not None else fill,
                       dashed=dashed, sw=sw, roughness=roughness)
        e["roundness"] = {"type": 3}
        self.els.append(e)
        if label:
            tid = self._id("t")
            tw, th = dims(label, size)
            te = self._base(tid, "text", x + (w - tw) / 2, y + (h - th) / 2,
                            tw, th, text_color or T_ON, "transparent", sw=1, roughness=0)
            te.update({
                "text": label, "originalText": label, "fontSize": size,
                "fontFamily": 3, "textAlign": "center", "verticalAlign": "middle",
                "containerId": eid, "lineHeight": 1.25, "autoResize": True,
            })
            self.els.append(te)
            e["boundElements"] = [{"id": tid, "type": "text"}]
        return eid

    def group(self, x, y, w, h, label, color=SLATE, *, dashed=True, size=15) -> str:
        """Transparent section container with a label above its top-left."""
        eid = self.rect(x, y, w, h, "", (("transparent"), color), dashed=dashed,
                        sw=2, roughness=0, bg="transparent")
        self.text(x + 14, y - 26, label, size, color)
        return eid

    def arrow(self, pts, color=SLATE, *, dashed=False, head="arrow", sw=2,
              start=None, end=None, label=None, label_size=12, label_color=None,
              label_off=(0, -20)) -> str:
        eid = self._id("a")
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, y0 = pts[0]
        rel = [[p[0] - x0, p[1] - y0] for p in pts]
        e = self._base(eid, "arrow", x0, y0, max(xs) - min(xs), max(ys) - min(ys),
                       color, "transparent", dashed=dashed, sw=sw, roughness=0)
        e.update({
            "points": rel, "startArrowhead": None, "endArrowhead": head,
            "startBinding": {"elementId": start, "focus": 0, "gap": 4} if start else None,
            "endBinding": {"elementId": end, "focus": 0, "gap": 4} if end else None,
            "elbowed": False,
        })
        self.els.append(e)
        if label:
            mid = pts[len(pts) // 2]
            w, _ = dims(label, label_size)
            self.text(mid[0] - w / 2 + label_off[0], mid[1] + label_off[1],
                      label, label_size, label_color or color)
        return eid

    def line(self, pts, color=SLATE, *, dashed=False, sw=2) -> str:
        eid = self._id("l")
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, y0 = pts[0]
        e = self._base(eid, "line", x0, y0, max(xs) - min(xs), max(ys) - min(ys),
                       color, "transparent", dashed=dashed, sw=sw, roughness=0)
        e.update({"points": [[p[0] - x0, p[1] - y0] for p in pts],
                  "startArrowhead": None, "endArrowhead": None})
        self.els.append(e)
        return eid

    def code(self, x, y, s, *, size=13, pad=14) -> str:
        w, h = dims(s, size)
        eid = self.rect(x, y, w + pad * 2, h + pad * 2, "", (CODE_BG, CODE_BG),
                        roughness=0, sw=1)
        tid = self._id("t")
        te = self._base(tid, "text", x + pad, y + pad, w, h, CODE_FG,
                        "transparent", sw=1, roughness=0)
        te.update({"text": s, "originalText": s, "fontSize": size, "fontFamily": 3,
                   "textAlign": "left", "verticalAlign": "top", "containerId": None,
                   "lineHeight": 1.25, "autoResize": True})
        self.els.append(te)
        return eid

    def save(self, path: str) -> None:
        doc = {
            "type": "excalidraw", "version": 2,
            "source": "https://excalidraw.com",
            "elements": self.els,
            "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
            "files": {},
        }
        with open(path, "w") as fh:
            json.dump(doc, fh, indent=1)
        print(f"{path}: {len(self.els)} elements")
