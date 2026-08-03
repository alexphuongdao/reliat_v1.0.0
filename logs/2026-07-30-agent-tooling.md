# 2026-07-30 — Agent tooling: enforced build logs + review commands

The build logs written earlier today (`auth-multitenant`, `loading-states`)
were produced ad hoc because the user asked for them. This makes the format
a repo convention, enforced rather than remembered, and adds three review
commands aimed at the specific ways this repo can hurt itself.

## What changed

| File | Change |
|---|---|
| `.claude/skills/build-log/SKILL.md` | Auto-triggering skill. Codifies the log format, the file-naming rule, and the six writing rules. Points at today's two logs as reference examples. |
| `.claude/hooks/build_log_reminder.py` | Stop hook. Blocks the turn ending if watched source is newer than the newest `logs/` entry. |
| `.claude/settings.json` | Registers the Stop hook alongside the existing PreToolUse design lock. |
| `.claude/commands/tenancy-review.md` | Manual audit: every route requires a principal, every query is tenant-scoped, then prove it with a throwaway tenant. |
| `.claude/commands/migration-review.md` | Manual audit: Alembic safety against a DB holding the only copy of real CEMEX data. |
| `.claude/commands/verify-ui.md` | Manual: drive the browser. Encodes the two bugs that passed every backend check today. |
| `.claude/README.md` | What each piece is, why it exists, and the gap none of it closes. |
| `.gitignore` | Ignores `.claude/.skip-build-log`. |

## Decisions worth remembering

**Skill + hook, not skill alone.** Skills auto-trigger on the model's
judgement of the description — reliable most of the time, which is not the
same as reliable. The user wanted the log *every* time. A Stop hook is
deterministic: it compares mtimes and blocks. The skill carries the format;
the hook carries the guarantee.

**mtime comparison, not `git status`.** The obvious check — "are there
uncommitted changes?" — is useless here: this repo has carried a large
uncommitted diff for days, so it would fire on every turn forever. Newest
watched source vs. newest `logs/` entry is stateless, needs no session
bookkeeping, and self-resets the moment a log is written.

**Explicit `WATCHED` list, not a whole-tree walk.** Watching everything
means firing on `.next/` rebuilds, `__pycache__`, and
`settings.local.json`, which churns every time a permission is granted. The
list names real source paths only.

**Blocks once, never traps.** Claude Code sets `stop_hook_active` when the
agent is already continuing because of a Stop hook; the script exits 0 in
that case. Worst case is one extra nudge per turn. A hook that could refuse
to let a session end would be worse than no hook.

**Reviews are commands, not skills.** The user was explicit that auto-firing
isn't always wanted. An audit that launches itself mid-task is an
interruption; these are things you run deliberately, before a merge or a
migration.

**The commands cite real incidents rather than generic advice.**
`/verify-ui` opens with the two bugs from today because a checklist nobody
believes gets skipped. A reviewer who knows `curl` returned 200 while the
login form was unreachable will actually open the browser.

## Verified

Hook logic, exercised directly with synthetic stdin:

| Case | Expected | Result |
|---|---|---|
| Source newer than logs | exit 2, reminder on stderr | exit 2, correct message + offending file |
| `stop_hook_active: true` | exit 0 (loop guard) | exit 0 |
| Log newer than source | exit 0 | exit 0 |
| `.skip-build-log` present | exit 0 | exit 0 |
| `.skip-build-log` aged 100 min (TTL 90) | exit 2 | exit 2 |
| Malformed stdin | exit 0, never block | exit 0 |

Registration:

- `.claude/settings.json` parses as valid JSON.
- All three commands were picked up and listed by name with their
  descriptions.
- `build-log` was picked up as an available skill.

## Still open

- **The Stop hook is unproven end-to-end.** Every branch was tested with
  synthetic input, but it has not yet fired for real inside a live turn —
  that first happens on the turn this log belongs to.
- **The 90-minute TTL is a guess.** Long enough to survive a focused
  session, short enough that a skip can't become permanent. Adjust
  `SKIP_TTL_MIN` if it grates.
- **Still no tests and no CI.** `pytest` sits in dev deps with zero test
  files, and nothing runs on push. This is the real gap, and none of this
  tooling closes it — `/tenancy-review` re-derives by hand what should be a
  dozen assertions running on every commit. Tenant isolation is the right
  first suite: security-critical, and its failure mode is silent.
- **`WATCHED` will drift.** New top-level source directories won't trigger
  the hook until they're added to the list.
