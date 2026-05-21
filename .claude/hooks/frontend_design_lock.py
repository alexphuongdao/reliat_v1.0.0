#!/usr/bin/env python3
"""Hard-block edits to immutable frontend design files.

Allowed:
  - Edit/Write on frontend/data.jsx (the data seam).
  - Write on new files anywhere (extension allowed).

Blocked:
  - Edit/Write on any file in PROTECTED (the design language is immutable).
"""
import json
import os
import sys

PROTECTED = {
    "frontend/tokens.css",
    "frontend/ui.jsx",
    "frontend/charts.jsx",
    "frontend/app.jsx",
    "frontend/Reliat v1.html",
    "frontend/screens/agent.jsx",
    "frontend/screens/channels.jsx",
    "frontend/screens/library.jsx",
    "frontend/screens/notes.jsx",
    "frontend/screens/outliers.jsx",
    "frontend/screens/pulse.jsx",
}

REASON = (
    "Frontend design is IMMUTABLE. This file is part of the locked design "
    "language and cannot be modified by an agent. "
    "To change behaviour, edit `frontend/data.jsx` (the data seam) or add a "
    "NEW file that extends the design using existing primitives "
    "(tokens.css variables, ui.jsx components, charts.jsx). "
    "If a real product need requires modifying this file, ask the user first."
)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool = payload.get("tool_name", "")
    if tool not in ("Edit", "Write", "NotebookEdit"):
        sys.exit(0)

    tool_input = payload.get("tool_input") or {}
    fp = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    if not fp:
        sys.exit(0)

    cwd = payload.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or ""
    try:
        rel = os.path.relpath(fp, cwd) if cwd else fp
    except ValueError:
        rel = fp
    rel = rel.replace("\\", "/").lstrip("./")

    # Write to a new path is fine (extension).
    if tool == "Write" and not os.path.exists(fp):
        sys.exit(0)

    if rel in PROTECTED:
        sys.stdout.write(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": REASON,
            }
        }))
        sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()
