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
        for route in app.routes:
            if not isinstance(route, APIRoute):
                continue
            for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
                key = (method, route.path)
                if key in PUBLIC_ROUTES:
                    continue
                if not _requires_principal(route):
                    unguarded.append(f"{method} {route.path}")

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
        live = {
            (method, route.path)
            for route in app.routes
            if isinstance(route, APIRoute)
            for method in route.methods - {"HEAD", "OPTIONS"}
        }
        stale = sorted(f"{m} {p}" for (m, p) in PUBLIC_ROUTES if (m, p) not in live)
        self.assertEqual(stale, [], f"PUBLIC_ROUTES entries with no live route: {stale}")


if __name__ == "__main__":
    unittest.main()
