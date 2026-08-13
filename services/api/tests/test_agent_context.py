"""The context budget must bind before the request is sent, not after.

An agent loop that discovers its ceiling as a 400 from the API has already
paid for the round that overflowed, and has no say in what got cut. These
tests pin the two things that make the budget a design rather than a hope:
the estimate is computed up front, and what gets given up is fixed and
ordered — tool results, then history, then refusal.

No database and no network: `ContextBuilder` is pure by construction so its
arithmetic can be checked directly.
"""
from __future__ import annotations

import json
import unittest
from dataclasses import replace

from app.agent_context import (
    ContextBuilder,
    ContextTooLarge,
    HistoryTurn,
    Round,
    RoundResult,
    estimate_tokens,
)
from app.harness import CEMEX, DEMO, TOOL_QUERY_OUTLIERS


def big_result(tool_use_id: str, *, rows: int, ids: set[str] | None = None) -> RoundResult:
    return RoundResult(
        tool_use_id=tool_use_id,
        name=TOOL_QUERY_OUTLIERS,
        payload={
            "rows": [{"outlier_id": f"OUT-{i:05d}", "summary": "x" * 200}
                     for i in range(rows)],
            "row_count": rows,
        },
        ids={"outlier": ids or {f"OUT-{i:05d}" for i in range(rows)}},
    )


def round_with(*results: RoundResult) -> Round:
    return Round(
        assistant_blocks=[
            {"type": "tool_use", "id": r.tool_use_id, "name": r.name, "input": {}}
            for r in results
        ],
        results=list(results),
    )


class BudgetTests(unittest.TestCase):
    def build(self, harness=CEMEX, *, history=None, question="Why did CV42 spike?"):
        return ContextBuilder(harness, history=history, question=question)

    def test_a_small_ask_fits_and_reports_its_size(self) -> None:
        ctx = self.build().build([])
        self.assertGreater(ctx.input_tokens, 0)
        self.assertLessEqual(ctx.input_tokens, CEMEX.context.max_input_tokens)
        self.assertEqual(ctx.dropped_history, 0)
        self.assertEqual(ctx.elided_results, 0)

    def test_the_ceiling_is_never_exceeded_however_much_is_thrown_at_it(self) -> None:
        rounds = [round_with(big_result(f"tu{i}", rows=120)) for i in range(6)]
        history = [HistoryTurn("user", "q " * 2000), HistoryTurn("assistant", "a " * 2000)]
        ctx = self.build(history=history).build(rounds)
        self.assertLessEqual(ctx.input_tokens, CEMEX.context.max_input_tokens)
        self.assertGreater(ctx.elided_results, 0)

    def test_results_are_given_up_before_history(self) -> None:
        """A tool result can be re-fetched for the cost of one round. A dropped
        conversation turn is gone, and losing the question someone asked two
        turns ago is how an agent starts answering something nobody asked."""
        rounds = [round_with(big_result(f"tu{i}", rows=100)) for i in range(4)]
        history = [HistoryTurn("user", "an earlier question"),
                   HistoryTurn("assistant", "an earlier answer")]
        ctx = self.build(history=history).build(rounds)
        self.assertGreater(ctx.elided_results, 0)
        self.assertEqual(ctx.dropped_history, 0)

    def test_the_oldest_result_goes_first(self) -> None:
        rounds = [round_with(big_result(f"tu{i}", rows=100)) for i in range(4)]
        self.build().build(rounds)
        elided = [r.results[0].elided for r in rounds]
        # A prefix of Trues: oldest first, never a hole in the middle.
        self.assertEqual(elided, sorted(elided, reverse=True))
        self.assertTrue(elided[0])

    def test_history_is_dropped_only_once_results_are_exhausted(self) -> None:
        history = [HistoryTurn("user" if i % 2 == 0 else "assistant", "z" * 4000)
                   for i in range(12)]
        ctx = self.build(history=history).build([])
        self.assertGreater(ctx.dropped_history, 0)
        self.assertLessEqual(ctx.input_tokens, CEMEX.context.max_input_tokens)

    def test_a_question_that_cannot_fit_is_refused_not_truncated(self) -> None:
        with self.assertRaises(ContextTooLarge):
            self.build(question="q" * 200_000).build([])

    def test_refusal_names_the_ceiling(self) -> None:
        with self.assertRaises(ContextTooLarge) as caught:
            self.build(question="q" * 200_000).build([])
        self.assertIn(str(CEMEX.context.max_input_tokens), str(caught.exception))

    def test_the_budget_is_per_tenant(self) -> None:
        tight = replace(DEMO, context=replace(DEMO.context, max_input_tokens=3_000,
                                              history_token_budget=200,
                                              tool_result_token_budget=300))
        rounds = [round_with(big_result("tu0", rows=100))]
        ctx = ContextBuilder(tight, question="short question").build(rounds)
        self.assertLessEqual(ctx.input_tokens, 3_000)
        self.assertGreater(ctx.elided_results, 0)

    def test_building_twice_gives_the_same_answer(self) -> None:
        """Elision state is recomputed from scratch each build. A result elided
        under an earlier, tighter context must not stay elided once it fits."""
        rounds = [round_with(big_result(f"tu{i}", rows=100)) for i in range(4)]
        builder = self.build()
        first = builder.build(rounds)
        second = builder.build(rounds)
        self.assertEqual(first.input_tokens, second.input_tokens)
        self.assertEqual(first.elided_results, second.elided_results)
        self.assertEqual(first.messages, second.messages)

    def test_a_result_stops_being_elided_when_it_fits_again(self) -> None:
        # Small enough that one fits comfortably and eight do not.
        rounds = [round_with(big_result(f"tu{i}", rows=10)) for i in range(8)]
        builder = self.build()
        builder.build(rounds)
        self.assertTrue(rounds[0].results[0].elided)
        builder.build(rounds[:1])
        self.assertFalse(rounds[0].results[0].elided)


