# Fix log

Findings from `AUDIT.md`, fixed in severity order. One finding per commit.

## Verification tooling — read this before trusting any "verified" column

Two of the three requested tools do not currently produce a usable signal. Both
conditions pre-date this work; neither was introduced by a fix here.

| Tool | State | Consequence |
|---|---|---|
| `ruff` | Usable, but **72 pre-existing errors** at baseline (mostly `I001` import ordering). | Verified as **delta against baseline**, never as "clean". |
| `mypy` | **Not installed and not configured** — absent from `pyproject.toml` dependencies and dev-group; `uv run mypy` → `Failed to spawn`. | Cannot be run. Adding it is a new dependency and needs approval. |
| `pytest` | **Fully broken: 1 failed, 4 xfailed, 151 errors, 0 passed.** | Used only to confirm the failure count does not grow. |

`pytest` fails for two independent pre-existing reasons:

1. `CircularDependencyError` on teardown — `groups.sardor_student_id → students.id`
   and `students.group_id → groups.id` are mutual FKs, so `Base.metadata.drop_all()`
   cannot order the DROPs. One side needs `use_alter=True`.
2. `conftest.py:102` then fails with `UniqueViolationError: Key (name)=(Admin)
   already exists`, because the failed teardown leaves the row behind.

Repairing the harness touches `conftest.py` and probably a model definition
(schema-adjacent), so it is out of scope for the findings below and awaits a decision.

Baseline captured before any change: **ruff 72 errors · pytest 1 failed / 151 errors**.

---

| ID | What changed | Files | How verified | Status |
|---|---|---|---|---|
| F01 | `POST /api/user/` now requires the `create:user` permission. It previously had no authentication at all, so any anonymous caller could create an account and name its roles — including `Admin`, which bypasses every permission check. | `backend/app/modules/auth/router.py:163` | Live probe on the running stack: anonymous `POST /api/user/` → **401** (was 422, i.e. it reached body validation); anonymous payload requesting `roles:[{"name":"Admin"}]` → **401**; authenticated admin `POST` → **201** with the requested role attached; DB confirms the anonymous attempts created nothing. Control endpoint `/api/faculty/` unchanged at 401. ruff **72 → 72** (the single `I001` in the touched file is present in the `HEAD` version too). pytest **1 failed / 151 errors → 1 failed / 151 errors**. | ✅ Done |

### F01 — notes

**Blast radius was zero.** The SPA never calls this endpoint: `grep -rn "'/user/'"` and
`grep -rn "createUser"` over `frontend/src` both return nothing. Accounts are created
through `POST /api/employee/` (which builds a `User` internally) and through HEMIS
sync. No backend test covers it either. So no frontend call site needed updating and
no API contract changed.

`create:user` already existed in the permissions table — it gates `assign_role` at
`auth/router.py:234` — so boot-time permission discovery mints nothing new and no
role needs a manual grant.

**Deliberately not done**, to keep the change inside the finding:

- Transactions were not moved from repository to service. That is F14 (P2) and a
  multi-day refactor across 24 repositories.
- The URL was not changed to `/api/v1/...`. The codebase uses `/api/<module>/` and the
  frontend matches it exactly; see AUDIT.md "Needs your decision" #4.
- Role-escalation guarding was explicitly deferred by decision and recorded as **F21**.
