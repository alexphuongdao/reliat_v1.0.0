"""The agent harness must be selected by tenant, and must not leak across.

The model is shared. The context is not. These tests pin the properties that
make that safe: a tenant only ever gets its own prompt, its own evidence
fields, and its own failure categories — and an unprofiled tenant gets a
conservative fallback rather than someone else's profile.

See docs/PlatformArchitecture.md §3 and app/harness.py.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.harness import (
    CEMEX,
    DEMO,
    GENERIC,
    MAX_OUTLIER_ROWS,
    MAX_WINDOW_AFTER,
    MAX_WINDOW_BEFORE,
    READ_TOOLS,
    TOOL_CHANNEL_STATS,
    TOOL_MEASUREMENT_WINDOW,
    TOOL_QUERY_OUTLIERS,
    TOOL_SUBMIT_ANSWER,
    harness_for_slug,
    harness_for_tenant,
)
from app.models import Measurement, Tenant

#: Columns that only a real vendor instrument reports. A harness that offers
#: these to a tenant whose rows have them NULL is inviting the model to cite
#: measurements that do not exist.
VENDOR_ONLY_COLUMNS = {"sd_ratio_10_5", "video_r", "video_g", "video_b"}


def tenant(slug: str) -> Tenant:
    return Tenant(id=f"tn_{slug}", slug=slug, name=slug.title(), active=True,
                  created_at=datetime(2026, 1, 1))


class TestSelection:
    def test_each_tenant_gets_its_own_harness(self) -> None:
        assert harness_for_tenant(tenant("cemex")).slug == "cemex"
        assert harness_for_tenant(tenant("demo")).slug == "demo"

    def test_unknown_tenant_falls_back_to_generic_not_to_another_tenant(self) -> None:
        """A customer signed last week whose format we don't know yet must not
        silently inherit CEMEX's operating rules and instrument assumptions."""
        h = harness_for_tenant(tenant("newco"))
        assert h.slug == GENERIC.slug
        assert h is not CEMEX and h is not DEMO

    def test_missing_tenant_is_generic_not_a_crash(self) -> None:
        assert harness_for_tenant(None).slug == GENERIC.slug
        assert harness_for_slug(None).slug == GENERIC.slug


class TestEvidenceBoundary:
    def test_demo_harness_offers_no_vendor_only_columns(self) -> None:
        """Every synthetic row has NULL for these. Offering them would put
        'n/a' in front of the model at best, and invite invention at worst."""
        offered = {f.column for f in DEMO.evidence_fields}
        assert offered & VENDOR_ONLY_COLUMNS == set()

    def test_cemex_harness_does_offer_them(self) -> None:
        offered = {f.column for f in CEMEX.evidence_fields}
        assert VENDOR_ONLY_COLUMNS <= offered

    def test_generic_harness_is_conservative(self) -> None:
        offered = {f.column for f in GENERIC.evidence_fields}
        assert offered & VENDOR_ONLY_COLUMNS == set()

    def test_window_rendering_only_emits_that_tenants_fields(self) -> None:
        """A CEMEX row passed through the demo harness must not render its
        vendor columns — the harness, not the row, decides what is visible."""
        t = datetime(2026, 5, 1, tzinfo=timezone.utc)
        row = Measurement(
            channel_id="cv42", t=t, f80=1.06, topsize=2.3, psd={},
            color_hsl="", color_hue=24.0, color_sat=25.0, color_light=28.0,
            sd_ratio_10_5=1.258, video_r=149.0, video_g=166.0, video_b=101.0,
        )
        assert "1.258" in CEMEX.format_window([row], t)
        rendered = DEMO.format_window([row], t)
        assert "1.258" not in rendered
        assert "149" not in rendered
        assert "SDRatio" not in rendered


class TestPromptAndSchema:
    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_prompt_names_only_its_own_evidence_and_categories(self, harness) -> None:
        prompt = harness.system_prompt()
        for f in harness.evidence_fields:
            assert f.label in prompt
        for c in harness.failure_categories:
            assert c.id in prompt

    def test_demo_prompt_never_mentions_cemex_only_evidence(self) -> None:
        prompt = DEMO.system_prompt()
        # Named only in the negative — the rule telling the model these do
        # not exist here is allowed; an offer of them as evidence is not.
        assert "SDRatio10_5" not in DEMO.summary()["evidence_fields"]
        assert "does not report them" in prompt

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_failure_category_enum_is_the_tenants_own(self, harness) -> None:
        schema = harness.diagnosis_tool()["input_schema"]
        enum = schema["properties"]["hypotheses"]["items"]["properties"]["failure_category"]["enum"]
        assert enum == [c.id for c in harness.failure_categories]

    def test_cemex_has_a_category_demo_does_not(self) -> None:
        """Guards the test above against passing trivially if the two profiles
        ever converge — the point is that the action space genuinely differs."""
        cemex_ids = {c.id for c in CEMEX.failure_categories}
        demo_ids = {c.id for c in DEMO.failure_categories}
        assert cemex_ids - demo_ids

    def test_generic_harness_declares_it_is_unprofiled(self) -> None:
        """An unprofiled tenant's diagnosis must say so rather than sounding
        as authoritative as a configured site."""
        assert "No site profile has been configured" in GENERIC.system_prompt()


