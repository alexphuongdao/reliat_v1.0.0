---
name: build-log
description: Write a session build log to logs/ recording what changed, why, what broke, and what is still open. Use whenever you have finished implementing a feature, fixing a bug, changing architecture, or making any non-trivial code change in this repo — before reporting completion to the user. A Stop hook enforces this.
---

# Build log

After finishing a piece of work, write a log to `logs/`. The user reads these
cold, days later, to remember what happened. The next agent session reads
them to learn what already exists and what is already known to be broken.

**Cost check:** a log is a few hundred lines of markdown, once per unit of
work. That is cheap. Skipping it and re-deriving the same context next
session is not.

## When to write one

Write a log when you have **changed the repo** in a way someone would want
explained: a feature, a bug fix, a refactor, a schema change, new tooling,
a dependency change.

Do **not** write one for: answering a question, reading code, running the
app without changing it, or a one-line typo fix.

## File

```
logs/YYYY-MM-DD-<kebab-topic>.md
```

Use the **real current date**. One file per topic, not per session — two
unrelated pieces of work on the same day get two files
(`2026-07-30-auth-multitenant.md`, `2026-07-30-loading-states.md`).

If you extend work already logged today, **edit that file** rather than
adding a near-duplicate.

## Format

Follow this shape. Skip sections that have nothing real in them — an empty
"Bugs" heading is worse than no heading.

````markdown
# YYYY-MM-DD — <short title, no fluff>

<1–3 sentences: what the state was before, and what problem this solves.
Written so someone who wasn't here understands why this happened at all.>

## What changed

| File | Change |
|---|---|
| `path/to/file.py` | One line. What it does now, not a diff. |

Group into sub-tables (`### Backend`, `### Frontend`, `### Ops`) when the
change spans areas.

## Decisions worth remembering

<Only non-obvious choices, each with the reason and the rejected
alternative. "Opaque sessions, not JWTs — an admin has to be able to revoke
a session; a JWT stays valid until it expires." Skip anything a reader
would infer from the code.>

## Bug found during verification

<Only if something actually broke. State the symptom, the cause, the fix.
Include the offending line if it's short. These are the highest-value
paragraphs in the file — a bug you hit once, you will hit again.>

## Verified

<Evidence, not claims. Tables of check → result. Real numbers, real status
codes, real ids. "Tested the API" is worthless; "unauthenticated
/api/channels → 401" is not.>

| Check | Result |
|---|---|
| … | … |

## Still open

<What you did NOT do, what is still mocked, what is known-broken, what was
deliberately deferred. Be blunt. This section is why the file is worth
reading — it stops the next session from assuming the work is complete.>
````

## Rules

1. **Evidence over assertion.** "Verified" means you ran it and are quoting
   the output. If you didn't verify it, it goes under "Still open".
2. **Name what's broken.** A log that only lists wins is a marketing
   document. The "Still open" section is mandatory whenever anything is
   incomplete.
3. **Explain the why, not the diff.** Git already has the diff. The log
   carries the reasoning that git can't.
4. **Plain language.** The user is technical but reads these fast. Short
   sentences. No filler adjectives.
5. **Don't inflate.** If the change was small, the log is short. A
   twenty-line log for a twenty-line change is correct.
6. **Cross-reference.** Link the plan or doc it implements
   (`docs/AuthPlan.md`) rather than restating it.

## Reference examples

`logs/2026-07-30-auth-multitenant.md` — large feature, two bugs found
during verification, long "Still open".

`logs/2026-07-30-loading-states.md` — small follow-up fix. Note how much
shorter it is, and that it still carries a trade-off note and a "Still on
mock" section.
