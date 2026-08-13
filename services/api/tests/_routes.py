"""Enumerate every live API route, whatever FastAPI does internally.

Two security tests — `test_route_isolation` and `test_cross_tenant_leak` —
work by walking the app's routes and asserting a property of each one. Their
entire value rests on that walk being complete: a route the walk misses is a
route nobody checks.

`app.routes` used to be a flat list of `APIRoute`. As of FastAPI 0.141 an
`include_router()` call leaves an opaque `_IncludedRouter` wrapper there
instead, and the real routes hang off `.original_router.routes`. A test that
filters `isinstance(route, APIRoute)` over `app.routes` therefore sees *every
router-mounted route disappear* — which is all of them — and passes while
checking nothing.

That is the worst possible failure mode for a security test, so this walk is
recursive and defensive rather than clever: unwrap anything that exposes a
`routes` list or an `original_router`, and let the callers' own "the
allowlist has no stale entries" assertion catch it if the shape changes
again.
"""
from __future__ import annotations

from typing import Iterator

from fastapi.routing import APIRoute

#: Methods every route answers for free; never interesting to these tests.
_UNINTERESTING = {"HEAD", "OPTIONS"}


def _walk(routes) -> Iterator[APIRoute]:
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
            continue
        # FastAPI >= 0.141: include_router() leaves a wrapper behind.
        inner = getattr(route, "original_router", None)
        if inner is not None:
            yield from _walk(inner.routes)
            continue
        # Mount / sub-application.
        nested = getattr(route, "routes", None)
        if nested:
            yield from _walk(nested)


def api_routes(app) -> list[APIRoute]:
    """Every `APIRoute` reachable from `app`, de-duplicated, path-sorted."""
    seen: dict[int, APIRoute] = {}
    for route in _walk(app.routes):
        seen.setdefault(id(route), route)
    return sorted(seen.values(), key=lambda r: r.path)


def method_routes(app) -> list[tuple[str, str, APIRoute]]:
    """`(method, path, route)` for every interesting method on every route."""
    out: list[tuple[str, str, APIRoute]] = []
    for route in api_routes(app):
        for method in sorted((route.methods or set()) - _UNINTERESTING):
            out.append((method, route.path, route))
    return out
