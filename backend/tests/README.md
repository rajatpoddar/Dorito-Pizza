# Backend test suite

Three-tier layout that matches the testing pyramid in `RULES.md` §7:

```
tests/
├── conftest.py                    # shared fixtures (app, client, _clean_db)
├── unit/                          # pure functions, no Flask, no DB  (fast)
│   ├── test_phone_normalise.py
│   └── test_offer_discount_for.py
├── integration/                   # Flask test_client + in-memory SQLite
│   ├── test_phase2_workflows.py
│   ├── test_otp_flow.py
│   ├── test_menu_endpoints.py
│   ├── test_shop_settings.py
│   ├── test_notifications.py
│   └── test_rate_limiter.py
├── e2e/                           # full lifecycle, runs the worker too
│   └── test_full_lifecycle.py
├── lifecycle_test.py              # legacy script, kept runnable
├── phase2_test.py                 # legacy script, kept runnable
└── live_smoke_test.sh             # black-box curl smoke against a real stack
```

## How to run

From the repo root (the CI default):

```bash
# Just the fast unit tier (default in pyproject.toml)
pytest backend/tests

# Everything except the slow e2e tier (PR check)
pytest backend/tests -m "not e2e"

# The full suite (post-merge on main)
pytest backend/tests
```

From `backend/` (dev):

```bash
cd backend
FLASK_CONFIG=test .venv/bin/python -m pytest tests

# One tier only
.venv/bin/python -m pytest tests -m unit
.venv/bin/python -m pytest tests -m integration
.venv/bin/python -m pytest tests -m e2e
```

## Conventions

- File names: `test_<unit>_<scenario>.py` per RULES.md §7.
- New unit tests get `@pytest.mark.unit` (default — `addopts` already
  selects it). New integration tests get `@pytest.mark.integration`.
  New e2e tests get `@pytest.mark.e2e`.
- Each test is isolated by the `_clean_db` autouse fixture: it
  `DELETE`s all rows before the test runs. No shared state.
- No real WhatsApp calls. The `EVOLUTION_API_KEY` env var is forced
  empty in `conftest.py` so the worker marks rows as
  `skipped_no_key` rather than dialing out.
- The legacy `lifecycle_test.py` and `phase2_test.py` scripts are
  kept so the existing `./run_local.sh` style invocation
  (`python tests/lifecycle_test.py`) still works. New development
  should add tests under the proper tier directory instead.
