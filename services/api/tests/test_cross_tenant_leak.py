"""No route may return another tenant's data.

`test_route_isolation.py` proves every route *requires a principal*. That is a
weaker property than it sounds: a route can authenticate perfectly and then run
an unscoped query. It would pass that test and leak every customer's data.

This test closes that gap. It seeds two tenants with deliberately unmistakable
markers, signs in as ALPHA through the real session machinery, and then:

  * calls every parameterless data route and asserts no BRAVO marker appears
    anywhere in the response body, and
  * calls every parameterised route with BRAVO's ids and asserts 404.

Routes are enumerated from the app rather than listed, because the failure this
exists to catch is *a route someone adds later* — a hand-written list is
guaranteed to omit exactly the one that matters.

404 rather than 403 is the contract: 403 confirms the id exists and turns the
endpoint into an enumeration oracle. See `docs/PlatformArchitecture.md` §2.2.
"""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import ROLE_OWNER, SESSION_COOKIE, create_session
from app.db import get_session
from app.main import app
from app.models import (
    AgentMessage,
    AgentThread,
    Base,
    Channel,
    Measurement,
    Outlier,
    OutlierDiagnosis,
    Tenant,
    User,
)

from ._routes import method_routes

# Routes that legitimately return no tenant-scoped data. Anything else on the
# app is subject to both checks below.
NOT_TENANT_SCOPED: set[tuple[str, str]] = {
    ("GET", "/api/health"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/auth/providers"),
    ("GET", "/api/auth/oauth/{provider}/authorize"),
    ("GET", "/api/auth/oauth/{provider}/callback"),
    ("GET", "/api/auth/session-status"),
    ("GET", "/api/auth/me"),
}

# Calling this for real would hit the Anthropic API: billable, non-deterministic,
# and offline in CI. The cross-tenant half is still exercised — `_owned_outlier`
# raises 404 long before any model call — so only the same-tenant call is skipped.
NO_SAME_TENANT_CALL: set[tuple[str, str]] = {
    ("POST", "/api/outliers/{outlier_id}/diagnose"),
}

#: Admin-management routes that answer 403 *before* looking anything up.
#: 403 is safe here precisely because it is returned whether or not the target
#: exists — the test below proves that, rather than taking it on faith. Data
#: routes must still 404, because there the existence check runs first and a
#: 403 would confirm the id is real.
AUTHZ_BEFORE_EXISTENCE: set[tuple[str, str]] = {
    ("POST", "/api/auth/tenants/{tenant_id}/users"),
}

#: Substituted into `{...}` path segments. Every parameterised route must have
#: an entry here or the test fails loudly rather than silently skipping.
PARAM_VALUES: dict[str, tuple[str, str]] = {
    # name:            (alpha value,      bravo value)
    "channel_id": ("chan-alpha", "chan-bravo"),
    "outlier_id": ("OUT-ALPHA-0001", "OUT-BRAVO-SECRET"),
    "tenant_id": ("tenant-alpha", "tenant-bravo"),
    "thread_id": ("TH-ALPHA-0001", "TH-BRAVO-SECRET"),
}

#: A tenant id that certainly does not exist, for the oracle check.
GHOST_TENANT = "tenant-does-not-exist"

#: Bodies valid enough to get past request validation, so the call actually
#: reaches the authorization check rather than bouncing off a 422.
VALID_BODIES: dict[tuple[str, str], dict] = {
    ("POST", "/api/auth/tenants/{tenant_id}/users"): {
        "username": "leaktest",
        "email": "leaktest@example.com",
        "password": "not-a-real-password",
        "name": "Leak Test",
        "role": "member",
    },
}

#: Strings that exist only in BRAVO's rows. If any of these reaches an ALPHA
#: response, the boundary has failed.
BRAVO_MARKERS: tuple[str, ...] = (
    "chan-bravo",
    "BRAVO SECRET CHANNEL",
    "OUT-BRAVO-SECRET",
    "bravo-confidential-summary",
    "bravo-confidential-root-cause",
    "tenant-bravo",
    "TH-BRAVO-SECRET",
    "bravo-confidential-thread",
    "bravo-confidential-message",
)


def _psd() -> dict:
    return {"F10": 1.0, "F20": 1.2, "F30": 1.4, "F50": 1.8, "F80": 2.4, "F90": 2.8}


class CrossTenantLeakTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # StaticPool: every session must reuse the *same* connection, or each
        # one gets its own empty `:memory:` database and nothing seeded here is
        # visible to the request handlers.
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(cls.engine)
        cls.Factory = sessionmaker(bind=cls.engine, autoflush=False, future=True)

        now = datetime(2026, 1, 1, 12, 0, 0)
        s = cls.Factory()

        for slug, tid, name in (("alpha", "tenant-alpha", "Alpha"),
                                ("bravo", "tenant-bravo", "Bravo")):
            s.add(Tenant(id=tid, slug=slug, name=name, active=True, created_at=now))

        alpha_user = User(
            id="user-alpha", tenant_id="tenant-alpha", username="alpha",
            email="alpha@example.com", name="Alpha Op", role=ROLE_OWNER,
            active=True, created_at=now,
        )
        s.add(alpha_user)

        s.add_all([
            Channel(
                id="chan-alpha", tenant_id="tenant-alpha", name="Alpha Channel",
                belt="Primary", color="#0af", base_f80=2.0, base_topsize=4.0,
                online=True, shift="A",
            ),
            Channel(
                id="chan-bravo", tenant_id="tenant-bravo", name="BRAVO SECRET CHANNEL",
                belt="Primary", color="#fa0", base_f80=2.0, base_topsize=4.0,
                online=True, shift="A",
            ),
        ])

        for i in range(30):
            for chan in ("chan-alpha", "chan-bravo"):
                s.add(Measurement(
                    channel_id=chan, t=now + timedelta(minutes=i),
                    f80=2.0 + i * 0.01, topsize=4.0 + i * 0.02, psd=_psd(),
                    color_hsl="hsl(30, 20%, 40%)", color_hue=30.0,
                    color_sat=0.2, color_light=0.4,
                ))

        s.add_all([
            Outlier(
                id="OUT-ALPHA-0001", channel_id="chan-alpha", t=now, metric="F80",
                unit="mm", value=9.0, baseline=2.0, deviation=4.0, sev="critical",
                type="Particle-size spike", confidence=0.9, status="open",
                summary="alpha summary", action="alpha action",
            ),
            Outlier(
                id="OUT-BRAVO-SECRET", channel_id="chan-bravo", t=now, metric="F80",
                unit="mm", value=9.0, baseline=2.0, deviation=4.0, sev="critical",
                type="Particle-size spike", confidence=0.9, status="open",
                summary="bravo-confidential-summary", action="bravo action",
            ),
        ])

        s.add(OutlierDiagnosis(
            id="DIAG-BRAVO-0001", outlier_id="OUT-BRAVO-SECRET", created_at=now,
            status="complete", model="claude-haiku-4-5",
            root_cause="bravo-confidential-root-cause", hypotheses=[],
            confidence=0.8, recommended_action="bravo action",
            evidence_summary="bravo evidence", input_tokens=10, output_tokens=10,
        ))

        # Agent threads carry `tenant_id` as their own column rather than
        # reaching it through a channel, so there is no join to lean on here —
        # a forgotten filter returns every customer's transcripts.
        for tid, tenant, chan, outlier, marker in (
            ("TH-ALPHA-0001", "tenant-alpha", "chan-alpha", "OUT-ALPHA-0001", "alpha thread"),
            ("TH-BRAVO-SECRET", "tenant-bravo", "chan-bravo", "OUT-BRAVO-SECRET",
             "bravo-confidential-thread"),
        ):
            s.add(AgentThread(
                id=tid, tenant_id=tenant, kind="diagnosis", title=marker,
                channel_id=chan, outlier_id=outlier, created_by=None,
                created_at=now, updated_at=now,
            ))
            s.add(AgentMessage(
                id=f"MSG-{tid}", thread_id=tid, role="assistant",
                content=marker.replace("thread", "message"), created_at=now,
                diagnosis_id="DIAG-BRAVO-0001" if tenant == "tenant-bravo" else None,
            ))

        cls.token = create_session(s, alpha_user)
        s.commit()
        s.close()

        def _override() -> Session:
            db = cls.Factory()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_session] = _override
        cls.client = TestClient(app)
        cls.client.cookies.set(SESSION_COOKIE, cls.token)

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.pop(get_session, None)
        cls.engine.dispose()

    # ── helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _routes() -> list[tuple[str, str, APIRoute]]:
        """Every route on the app. See `tests/_routes.py` for why this is not
        a one-line comprehension over `app.routes` any more."""
        found = method_routes(app)
        # The walk going quiet would make every assertion below vacuous, so
        # refuse to run rather than pass on an empty set.
        assert len(found) > 20, f"route walk returned only {len(found)} routes"
        return found

    @staticmethod
    def _fill(path: str, which: int) -> str:
        for name, values in PARAM_VALUES.items():
            path = path.replace("{" + name + "}", values[which])
        return path

    def _call(self, method: str, url: str, path: str | None = None):
        body = VALID_BODIES.get((method, path or url), {})
        return self.client.request(method, url, json=body)

    # ── the two checks ─────────────────────────────────────────────────

    def test_every_parameterised_route_404s_on_another_tenants_id(self) -> None:
        """BRAVO's ids must be indistinguishable from ids that do not exist."""
        checked = 0
        for method, path, _ in self._routes():
            if (method, path) in NOT_TENANT_SCOPED or "{" not in path:
                continue
            if (method, path) in AUTHZ_BEFORE_EXISTENCE:
                continue  # covered by the oracle test below
            url = self._fill(path, 1)
            self.assertNotIn(
                "{", url,
                f"{method} {path} has a path param with no PARAM_VALUES entry — "
                "add one so this route is actually covered.",
            )
            res = self._call(method, url, path)
            self.assertEqual(
                res.status_code, 404,
                f"{method} {url} returned {res.status_code}, expected 404. "
                f"Body: {res.text[:400]}",
            )
            checked += 1
        self.assertGreater(checked, 0, "no parameterised routes were exercised")

    def test_admin_routes_do_not_confirm_whether_a_tenant_exists(self) -> None:
        """403 is only acceptable if it is returned for real and fake ids alike.

        If a real tenant id produced 403 and a fake one produced 404, the
        endpoint would tell an attacker which tenant ids exist.
        """
        for method, path in AUTHZ_BEFORE_EXISTENCE:
            real = self._call(method, self._fill(path, 1), path)
            ghost = self._call(
                method, path.replace("{tenant_id}", GHOST_TENANT), path
            )
            self.assertEqual(
                real.status_code, 403,
                f"{method} {path} with another tenant's id should be 403, "
                f"got {real.status_code}",
            )
            self.assertEqual(
                real.status_code, ghost.status_code,
                f"{method} {path} distinguishes a real tenant ({real.status_code}) "
                f"from a nonexistent one ({ghost.status_code}) — enumeration oracle",
            )

    def test_no_response_ever_contains_another_tenants_data(self) -> None:
        """Scan whole response bodies, not parsed fields.

        Checking specific keys would miss a leak in a field added later. The
        marker strings are unique enough that a substring scan is the stronger
        assertion here.
        """
        checked = 0
        for method, path, _ in self._routes():
            if (method, path) in NOT_TENANT_SCOPED:
                continue
            if (method, path) in NO_SAME_TENANT_CALL:
                continue
            url = self._fill(path, 0)
            self.assertNotIn("{", url, f"{method} {path} missing PARAM_VALUES entry")
            res = self._call(method, url, path)
            # 4xx is fine — an empty or rejected response cannot leak. What
            # matters is that whatever *did* come back holds no BRAVO data.
            for marker in BRAVO_MARKERS:
                self.assertNotIn(
                    marker, res.text,
                    f"{method} {url} leaked {marker!r} from tenant BRAVO "
                    f"(status {res.status_code})",
                )
            checked += 1
        self.assertGreater(checked, 0, "no routes were exercised")

    def test_alpha_can_still_see_its_own_data(self) -> None:
        """A boundary that returns nothing to anyone would pass the tests above."""
        res = self.client.get("/api/channels")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([c["id"] for c in res.json()], ["chan-alpha"])

        res = self.client.get("/api/outliers?limit=100")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([o["id"] for o in res.json()], ["OUT-ALPHA-0001"])

        self.assertEqual(self.client.get("/api/channels/chan-alpha/series").status_code, 200)


if __name__ == "__main__":
    unittest.main()