class ElisionTests(unittest.TestCase):
    def test_an_elided_result_still_carries_its_ids(self) -> None:
        """The model has to be able to cite what it saw. Dropping the values
        without the ids would make everything it read unciteable, and citation
        is the whole audit trail."""
        result = big_result("tu0", rows=40)
        result.elided = True
        marker = json.loads(result.content())
        self.assertTrue(marker["elided"])
        self.assertEqual(marker["row_count"], 40)
        self.assertTrue(marker["ids"])
        self.assertGreater(marker["ids_omitted"], 0)
        self.assertIn("call the tool again", marker["note"])

    def test_an_elided_result_is_much_smaller(self) -> None:
        result = big_result("tu0", rows=100)
        full = result.tokens()
        result.elided = True
        self.assertLess(result.tokens(), full / 4)

    def test_dropped_history_is_announced_not_hidden(self) -> None:
        """A model that knows the record is partial hedges. One that thinks it
        has the whole thread answers with unearned certainty."""
        history = [HistoryTurn("user" if i % 2 == 0 else "assistant", "z" * 4000)
                   for i in range(12)]
        ctx = ContextBuilder(CEMEX, history=history, question="q").build([])
        self.assertIn("not shown", json.dumps(ctx.messages))


class MessageShapeTests(unittest.TestCase):
    def test_no_two_consecutive_messages_share_a_role(self) -> None:
        """The API rejects it, and a thread whose last stored turn was a user
        message would produce exactly that."""
        history = [HistoryTurn("user", "first"), HistoryTurn("assistant", "reply"),
                   HistoryTurn("user", "second")]
        rounds = [round_with(big_result("tu0", rows=2)),
                  round_with(big_result("tu1", rows=2))]
        ctx = ContextBuilder(CEMEX, history=history, question="third").build(rounds)
        roles = [m["role"] for m in ctx.messages]
        for a, b in zip(roles, roles[1:]):
            self.assertNotEqual(a, b, roles)

    def test_a_trailing_user_turn_absorbs_the_question(self) -> None:
        history = [HistoryTurn("user", "an unanswered earlier question")]
        ctx = ContextBuilder(CEMEX, history=history, question="the new one").build([])
        self.assertIn("an unanswered earlier question", ctx.messages[-1]["content"])
        self.assertIn("the new one", ctx.messages[-1]["content"])

    def test_every_tool_use_gets_a_paired_tool_result(self) -> None:
        rounds = [round_with(big_result("tu0", rows=2), big_result("tu1", rows=2))]
        ctx = ContextBuilder(CEMEX, question="q").build(rounds)
        used = {b["id"] for m in ctx.messages if isinstance(m["content"], list)
                for b in m["content"] if b.get("type") == "tool_use"}
        answered = {b["tool_use_id"] for m in ctx.messages if isinstance(m["content"], list)
                    for b in m["content"] if b.get("type") == "tool_result"}
        self.assertEqual(used, answered)

    def test_elision_preserves_the_pairing(self) -> None:
        """Elision replaces a result's *content*. Removing the message would
        orphan its tool_use block and the API would reject the request."""
        rounds = [round_with(big_result(f"tu{i}", rows=100)) for i in range(5)]
        ctx = ContextBuilder(CEMEX, question="q").build(rounds)
        used = {b["id"] for m in ctx.messages if isinstance(m["content"], list)
                for b in m["content"] if b.get("type") == "tool_use"}
        answered = {b["tool_use_id"] for m in ctx.messages if isinstance(m["content"], list)
                    for b in m["content"] if b.get("type") == "tool_result"}
        self.assertEqual(used, answered)

    def test_an_error_result_is_marked_as_one(self) -> None:
        err = RoundResult("tu0", TOOL_QUERY_OUTLIERS, {"error": "bad severity"},
                          is_error=True)
        block = err.as_tool_result_block()
        self.assertTrue(block["is_error"])

    def test_the_system_prefix_is_cached_when_the_harness_says_so(self) -> None:
        ctx = ContextBuilder(CEMEX, question="q").build([])
        self.assertEqual(ctx.system[-1]["cache_control"], {"type": "ephemeral"})

    def test_the_context_carries_this_tenants_prompt_and_tools(self) -> None:
        builder = ContextBuilder(DEMO, question="q")
        ctx = builder.build([])
        self.assertIn(DEMO.instrument, ctx.system[0]["text"])
        self.assertNotIn("SDRatio10_5", json.dumps(builder.tools))


class EstimateTests(unittest.TestCase):
    def test_the_estimate_errs_high(self) -> None:
        """Erring high drops evidence marginally early. Erring low means
        discovering the ceiling as a paid-for API error."""
        prose = "The conveyor F80 rose to 2.78 mm against a 0.67 mm baseline. " * 20
        # Real tokenisation of English prose is ~4 chars/token; we must not be
        # under that.
        self.assertGreaterEqual(estimate_tokens(prose), len(prose) / 4)

    def test_empty_text_costs_nothing(self) -> None:
        self.assertEqual(estimate_tokens(""), 0)


if __name__ == "__main__":
    unittest.main()
