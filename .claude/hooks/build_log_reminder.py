#!/usr/bin/env python3
"""Stop hook — refuse to end a turn that changed code without logging it.

Fires when the agent tries to finish. If any watched source file is newer
than the newest file in `logs/`, the agent is told to write (or update) a
build log via the `build-log` skill before stopping.

Loop safety: Claude Code sets `stop_hook_active` when the agent is already
continuing because of a Stop hook. In that case this exits 0 immediately, so
the reminder can block at most once per turn — it nags, it never traps.

Escape hatch: `touch .claude/.skip-build-log` to silence it for a while
(the marker is honoured for SKIP_TTL_MIN minutes, then expires on its own so
a one-off skip can't quietly become permanent).
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# Directories and files whose modification implies "the repo changed in a way
# worth logging". Deliberately explicit: watching everything would fire on
# .next/ rebuilds, __pycache__, node_modules and settings.local.json churn.
WATCHED = [
    "services/api/app",
    "services/api/alembic/versions",
    "services/api/pyproject.toml",
    "apps/web/app",
    "apps/web/components",
    "apps/web/lib",
    "apps/web/styles",
    "apps/web/package.json",
    "docker-compose.yml",
    ".claude/hooks",
    ".claude/skills",
    ".claude/commands",
]

IGNORED_PARTS = {
    "__pycache__", "node_modules", ".next", ".git", ".venv",
    "dist", "build", ".turbo", ".pytest_cache",
}

SKIP_MARKER = ".claude/.skip-build-log"
SKIP_TTL_MIN = 90

REASON = """\
This turn changed code but `logs/` has no matching entry.

Use the `build-log` skill to write `logs/YYYY-MM-DD-<topic>.md` covering what
changed, the reasoning behind any non-obvious decision, what you actually
verified (with real output, not claims), and what is still open or broken.
If today's log already covers this work, update that file instead of adding
a new one.

If the user explicitly said not to log this, say so plainly and stop — this
reminder will not block you a second time."""


def newest_mtime(root: Path, paths: list[str]) -> tuple[float, str]:
    """Newest mtime across `paths`, with the file that produced it."""
    newest, which = 0.0, ""
    for rel in paths:
        target = root / rel
        if not target.exists():
            continue
        if target.is_file():
            candidates = [target]
        else:
            candidates = [
                p for p in target.rglob("*")
                if p.is_file() and not (IGNORED_PARTS & set(p.parts))
            ]
        for p in candidates:
            try:
                m = p.stat().st_mtime
            except OSError:
                continue
            if m > newest:
                newest, which = m, str(p.relative_to(root))
    return newest, which


def skip_active(root: Path) -> bool:
    marker = root / SKIP_MARKER
    if not marker.exists():
        return False
    age_min = (time.time() - marker.stat().st_mtime) / 60
    return age_min < SKIP_TTL_MIN


def project_root() -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0 and out.stdout.strip():
            return Path(out.stdout.strip())
    except Exception:
        pass
    return Path.cwd()


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # Malformed input is never a reason to block the user.

    # Already continuing because of a Stop hook — don't block again.
    if payload.get("stop_hook_active"):
        sys.exit(0)

    root = project_root()
    if skip_active(root):
        sys.exit(0)

    src_mtime, src_file = newest_mtime(root, WATCHED)
    if src_mtime == 0.0:
        sys.exit(0)

    logs_dir = root / "logs"
    log_mtime, _ = newest_mtime(root, ["logs"]) if logs_dir.exists() else (0.0, "")

    if src_mtime > log_mtime:
        print(f"{REASON}\n\n(newest change: {src_file})", file=sys.stderr)
        sys.exit(2)  # exit 2 on Stop = block, stderr goes back to the agent

    sys.exit(0)


if __name__ == "__main__":
    main()