class TestContextPolicy:
    def test_window_sizes_are_per_tenant(self) -> None:
        """CEMEX samples sub-minute and demo once a minute, so the same sample
        count is a different amount of wall-clock evidence."""
        assert CEMEX.context.window_before != DEMO.context.window_before

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_windows_and_token_ceiling_are_bounded(self, harness) -> None:
        assert 0 < harness.context.window_before <= 200
        assert 0 <= harness.context.window_after <= 100
        assert 0 < harness.context.max_output_tokens <= 8192

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_ask_loop_budget_is_bounded(self, harness) -> None:
        """Unbounded is the failure mode that costs money silently. Every
        dimension the `ask` loop can grow along has a ceiling, per tenant."""
        assert 0 < harness.context.max_rounds <= 12
        assert 0 < harness.context.max_input_tokens <= 15_000
        assert 0 < harness.context.max_cost_usd <= 5.00
        # Sub-allocations must leave room for the system prompt, tool schemas
        # and the question, or the builder can satisfy both budgets and still
        # blow the ceiling.
        assert (harness.context.history_token_budget
                + harness.context.tool_result_token_budget
                < harness.context.max_input_tokens)


class TestAskActionSpace:
    """The `ask` path's tool schemas — what the model is permitted to express."""

    #: Anything that would let a tool call name a scope. The executor adds the
    #: tenant filter unconditionally, but a field the model can write into is
    #: a target for injection and an invitation for someone to later "use" it.
    SCOPE_WORDS = ("tenant", "site_id", "customer", "org", "account", "all_tenants")

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_no_tool_accepts_a_scope_parameter(self, harness) -> None:
        for tool in harness.ask_tools():
            props = tool["input_schema"].get("properties", {})
            for name in props:
                assert not any(w in name.lower() for w in self.SCOPE_WORDS), (
                    f"{tool['name']}.{name} lets the model express scope"
                )

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_action_space_is_exactly_the_five_reads_plus_submit(self, harness) -> None:
        names = [t["name"] for t in harness.ask_tools()]
        assert set(names) == READ_TOOLS | {TOOL_SUBMIT_ANSWER}
        assert len(names) == len(set(names))

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_no_write_tool_is_offered(self, harness) -> None:
        """The agent reads. Acknowledging, resolving and assigning stay human."""
        forbidden = ("update", "set_", "delete", "resolve", "acknowledge",
                     "assign", "dismiss", "create", "ingest", "sql", "query_raw")
        for name in (t["name"] for t in harness.ask_tools()):
            assert not any(w in name for w in forbidden), name

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_metric_enum_is_bound_to_this_tenants_columns(self, harness) -> None:
        stats = next(t for t in harness.ask_tools() if t["name"] == TOOL_CHANNEL_STATS)
        enum = stats["input_schema"]["properties"]["metric"]["enum"]
        assert enum == [f.label for f in harness.evidence_fields]

    def test_demo_cannot_even_ask_for_vendor_only_metrics(self) -> None:
        """Not 'is told not to' — cannot form the call. The value is absent
        from the enum, so the request is malformed before it is refused."""
        stats = next(t for t in DEMO.ask_tools() if t["name"] == TOOL_CHANNEL_STATS)
        enum = set(stats["input_schema"]["properties"]["metric"]["enum"])
        assert "SDRatio10_5" not in enum
        assert not any(e.startswith("Video") for e in enum)

        cemex_enum = set(next(
            t for t in CEMEX.ask_tools() if t["name"] == TOOL_CHANNEL_STATS
        )["input_schema"]["properties"]["metric"]["enum"])
        assert "SDRatio10_5" in cemex_enum  # guards against a trivial pass

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_row_caps_are_declared_in_the_schema(self, harness) -> None:
        """The executor clamps regardless, but declaring the cap means the
        model asks for a legal number instead of learning by rejection."""
        q = next(t for t in harness.ask_tools() if t["name"] == TOOL_QUERY_OUTLIERS)
        assert q["input_schema"]["properties"]["limit"]["maximum"] == MAX_OUTLIER_ROWS
        w = next(t for t in harness.ask_tools() if t["name"] == TOOL_MEASUREMENT_WINDOW)
        assert w["input_schema"]["properties"]["before"]["maximum"] == MAX_WINDOW_BEFORE
        assert w["input_schema"]["properties"]["after"]["maximum"] == MAX_WINDOW_AFTER

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_submit_answer_requires_citations(self, harness) -> None:
        submit = next(t for t in harness.ask_tools() if t["name"] == TOOL_SUBMIT_ANSWER)
        assert set(submit["input_schema"]["required"]) == {"answer", "citations"}


class TestAskPrompt:
    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_ask_prompt_never_names_a_tenant_identifier(self, harness) -> None:
        """Scope is bound below the model. Mentioning it in the prompt would
        give an injected instruction something to argue with, and gains
        nothing — the model cannot act on it either way."""
        prompt = harness.ask_prompt().lower()
        for other in (CEMEX, DEMO):
            if other.slug != harness.slug:
                assert other.slug not in prompt
        assert "tenant_id" not in prompt
        assert "tenant" not in prompt

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_ask_prompt_carries_this_tenants_own_context(self, harness) -> None:
        prompt = harness.ask_prompt()
        for f in harness.evidence_fields:
            assert f.label in prompt
        for c in harness.failure_categories:
            assert c.id in prompt
        assert harness.instrument in prompt

    @pytest.mark.parametrize("harness", [CEMEX, DEMO, GENERIC])
    def test_ask_prompt_forces_the_terminal_tool(self, harness) -> None:
        prompt = harness.ask_prompt()
        assert TOOL_SUBMIT_ANSWER in prompt
        assert str(harness.context.max_rounds) in prompt

    def test_demo_ask_prompt_offers_no_vendor_evidence(self) -> None:
        assert "SDRatio10_5" not in DEMO.ask_prompt()
        assert "SDRatio10_5" in CEMEX.ask_prompt()
