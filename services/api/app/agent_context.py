"""Context assembly for the `ask` loop — deterministic, Python, never the model.

The model does not decide what goes into its own context. This does.

The loop is re-entrant by construction: nothing accumulates in memory between
rounds. Each round the builder is handed the same three things — the harness,
the thread's prior turns, and every tool round so far — and reconstructs the
whole request from scratch. That is what "the context is refilled on every
re-invocation" means here, and it is why a dropped result stays dropped in a
predictable way instead of depending on what happened to still be in a buffer.

The budget is enforced *before* the request is sent, not discovered afterwards
as a 400 from the API. Over budget, things are given up in a fixed order:

  1. oldest tool results are elided (replaced by a marker that keeps the row
     count and the ids, so the model still knows what it saw and can still
     cite it — it just cannot re-read the values),
  2. then oldest thread history is dropped, with an explicit marker,
  3. then the request is refused.

Results before history is deliberate. A tool result can be fetched again in a
later round for the cost of one round; a dropped conversation turn is gone for
good, and losing the question someone asked two turns ago is how an agent
starts answering something nobody asked.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any

from .harness import TenantHarness

#: Characters per token, for the pre-send estimate.
#:
#: There is no local tokenizer here and calling the count-tokens endpoint would
#: add a network round trip to every iteration of a loop that already makes
#: one. English prose runs ~4 chars/token; the JSON these tools return is
#: denser, ~3. Using 3.0 across the board errs high, which is the safe
#: direction: we drop evidence marginally earlier than strictly necessary
#: rather than discovering the ceiling as a paid-for API error.
CHARS_PER_TOKEN = 3.0

#: Ids kept in an elision marker. Enough for the model to still cite what it
#: saw; not so many that the marker costs as much as the rows did.
ELIDED_ID_SAMPLE = 12


class ContextTooLarge(RuntimeError):
    """The request cannot be made to fit, even with everything droppable gone.

    Raised only when the fixed floor — system prompt, tool schemas, and the
    question itself — already exceeds the tenant's ceiling. That is a
    configuration problem, not a runtime one, and it should surface as a clear
    failure rather than a truncated question.
    """


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def estimate_blocks(blocks: Any) -> int:
    """Token estimate for arbitrary message content (str or block list)."""
    if isinstance(blocks, str):
        return estimate_tokens(blocks)
    return estimate_tokens(json.dumps(blocks, default=str))


@dataclass
class RoundResult:
    """One executed tool call, as it will be shown back to the model."""

    tool_use_id: str
    name: str
    payload: dict[str, Any]
    is_error: bool = False
    #: Ids this call returned, kept so an elided result still carries them.
    ids: dict[str, set[str]] = field(default_factory=dict)
    elided: bool = False

    def content(self) -> str:
        if not self.elided:
            return json.dumps(self.payload, default=str)
        return json.dumps(self._marker(), default=str)

    def _marker(self) -> dict[str, Any]:
        sample: list[str] = []
        for kind, ids in sorted(self.ids.items()):
            for i in sorted(ids):
                sample.append(f"{kind}:{i}")
        overflow = max(0, len(sample) - ELIDED_ID_SAMPLE)
        return {
            "elided": True,
            "note": (
                f"This {self.name} result was dropped to stay within the context "
                "budget. Its ids are listed so you can still cite them; call the "
                "tool again if you need the values back."
            ),
            "row_count": self.payload.get("row_count"),
            "ids": sample[:ELIDED_ID_SAMPLE],
            "ids_omitted": overflow,
        }

    def as_tool_result_block(self) -> dict[str, Any]:
        return {
            "type": "tool_result",
            "tool_use_id": self.tool_use_id,
            "content": self.content(),
            **({"is_error": True} if self.is_error else {}),
        }

    def tokens(self) -> int:
        return estimate_tokens(self.content()) + 16  # block envelope


@dataclass
class Round:
    """One turn of the loop: what the model said, and what the tools answered."""

    assistant_blocks: list[dict[str, Any]]
    results: list[RoundResult] = field(default_factory=list)

    def tokens(self) -> int:
        return estimate_blocks(self.assistant_blocks) + sum(r.tokens() for r in self.results)


@dataclass
class HistoryTurn:
    """A persisted turn from an earlier question in the same thread.

    Deliberately not an ORM object: the builder is pure, so its budget
    arithmetic can be tested without a database.
    """

    role: str
    content: str

    def tokens(self) -> int:
        return estimate_tokens(self.content) + 8


@dataclass
class BuiltContext:
    system: list[dict[str, Any]]
    messages: list[dict[str, Any]]
    input_tokens: int
    dropped_history: int = 0
    elided_results: int = 0

    @property
    def notes(self) -> list[str]:
        out = []
        if self.dropped_history:
            out.append(f"{self.dropped_history} earlier turn(s) dropped")
        if self.elided_results:
            out.append(f"{self.elided_results} tool result(s) elided")
        return out


class ContextBuilder:
    """Assembles one request. Reusable across rounds; holds no loop state."""

    def __init__(
        self,
        harness: TenantHarness,
        *,
        history: list[HistoryTurn] | None = None,
        question: str,
    ) -> None:
        self.harness = harness
        self.history = list(history or [])
        self.question = question
        self._tools = harness.ask_tools()

        self._system_blocks: list[dict[str, Any]] = [
            {"type": "text", "text": harness.ask_prompt()}
        ]
        if harness.context.cache_system_prompt:
            # The system block and the tool schemas are byte-identical for
            # every question this tenant asks, so the breakpoint goes at the
            # end of the stable prefix. Reads bill at 0.10x, which is most of
            # why a six-round loop is affordable at all.
            self._system_blocks[-1]["cache_control"] = {"type": "ephemeral"}

    # ── fixed costs ──

    @property
    def tools(self) -> list[dict[str, Any]]:
        return self._tools

    def _floor_tokens(self) -> int:
        """What cannot be dropped: system, tool schemas, and the question."""
        return (
            estimate_blocks(self._system_blocks)
            + estimate_blocks(self._tools)
            + estimate_tokens(self.question)
            + 32
        )

    # ── assembly ──

    def build(self, rounds: list[Round] | None = None) -> BuiltContext:
        rounds = rounds or []
        policy = self.harness.context

        floor = self._floor_tokens()
        if floor > policy.max_input_tokens:
            raise ContextTooLarge(
                f"system prompt, tool schemas and question total ~{floor} tokens, "
                f"over this site's {policy.max_input_tokens} ceiling before any "
                "evidence is added"
            )

        # Reset elision each build: the caller may have dropped a round, and a
        # result elided in a tighter earlier build should not stay elided if it
        # now fits. Deciding fresh every time is what keeps this deterministic.
        for r in rounds:
            for res in r.results:
                res.elided = False

        history = list(self.history)
        dropped_history = 0
        elided = 0

        # 1 · sub-budget: tool results.
        elided += self._elide_results_to(rounds, policy.tool_result_token_budget)

        # 2 · sub-budget: history.
        history, dropped = self._trim_history_to(history, policy.history_token_budget)
        dropped_history += dropped

        # 3 · the hard ceiling, in the stated order.
        def total() -> int:
            return (
                floor
                + sum(t.tokens() for t in history)
                + sum(r.tokens() for r in rounds)
                + (24 if dropped_history else 0)
            )

        while total() > policy.max_input_tokens:
            if self._elide_oldest_result(rounds):
                elided += 1
                continue
            if history:
                history.pop(0)
                dropped_history += 1
                continue
            raise ContextTooLarge(
                f"~{total()} tokens with everything droppable already dropped, "
                f"over this site's {policy.max_input_tokens} ceiling"
            )

        messages = self._messages(history, rounds, dropped_history)
        return BuiltContext(
            system=self._system_blocks,
            messages=messages,
            input_tokens=total(),
            dropped_history=dropped_history,
            elided_results=elided,
        )

    # ── trimming ──

    @staticmethod
    def _elide_oldest_result(rounds: list[Round]) -> bool:
        """Elide the oldest result not yet elided. True if one was found."""
        for r in rounds:
            for res in r.results:
                if not res.elided:
                    res.elided = True
                    return True
        return False

    def _elide_results_to(self, rounds: list[Round], budget: int) -> int:
        count = 0
        def spent() -> int:
            return sum(res.tokens() for r in rounds for res in r.results)
        while spent() > budget and self._elide_oldest_result(rounds):
            count += 1
        return count

    @staticmethod
    def _trim_history_to(
        history: list[HistoryTurn], budget: int
    ) -> tuple[list[HistoryTurn], int]:
        dropped = 0
        while history and sum(t.tokens() for t in history) > budget:
            history.pop(0)
            dropped += 1
        return history, dropped

    # ── message shaping ──

    def _messages(
        self, history: list[HistoryTurn], rounds: list[Round], dropped_history: int
    ) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []

        if dropped_history:
            # Said out loud rather than silently truncated. A model that knows
            # the record is partial will hedge; one that thinks it has the
            # whole thread will answer with unearned certainty.
            messages.append({
                "role": "user",
                "content": (
                    f"[{dropped_history} earlier turn(s) in this conversation are "
                    "not shown — they exceeded the context budget. Ask if you need "
                    "something from them.]"
                ),
            })

        for turn in history:
            messages.append({"role": turn.role, "content": turn.content})

        # Anthropic rejects two consecutive messages with the same role, and a
        # thread whose last stored turn was a user message would produce
        # exactly that. Fold it in rather than dropping either.
        if messages and messages[-1]["role"] == "user":
            messages[-1] = {
                "role": "user",
                "content": f"{messages[-1]['content']}\n\n{self.question}",
            }
        else:
            messages.append({"role": "user", "content": self.question})

        for r in rounds:
            messages.append({"role": "assistant", "content": r.assistant_blocks})
            if r.results:
                messages.append({
                    "role": "user",
                    "content": [res.as_tool_result_block() for res in r.results],
                })

        return messages
