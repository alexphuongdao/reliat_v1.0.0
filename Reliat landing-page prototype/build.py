#!/usr/bin/env python3
"""Reassembles src/*.html + src/12-behavior.js into the single file the
runtime (support.js) actually serves: "Reliat Storyboard.dc.html".

Why this exists: the storyboard is a single-file component contract for a
custom <x-dc> runtime (helmet/style, {{ }} bindings, a <script
type="text/x-dc" data-props="..."> block). That contract is not something to
hand-modify around — this script just concatenates the ordered parts in
src/MANIFEST.txt back into one file, byte for byte. Edit the parts, run this,
refresh the browser. Never hand-edit "Reliat Storyboard.dc.html" directly —
it's a build artifact and will be overwritten.
"""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "Reliat Storyboard.dc.html"
MANIFEST = SRC / "MANIFEST.txt"


def main() -> int:
    names = [line.strip() for line in MANIFEST.read_text().splitlines() if line.strip()]
    chunks = []
    for name in names:
        path = SRC / name
        if not path.exists():
            print(f"build.py: missing part {name}", file=sys.stderr)
            return 1
        chunks.append(path.read_bytes())

    assembled = b"".join(chunks)
    OUT.write_bytes(assembled)
    digest = hashlib.sha256(assembled).hexdigest()
    print(f"built {OUT.name} from {len(names)} parts — sha256 {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
