"""Every data route must require an authenticated principal.

This test enumerates the routes registered on the app rather than listing them,
because the failure it exists to catch is *a route someone added later*. A
hand-maintained list is guaranteed to be missing exactly the route that matters.

See docs/DataArchitecture.md §6.2 (layer 3) and docs/TestingStrategy.md.
"""
from __future__ import annotations

import unittest

from fastapi.routing import APIRoute

from app.auth import get_principal
from app.main import app

from ._routes import method_routes

#: Routes that are legitimately reachable without a session, each with the
#: reason. Anything not listed here must depend on `get_principal`.
#:
#: `get_principal_optional` deliberately does NOT satisfy the requirement — a
#: route that merely *may* have a principal has to justify itself here.
PUBLIC_ROUTES: dict[tuple[str, str], str] = {
    ("GET", "/api/health"): "liveness probe, no data",
    ("POST", "/api/auth/login"): "establishes the session",
    ("POST", "/api/auth/logout"): "must work with an already-invalid session",
    ("GET", "/api/auth/providers"): "which OAuth buttons to render, no tenant data",
    ("GET", "/api/auth/oauth/{provider}/authorize"): "pre-login redirect",
    ("GET", "/api/auth/oauth/{provider}/callback"): "pre-login redirect",
    ("GET", "/api/auth/session-status"): "optional principal by design; returns no tenant data",
}

# NOTE: FastAPI's own `/docs`, `/redoc` and `/openapi.json` are Starlette routes,
# not APIRoute, so they fall outside this test. They are currently unauthenticated
# and publish the full API surface — fine locally, worth disabling (or gating) in
# production via `FastAPI(docs_url=None, openapi_url=None)`.


def _requires_principal(route: APIRoute) -> bool:
    """True if `get_principal` appears anywhere in the route's dependency tree."""
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is get_principal:
            return True
        stack.extend(dep.dependencies)
    return False


class RouteIsolationTests(unittest.TestCase):
    def test_every_route_requires_a_principal_or_is_explicitly_public(self) -> None:
        unguarded: list[str] = []
        for method, path, route in method_routes(app):
            if (method, path) in PUBLIC_ROUTES:
                continue
            if not _requires_principal(route):
                unguarded.append(f"{method} {path}")

        self.assertEqual(
            unguarded,
            [],
            "These routes neither require a principal nor are listed in "
            "PUBLIC_ROUTES. Add the dependency, or add an entry with a reason:\n  "
            + "\n  ".join(unguarded),
        )

    def test_public_allowlist_has_no_stale_entries(self) -> None:
        """A route removed from the app must not linger in the allowlist.

        Otherwise the allowlist slowly becomes a place where a path can be
        pre-approved before it exists.
        """
        live = {(method, path) for method, path, _ in method_routes(app)}
        stale = sorted(f"{m} {p}" for (m, p) in PUBLIC_ROUTES if (m, p) not in live)
        self.assertEqual(stale, [], f"PUBLIC_ROUTES entries with no live route: {stale}")

    def test_the_route_walk_actually_finds_routes(self) -> None:
        """A tripwire on the enumeration itself.

        FastAPI 0.141 changed `include_router` to leave an opaque wrapper in
        `app.routes`, and the old `isinstance(route, APIRoute)` filter then
        matched *nothing*. Both this file and `test_cross_tenant_leak` iterate
        that list, so the entire isolation suite passed while asserting on an
        empty set. Caught here only because the stale-allowlist check above
        happens to fail loudly in that state.

        This makes it explicit instead of incidental: if the walk ever goes
        quiet again, this fails first and says why.
        """
        found = method_routes(app)
        self.assertGreater(len(found), 20, "route walk returned almost nothing")
        paths = {p for _, p, _ in found}
        for expected in ("/api/channels", "/api/outliers", "/api/agent/threads",
                         "/api/harness", "/api/auth/login"):
            self.assertIn(expected, paths, f"{expected} missing from the route walk")


if __name__ == "__main__":
    unittest.main()
