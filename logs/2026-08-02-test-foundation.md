# 2026-08-02 — Deterministic test foundation

The API had no test files even though it already ingests measurements, detects
outliers, and enforces tenant-scoped routes. This first slice establishes an
executable contract before building the retrieval agent.

## What changed

| File | Change |
|---|---|
| `services/api/tests/test_detector.py` | Tests stable data and a large F80 excursion, including event classification and measurement linkage. |
| `services/api/tests/test_etl_contract.py` | Tests CSV timestamp parsing and canonical PSD output shape. |
| `services/api/tests/test_tenant_boundary.py` | Proves a tenant cannot resolve another tenant's channel; the result is 404. |
| `services/api/pyproject.toml` | Configures pytest discovery and the API package import path. |
| `docs/TestingStrategy.md` | Defines unit, golden-data, integration/security, and agent-evaluation layers plus release gates. |

## Verified

```text
./.venv/bin/python -m pytest -q
4 passed in 0.52s
```

The API virtualenv was missing declared dependencies, so the project was
installed into its existing local `.venv` before running the full suite.

## Still open

These are intentionally only the first tests. The next required slice is a
canonical source-asset/provenance model and typed retrieval tools, followed by
Postgres integration tests and the first agent benchmark cases. No agent eval
has been added yet because the query-agent harness does not exist and there is
not yet a stable tool contract to evaluate.
