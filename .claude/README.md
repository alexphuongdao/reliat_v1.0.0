# Agent tooling

What's wired up in this repo, and why. Everything here exists because of a
real failure or a real risk — not as generic best practice.

## Skills (auto-triggering)

Claude invokes these on its own when the description matches the work.

| Skill | Fires when |
|---|---|
| `build-log` | Any non-trivial change is finished. Writes `logs/YYYY-MM-DD-<topic>.md`. Backed by a Stop hook, so it's enforced rather than hoped for. |
| `frontend-design-locked` | Touching `/frontend`. That design is immutable; backed by a PreToolUse hook that hard-blocks edits. |

## Commands (you invoke them)

Deliberately manual — these are audits you want on your schedule, not
Claude's.

| Command | Use before |
|---|---|
| `/tenancy-review` | Merging anything that adds or changes an API route. Checks every query is scoped to the caller's customer, then proves it with a throwaway tenant. |
| `/migration-review` | Running any Alembic migration. This DB holds the only copy of real CEMEX data, with no backup and no staging. |
| `/verify-ui` | Calling a user-facing change done. Drives the actual browser, because two bugs on 2026-07-30 passed every backend check. |

## Hooks

| Event | Script | Effect |
|---|---|---|
| `PreToolUse` (Edit/Write) | `hooks/frontend_design_lock.py` | Denies edits to locked design files. |
| `Stop` | `hooks/build_log_reminder.py` | Blocks the turn from ending if watched source is newer than the newest `logs/` entry. |

### The build-log hook, specifically

It compares mtimes: newest file under the watched source paths vs. newest
file in `logs/`. Source newer → block once with a reminder.

- **It can't trap you.** Claude Code sets `stop_hook_active` when the agent
  is already continuing because of a Stop hook, so it blocks at most once
  per turn.
- **It ignores noise.** Only explicit source paths are watched — not
  `.next/`, `node_modules/`, `__pycache__/`, or `settings.local.json`.
- **Escape hatch:** `touch .claude/.skip-build-log` silences it for 90
  minutes, then expires on its own so a one-off skip can't quietly become
  permanent.
- **It never blocks on its own errors.** Malformed input or an unreadable
  tree exits 0.

To adjust what counts as "code changed", edit `WATCHED` in the script.

## The gap this tooling does not close

**There are no tests.** `pytest` is in `services/api/pyproject.toml` dev
deps and zero test files exist. No CI either — nothing runs on push.

That is the largest remaining distance between this repo and a production
practice, and no skill or command fixes it: a command that says "write
tests" is not a test suite. The highest-value first suite would be tenant
isolation — the boundary is security-critical, its failure mode is silent,
and `/tenancy-review` currently re-derives by hand what should be a dozen
assertions running on every commit.
