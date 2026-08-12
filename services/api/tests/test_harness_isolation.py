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

from app.harness import CEMEX, DEMO, GENERIC, harness_for_slug, harness_for_tenant
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
