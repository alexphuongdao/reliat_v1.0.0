"""The tool executor must not be reachable outside one tenant's rows.

`test_cross_tenant_leak` covers the HTTP surface. This covers the layer under
it, which is a different threat: there, a human calls a route with someone
else's id and the route says no. Here, a *model* proposes tool arguments, and
those arguments can be anything a prompt injection can talk it into. The route
tests do not exercise that at all.

The seeded world is two tenants — ALPHA, whose principal we act as, and BRAVO,
whose every row carries a marker string. The core assertion is blunt: run the
whole action space with hostile arguments and assert no BRAVO marker appears in
any returned payload, ever.

Every tool is also asked for BRAVO's ids directly, because "the model cannot
express scope" is only half the guarantee. The other half is that naming a
resource it does not own gets the same answer as naming one that does not
exist — a different answer would make the executor an enumeration oracle for
another customer's channel and event ids.
"""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agent_tools import (
    KIND_CHANNEL,
    KIND_DIAGNOSIS,
    KIND_OUTLIER,
    run_tool,
    validate_citations,
)
from app.harness import (
    CEMEX,
    DEMO,
    MAX_OUTLIER_ROWS,
    READ_TOOLS,
    TOOL_CHANNEL_STATS,
    TOOL_GET_DIAGNOSIS,
    TOOL_LIST_CHANNELS,
    TOOL_MEASUREMENT_WINDOW,
    TOOL_QUERY_OUTLIERS,
)
from app.models import (
    Base,
    Channel,
    Measurement,
    Outlier,
    OutlierDiagnosis,
    Tenant,
)

ALPHA = "tenant-alpha"
BRAVO = "tenant-bravo"

#: Present only in BRAVO's rows. One of these in an ALPHA payload is a leak.
BRAVO_MARKERS = (
    "chan-bravo",
    "BRAVO SECRET CHANNEL",
    "OUT-BRAVO-SECRET",
    "DIAG-BRAVO-SECRET",
    "bravo-confidential-summary",
    "bravo-confidential-root-cause",
    "bravo-confidential-evidence",
)

#: Arguments a compromised model might produce. None of them may work.
HOSTILE_ARGS: tuple[dict, ...] = (
    {},
    {"channel_id": "chan-bravo"},
    {"channel_id": "chan-bravo", "around_t": "2026-01-01T12:00:00"},
    {"channel_id": "chan-bravo", "metric": "F80", "window": "24h"},
    {"outlier_id": "OUT-BRAVO-SECRET"},
    # Fields the schema does not define. Extra keys must be inert, not
    # forwarded into a query.
    {"tenant_id": BRAVO},
    {"tenant_id": BRAVO, "channel_id": "chan-bravo"},
    {"tenant": BRAVO, "all_tenants": True, "channel_id": "chan-alpha"},
    # Injection-flavoured values in fields that do exist.
    {"channel_id": "chan-alpha' OR '1'='1"},
    {"channel_id": "chan-alpha", "severity": "critical' OR 1=1--"},
    {"outlier_id": "OUT-ALPHA-0001 UNION SELECT * FROM outliers"},
    {"limit": 100000, "channel_id": None},
)


def _psd() -> dict:
    return {"F10": 1.0, "F20": 1.2, "F30": 1.4, "F50": 1.8, "F80": 2.4, "F90": 2.8}


class AgentToolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(cls.engine)
        cls.Factory = sessionmaker(bind=cls.engine, autoflush=False, future=True)
        cls.now = datetime(2026, 1, 1, 12, 0, 0)

        s = cls.Factory()
        for tid, slug, name in ((ALPHA, "alpha", "Alpha"), (BRAVO, "bravo", "Bravo")):
            s.add(Tenant(id=tid, slug=slug, name=name, active=True, created_at=cls.now))

        s.add_all([
            Channel(id="chan-alpha", tenant_id=ALPHA, name="Alpha Channel",
                    belt="Primary", color="#0af", base_f80=2.0, base_topsize=4.0,
                    online=True, shift="A"),
            Channel(id="chan-alpha-2", tenant_id=ALPHA, name="Alpha Secondary",
                    belt="Secondary", color="#0fa", base_f80=3.0, base_topsize=5.0,
                    online=True, shift="B"),
            Channel(id="chan-bravo", tenant_id=BRAVO, name="BRAVO SECRET CHANNEL",
                    belt="Primary", color="#fa0", base_f80=2.0, base_topsize=4.0,
                    online=True, shift="A"),
        ])

        for i in range(40):
            for chan in ("chan-alpha", "chan-alpha-2", "chan-bravo"):
                s.add(Measurement(
                    channel_id=chan, t=cls.now + timedelta(minutes=i),
                    f80=2.0 + i * 0.01, topsize=4.0 + i * 0.02, psd=_psd(),
                    color_hsl="hsl(30, 20%, 40%)", color_hue=30.0,
                    color_sat=0.2, color_light=0.4,
                    sd_ratio_10_5=1.25 + i * 0.001,
                    video_r=140.0, video_g=150.0, video_b=100.0,
                ))

        # Enough ALPHA events that a clamped limit is observably clamped.
        for i in range(60):
            s.add(Outlier(
                id=f"OUT-ALPHA-{i:04d}", channel_id="chan-alpha",
                t=cls.now + timedelta(minutes=i), metric="F80", unit="mm",
                value=9.0, baseline=2.0, deviation=4.0, sev="critical",
                type="Particle-size spike", confidence=0.9, status="open",
                summary=f"alpha summary {i}", action="",
            ))
        s.add(Outlier(
            id="OUT-BRAVO-SECRET", channel_id="chan-bravo", t=cls.now,
            metric="F80", unit="mm", value=9.0, baseline=2.0, deviation=4.0,
            sev="critical", type="Particle-size spike", confidence=0.9,
            status="open", summary="bravo-confidential-summary", action="",
        ))

        s.add_all([
            OutlierDiagnosis(
                id="DIAG-ALPHA-0001", outlier_id="OUT-ALPHA-0000",
                created_at=cls.now, status="complete", model="claude-haiku-4-5",
                root_cause="alpha root cause",
                hypotheses=[{"cause": "alpha cause", "failure_category": "equipment",
                             "confidence": 0.6, "supporting_evidence": "alpha ev"}],
                confidence=0.7, recommended_action="alpha action",
                evidence_summary="alpha evidence", input_tokens=10, output_tokens=10,
            ),
            OutlierDiagnosis(
                id="DIAG-BRAVO-SECRET", outlier_id="OUT-BRAVO-SECRET",
                created_at=cls.now, status="complete", model="claude-haiku-4-5",
                root_cause="bravo-confidential-root-cause", hypotheses=[],
                confidence=0.8, recommended_action="bravo action",
                evidence_summary="bravo-confidential-evidence",
                input_tokens=10, output_tokens=10,
            ),
        ])
        s.commit()
        s.close()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.engine.dispose()

    def setUp(self) -> None:
        self.session = self.Factory()

    def tearDown(self) -> None:
        self.session.close()

    def call(self, name: str, args: dict | None = None, *, tenant: str = ALPHA,
             harness=CEMEX):
        return run_tool(name, args, tenant_id=tenant, session=self.session,
                        harness=harness)

    @staticmethod
    def _markers_not_supplied(args: dict, markers: tuple[str, ...]) -> list[str]:
        """Markers the caller did not put into the request itself.

        Error messages echo the id that was asked for — "no channel
        'chan-bravo' is available to you" — and an echo of the caller's own
        input reveals nothing it did not already have. Every *other* marker
        still has to be absent, and the identical-error test below is what
        proves the echo is not itself an existence signal.
        """
        supplied = repr(args)
        return [m for m in markers if m not in supplied]

    # ── the blunt instrument ───────────────────────────────────────────

    def test_no_hostile_argument_reaches_another_tenants_data(self) -> None:
        """The whole action space, every hostile argument, one assertion.

        This is the test that fails if anyone deletes a tenant predicate. It
        does not care *how* the boundary is enforced — only that nothing
        belonging to BRAVO ever comes back.
        """
        for name in sorted(READ_TOOLS):
            for args in HOSTILE_ARGS:
                result = self.call(name, dict(args))
                blob = repr(result.payload) + repr(result.ids)
                for marker in self._markers_not_supplied(args, BRAVO_MARKERS):
                    self.assertNotIn(
                        marker, blob,
                        f"{name}({args}) leaked {marker!r}",
                    )

    def test_no_hostile_argument_reaches_alpha_from_bravos_seat(self) -> None:
        """The mirror. Guards against a filter that happens to be hardcoded to
        ALPHA rather than actually derived from the caller."""
        for name in sorted(READ_TOOLS):
            for args in HOSTILE_ARGS:
                result = self.call(name, dict(args), tenant=BRAVO)
                blob = repr(result.payload)
                for marker in self._markers_not_supplied(
                    args, ("OUT-ALPHA-", "chan-alpha", "alpha summary",
                           "alpha root cause", "DIAG-ALPHA-0001")
                ):
                    self.assertNotIn(marker, blob, f"{name}({args}) leaked {marker!r}")

    # ── the tenant argument itself ─────────────────────────────────────

    def test_run_tool_refuses_a_missing_tenant(self) -> None:
        """A superadmin principal has `tenant_id is None`. That must be a loud
        failure, never an unscoped query."""
        for bad in (None, "", 0):
            with self.assertRaises(ValueError):
                run_tool(TOOL_LIST_CHANNELS, {}, tenant_id=bad,  # type: ignore[arg-type]
                         session=self.session, harness=CEMEX)

    def test_unknown_tool_is_an_error_not_a_dispatch(self) -> None:
        for name in ("update_outlier", "run_sql", "list_tenants", ""):
            result = self.call(name, {})
            self.assertTrue(result.is_error)
            self.assertIn("unknown tool", result.payload["error"])

    # ── per-tool scoping ───────────────────────────────────────────────

    def test_list_channels_returns_only_this_tenants_channels(self) -> None:
        result = self.call(TOOL_LIST_CHANNELS)
        ids = {r["channel_id"] for r in result.payload["rows"]}
        self.assertEqual(ids, {"chan-alpha", "chan-alpha-2"})
        self.assertEqual(result.ids[KIND_CHANNEL], ids)

    def test_query_outliers_never_returns_another_tenants_events(self) -> None:
        result = self.call(TOOL_QUERY_OUTLIERS, {"limit": MAX_OUTLIER_ROWS})
        for row in result.payload["rows"]:
            self.assertTrue(row["outlier_id"].startswith("OUT-ALPHA-"))

    def test_naming_another_tenants_channel_is_indistinguishable_from_a_typo(self) -> None:
        """Not an enumeration oracle. `chan-bravo` exists; `chan-nope` does not;
        the caller must not be able to tell which is which."""
        for tool, extra in (
            (TOOL_QUERY_OUTLIERS, {}),
            (TOOL_MEASUREMENT_WINDOW, {"around_t": "2026-01-01T12:00:00"}),
            (TOOL_CHANNEL_STATS, {"metric": "F80", "window": "24h"}),
        ):
            real = self.call(tool, {"channel_id": "chan-bravo", **extra})
            fake = self.call(tool, {"channel_id": "chan-nope", **extra})
            self.assertTrue(real.is_error and fake.is_error, tool)
            self.assertEqual(
                real.payload["error"].replace("chan-bravo", "X"),
                fake.payload["error"].replace("chan-nope", "X"),
                f"{tool} answers differently for a real foreign id",
            )

    def test_get_diagnosis_on_another_tenants_event_reveals_nothing(self) -> None:
        real = self.call(TOOL_GET_DIAGNOSIS, {"outlier_id": "OUT-BRAVO-SECRET"})
        fake = self.call(TOOL_GET_DIAGNOSIS, {"outlier_id": "OUT-NOPE"})
        self.assertTrue(real.is_error and fake.is_error)
        self.assertEqual(
            real.payload["error"].replace("OUT-BRAVO-SECRET", "X"),
            fake.payload["error"].replace("OUT-NOPE", "X"),
        )

    def test_get_diagnosis_returns_the_tenants_own_artifact(self) -> None:
        result = self.call(TOOL_GET_DIAGNOSIS, {"outlier_id": "OUT-ALPHA-0000"})
        self.assertFalse(result.is_error)
        self.assertEqual(result.payload["diagnosis_id"], "DIAG-ALPHA-0001")
        self.assertIn("DIAG-ALPHA-0001", result.ids[KIND_DIAGNOSIS])
        # The self-report is labelled at the source, so an answer built on it
        # cannot quote it as a calibrated probability by accident.
        self.assertIn("confidence_model_stated", result.payload)

    def test_get_diagnosis_says_so_when_none_has_run(self) -> None:
        result = self.call(TOOL_GET_DIAGNOSIS, {"outlier_id": "OUT-ALPHA-0005"})
        self.assertFalse(result.is_error)
        self.assertIsNone(result.payload["diagnosis"])

    # ── argument handling ──────────────────────────────────────────────

    def test_limit_is_clamped_not_honoured(self) -> None:
        result = self.call(TOOL_QUERY_OUTLIERS, {"limit": 100_000})
        self.assertLessEqual(len(result.payload["rows"]), MAX_OUTLIER_ROWS)
        self.assertTrue(result.payload["truncated"])

    def test_window_sizes_are_clamped(self) -> None:
        result = self.call(TOOL_MEASUREMENT_WINDOW, {
            "channel_id": "chan-alpha",
            "around_t": (self.now + timedelta(minutes=39)).isoformat(),
            "before": 9999, "after": 9999,
        })
        self.assertFalse(result.is_error)
        self.assertLessEqual(result.payload["row_count"], 40 + 20)

    def test_bad_enum_values_are_errors_the_model_can_fix(self) -> None:
        for args, word in (
            ({"severity": "catastrophic"}, "severity"),
            ({"status": "on fire"}, "status"),
            ({"since": "yesterday"}, "since"),
        ):
            result = self.call(TOOL_QUERY_OUTLIERS, args)
            self.assertTrue(result.is_error, args)
            self.assertIn(word, result.payload["error"])

    def test_metric_must_come_from_this_tenants_harness(self) -> None:
        """The demo harness has no SDRatio10_5, so asking for it fails even
        though the column exists on the row and holds a value."""
        ok = self.call(TOOL_CHANNEL_STATS, {
            "channel_id": "chan-alpha", "metric": "SDRatio10_5", "window": "24h",
        }, harness=CEMEX)
        self.assertFalse(ok.is_error)
        self.assertGreater(ok.payload["n"], 0)

        blocked = self.call(TOOL_CHANNEL_STATS, {
            "channel_id": "chan-alpha", "metric": "SDRatio10_5", "window": "24h",
        }, harness=DEMO)
        self.assertTrue(blocked.is_error)
        self.assertIn("metric must be one of", blocked.payload["error"])

    def test_metric_cannot_reach_an_arbitrary_attribute(self) -> None:
        for probe in ("id", "channel_id", "psd", "__class__", "sieve_passing_raw"):
            result = self.call(TOOL_CHANNEL_STATS, {
                "channel_id": "chan-alpha", "metric": probe, "window": "24h",
            })
            self.assertTrue(result.is_error, probe)

    def test_measurement_window_renders_through_the_harness(self) -> None:
        """A CEMEX row read with the demo harness must not show vendor columns,
        even though the row has them populated."""
        args = {
            "channel_id": "chan-alpha",
            "around_t": (self.now + timedelta(minutes=20)).isoformat(),
        }
        cemex = self.call(TOOL_MEASUREMENT_WINDOW, dict(args), harness=CEMEX)
        demo = self.call(TOOL_MEASUREMENT_WINDOW, dict(args), harness=DEMO)
        self.assertIn("SDRatio10_5", cemex.payload["table"])
        self.assertNotIn("SDRatio10_5", demo.payload["table"])
        self.assertNotIn("VideoR", demo.payload["table"])

    def test_stats_anchor_on_the_channels_latest_sample_not_wall_clock(self) -> None:
        """The data is historical. Anchoring on `now` would make every window
        empty and the model would report the channel as silent."""
        result = self.call(TOOL_CHANNEL_STATS, {
            "channel_id": "chan-alpha", "metric": "F80", "window": "1h",
        })
        self.assertFalse(result.is_error)
        self.assertGreater(result.payload["n"], 0)
        self.assertEqual(
            result.payload["window_end"],
            (self.now + timedelta(minutes=39)).isoformat(),
        )

    # ── citations ──────────────────────────────────────────────────────

    def test_citations_are_checked_against_what_was_actually_returned(self) -> None:
        result = self.call(TOOL_QUERY_OUTLIERS, {"limit": 3})
        returned = result.ids
        real_id = sorted(returned[KIND_OUTLIER])[0]

        accepted, rejected = validate_citations([
            {"kind": KIND_OUTLIER, "id": real_id},
            {"kind": KIND_OUTLIER, "id": "OUT-BRAVO-SECRET"},
            # Real, ALPHA's own, and simply not among the three rows returned.
            {"kind": KIND_OUTLIER, "id": "OUT-ALPHA-0000"},
            {"kind": KIND_DIAGNOSIS, "id": real_id},
            "not-a-dict",
            {"kind": KIND_OUTLIER},
        ], returned)

        self.assertEqual([c["id"] for c in accepted], [real_id])
        self.assertEqual(len(rejected), 5)
        # Citing a real outlier id under the wrong kind is rejected too — a
        # plausible-looking cross-reference reads as authoritative.
        self.assertIn(
            (KIND_DIAGNOSIS, real_id),
            {(r["kind"], r["id"]) for r in rejected},
        )

    def test_an_id_never_returned_cannot_be_cited_even_if_it_exists(self) -> None:
        empty: dict[str, set[str]] = {}
        accepted, rejected = validate_citations(
            [{"kind": KIND_CHANNEL, "id": "chan-alpha"}], empty
        )
        self.assertEqual(accepted, [])
        self.assertEqual(len(rejected), 1)


if __name__ == "__main__":
    unittest.main()
