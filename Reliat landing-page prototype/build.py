#!/usr/bin/env python3
"""Build the landing page from editable source into a deployable site.

The page is a single-file component contract for the custom ``<x-dc>``
runtime in ``public/support.js``. The ordered files in ``src/MANIFEST.txt``
are concatenated byte-for-byte into ``dist/index.html``; everything in
``public/`` is then copied beside it with the same relative paths.

Only ``src/`` and ``public/`` are website inputs. ``dist/`` is disposable
generated output and must never be edited by hand.
"""
import hashlib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
PUBLIC = ROOT / "public"
DIST = ROOT / "dist"
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

    if not PUBLIC.is_dir():
        print("build.py: missing public directory", file=sys.stderr)
        return 1

    assembled = b"".join(chunks)

    # Recreate the output so removed or renamed source assets cannot linger in
    # a deployment. Copying public/ preserves the URLs referenced by the page.
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(PUBLIC, DIST)
    (DIST / "index.html").write_bytes(assembled)

    digest = hashlib.sha256(assembled).hexdigest()
    print(f"built dist/ from {len(names)} parts — index sha256 {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
