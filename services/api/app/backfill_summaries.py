"""Rewrite stored outlier summaries that assert a root cause nobody inferred.

The detector used to write six templated explanations naming physical causes
("consistent with oversized fragments bypassing the grizzly screen") and six
suggested actions, one naming equipment that does not exist ("grizzly screen
panel C-3"). Those strings are already sitting in `outliers.summary` and
`outliers.action` for every event ever detected — changing `detector.py` only
fixes rows detected from now on.

This rewrites the existing rows from the numbers stored alongside them, so no
event is re-detected and no id, status, assignee or diagnosis link changes.

    docker compose exec api python -m app.backfill_summaries          # dry run
    docker compose exec api python -m app.backfill_summaries --apply

The direction of the deviation is recovered from `value` vs `baseline`;
`outliers.deviation` is stored as an absolute sigma, so its sign is gone.
"""
from __future__ import annotations

import sys

from .db import session_scope
from .detector import WINDOW, _summarize
from .models import Outlier

#: Fragments that only appear in the old templated text. Used to report how
#: many rows carried a fabricated causal claim, not to decide what to rewrite —
#: every row is rewritten from its own numbers regardless.
FABRICATED_MARKERS = (
    "grizzly screen",
    "stockpile reclaim",
    "high-iron ore",
    "dust suppression",
    "camera vibration",
    "programming artifact",
    "panel C-3",
    "SAG draw",
)


def main(apply: bool) -> int:
    with session_scope() as session:
        rows = session.query(Outlier).all()
        fabricated = sum(
            1 for o in rows
            if any(m in (o.summary or "") or m in (o.action or "") for m in FABRICATED_MARKERS)
        )
        had_action = sum(1 for o in rows if (o.action or "").strip())

        print(f"outliers                     : {len(rows)}")
        print(f"  carrying a fabricated cause: {fabricated}")
        print(f"  carrying a suggested action: {had_action}")

        if not apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            if rows:
                o = rows[0]
                signed = o.deviation if o.value >= o.baseline else -o.deviation
                print(f"\n  before: {o.summary}")
                print(f"  after : {_summarize(o.metric, o.unit, o.value, o.baseline, signed, WINDOW)}")
            return 0

        for o in rows:
            # `deviation` is absolute; recover the sign from the values.
            signed = o.deviation if o.value >= o.baseline else -o.deviation
            o.summary = _summarize(o.metric, o.unit, o.value, o.baseline, signed, WINDOW)
            # Only an agent may recommend an action.
            o.action = ""

        print(f"\nrewrote {len(rows)} summaries, cleared {had_action} actions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(apply="--apply" in sys.argv))
