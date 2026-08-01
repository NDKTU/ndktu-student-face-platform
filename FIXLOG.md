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

**Baseline moved at commit `ee44418`** ("modular API routers", +3151/−2327, not mine):
ruff rose to **89**. Findings fixed from F06 onward are measured against 89, not 72.
All six earlier fixes were re-verified live after that refactor and survived it intact —
`POST /api/user/` still 401 anonymous, `.html` upload still 400, `/docs` still gated by
the flag, `?limit=100000000` still 422, and both scoped reads still answer correctly.
An AST scan over the new router files found only three endpoints without an auth
dependency: the two login routes and the client-log collector, all intentional.

---

| ID | What changed | Files | How verified | Status |
|---|---|---|---|---|
| F01 | `POST /api/user/` now requires the `create:user` permission. It previously had no authentication at all, so any anonymous caller could create an account and name its roles — including `Admin`, which bypasses every permission check. | `backend/app/modules/auth/router.py:163` | Live probe on the running stack: anonymous `POST /api/user/` → **401** (was 422, i.e. it reached body validation); anonymous payload requesting `roles:[{"name":"Admin"}]` → **401**; authenticated admin `POST` → **201** with the requested role attached; DB confirms the anonymous attempts created nothing. Control endpoint `/api/faculty/` unchanged at 401. ruff **72 → 72** (the single `I001` in the touched file is present in the `HEAD` version too). pytest **1 failed / 151 errors → 1 failed / 151 errors**. | ✅ Done |
| F02 | The three image-upload handlers wrote whatever they were sent — no extension, type or size check — into a directory served as static content from the SPA's own origin. All three now go through one validator: raster-image allowlist, 5 MB cap, chunked read, UUID filename. | new `backend/app/core/utils/upload.py`; `quiz/question/repository.py:249`, `quiz/quiz/repository.py:475`, `auth/employee/repository.py:35` | Live probes as admin against all three endpoints: `.html` payload → **400** on each; `.svg` → **400**; 6 MB PNG → **400** ("must not exceed 5MB"); valid 1×1 PNG → **200** with a URL. Disk checked after the rejected 6 MB upload: no partial file, no file over 5 MB, count back to its original 7. ruff **72 → 72**. pytest **1 failed / 151 errors → 1 failed / 151 errors**. | ✅ Done |
| F07 | `APP_CONFIG__SERVER__IS_PROD` was documented in `.env.example`, set in the real `.env`, and did not exist in code — `extra="ignore"` swallowed it, so `/docs`, `/redoc` and `/openapi.json` were public no matter what the operator configured. Implemented it, mirroring the face-detection service which already had exactly this. | `backend/app/core/config.py:18`, `backend/app/main.py:15-21` | With the current `IS_PROD=False`: `/docs`, `/redoc`, `/openapi.json`, `/health` all still **200**. With `IS_PROD=True` injected into the environment, importing the app yields `docs_url=None`, `redoc_url=None`, `openapi_url=None`; the same probe at `False` yields the three real paths. `/health` is deliberately not gated — the compose healthcheck depends on it. ruff **72 → 72**. pytest **1 failed / 151 errors → unchanged**. | ✅ Done |
| F08 | Every list input accepted an unbounded `limit`; `?limit=100000000` returned 200 and made the server materialise whole tables with their eager loads. All 27 schema fields and 5 raw router params now carry `ge=1, le=MAX_PAGE_SIZE` (1000). | new constant in `backend/app/core/schemas.py:25`; 23 `schemas.py` files; `auth/router.py`, `organization_structure/router.py`, `course/router.py` | Probes as admin: `limit=100000000` → **422** on `/user/`, `/students/`, `/teacher/ranking/overall`, `/group/{id}/students`, `/assignment/pending`; `limit=99999` → 422; `limit=0` → 422. Legitimate traffic unchanged: `limit=1000` → 200, `limit=200` → 200, default (no param) → 200. Frontend `tsc --noEmit` clean; its largest real request is 1000 (ranking CSV export) and still passes. ruff **72 → 72**. pytest **1 failed / 151 errors → unchanged**. | ✅ Done |
| F03 | `GET /api/result/{id}` returned any result to any holder of `read:result`, while the list endpoint carefully scoped by role. The role predicate is now extracted into `ResultRepository.scope_filter` and applied by both. Unauthorised reads answer 404, not 403, so the response does not confirm which ids exist. | `quiz/result/repository.py:21-95`, `quiz/router.py:490` | Probes with three real accounts against two seeded results (one owned by the student, one not): admin **200/200**; student **200** on its own, **404** on the other; teacher with no assignments **404/404** (the `Result.id == -1` branch). `GET /result/` after the refactor: admin `total=2`, student `total=1` — the count is scoped too. ruff **72 → 72**. pytest **1 failed / 151 errors → unchanged**. | ✅ Done |
| F04 | `GET /api/user_answers/` built every filter from the query string and none from the caller, so `?user_id=<anyone>` returned their submitted answers together with `correct_answer`. It now reuses the same `scope_filter`, restricted through the answer's `result_id`. | `quiz/user_answers/repository.py:15-38`, `quiz/router.py:534` | Probes against two seeded answers: admin sees both; student sees only its own; `?user_id=1` → **total 0**; `?result_id=2` → **total 0**. The count query shares the same filter list, so `total` cannot leak either. ruff **72 → 72**. pytest unchanged. | ✅ Done |
| F06 | "Is this user an admin?" was answered two incompatible ways: the permission gate compared exactly (`role.name == "Admin"`), sixteen call sites compared case-insensitively. A role named `admin` therefore got university-wide data visibility without the permission bypass — half the privileges, invisibly. All 16 sites now call one helper, which compares exactly. | new `backend/app/core/utils/roles.py`; `core/dependencies/role_checker.py:52`; 13 repositories and 2 of the new routers | Admin still reaches all of `/user/ /faculty/ /result/ /question/ /course/ /lesson/ /subject/ /group/` (200 each). Premise verified: creating a role named `admin` or `ADMIN` is refused with 400, because role-name uniqueness is already case-insensitive — so the narrow comparison cannot lock anyone out. ruff **89 → 89**. pytest **unchanged**. | ✅ Done |

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

### F02 — notes

**Why an allowlist alone closes the XSS.** The vector was that `StaticFiles` derives
`Content-Type` from the extension, so an uploaded `.html` or `.svg` executed as active
content on the app's own origin and could read `localStorage['token']`. Restricting to
raster formats — `jpg jpeg png gif webp` — removes every type a browser will execute.
That matters because the alternative hardening, serving uploads with
`Content-Disposition: attachment`, would have broken the product: question images and
profile photos are displayed inline.

**Size is enforced while reading, not after.** The file is consumed in 64 KB chunks and
the request is rejected the moment the running total passes 5 MB. Reading the whole
body first — as `course/resource/repository.py:55` does — would cap the disk but still
let one request pull an arbitrary amount into memory. A partially-written file is
removed on any failure, so a rejected upload leaves nothing behind (verified).

**Compatible with the existing test.** `app/test/test_quiz_upload.py:21` posts
`test_image.jpg` with 18 bytes of content and asserts 200 — `.jpg` is on the allowlist
and the size is far under the cap, so its assertions still hold. The test cannot
actually be executed today (harness broken, see above); this was established by reading
it, not by running it.

**Scope deliberately held.**

- `course/resource/repository.py:48-67` was already correct and is left untouched, so a
  fourth copy of this logic still exists. Consolidating it would be refactoring working
  code and belongs in its own change.
- The blocking `open()`/`write()` remains — that is F09. Because all three call sites
  now funnel through one function, F09 becomes a single-place fix.
- Files uploaded before this change were not audited or removed. The current
  `uploads/` tree holds only `.png` and `.jpg`, so nothing dangerous is stored today,
  but that is an observation about this instance, not a guarantee about production.

### F07 — notes

The intent was never in doubt: `face-detection/app/main.py:40-42` already does exactly
this, with the same comment wording as `.env.example:30`. The backend simply never got
the field. Implementing it was therefore the right call over deleting the setting.

**`/health` is deliberately left open.** `docker-compose.yml:62` health-checks the
backend with `curl -f /health`; gating it would make the container permanently
unhealthy.

**Discovered while verifying — reported as F22, not fixed here.** The
*face-detection* service has the flag implemented but **no `/health` route** (probe:
`localhost:8001/health` → 404), and `docker-compose.yml:28` health-checks it with
`curl -f /docs`. So enabling `is_prod` for that service makes its healthcheck fail,
which marks it unhealthy, which blocks `backend` — it waits on
`face-detection: condition: service_healthy`. Turning on production hardening there
would take the whole stack down at boot. Fixing it means either adding a `/health`
route to face-detection or repointing the healthcheck; both are outside F07 and in a
different service.

### F08 — notes

**Cap is 1000, by decision.** The frontend's bulk-fetch helper
(`shared/api/envelope.ts:60`) pages at 200, but the ranking CSV export
(`pages/reyting/ReytingPage.tsx:319`) asks for 1000 in a single request. A cap of 200
would have meant rewriting that export to paginate; 1000 keeps every existing call site
working while still removing five orders of magnitude of attack surface.

**`page` was left alone.** The finding is about `limit`. Every list schema already
guards `page < 1` in its `offset` property, so negative pages cannot produce a negative
OFFSET, and adding `ge=1` there would be scope creep.

**Repository defaults were left alone.** `limit: int = N` still appears in a handful of
repository function signatures (e.g. `course/assignment/repository.py:250`). Those are
internal Python defaults invoked with an already-validated value from the router; they
are not request inputs and carry no attack surface.

### F03 / F04 — notes

Fixed together: the same defect in the same module, and F04's scope is defined in
terms of F03's.

**A latent crash was found and fixed while extracting.** `list_results` computed the
count in a second query that referenced `is_admin` / `is_teacher` / `teacher_filter`.
Removing those locals in favour of the shared predicate would have left the count block
raising `NameError` on every `GET /api/result/`. Caught before rebuilding; the count now
uses the same `scope`, which also means `total` no longer reports how many rows exist
when none of them are visible.

**The fail-open for custom roles is preserved, deliberately.** `scope_filter` returns
`None` — meaning "everything" — for a user who is neither `admin`, `teacher` nor
`student` by role name. A role such as `dekan` holding `read:result` therefore still
sees every result. That is F05, not F03: closing it here would have changed behaviour
the list endpoint has always had, and silently. It is now written down in the
docstring, and because both endpoints share one predicate, F05 becomes a one-place fix
for this module.

**Legacy rows in `user_answers` are now invisible to teachers.** Scoping goes through
`result_id`, and that column is nullable — rows written before it existed have `NULL`
and match no result. A student still sees their own such rows only if they carry a
`result_id`. This instance has zero rows in the table, so nothing was observable to
verify against; in a production database with pre-`result_id` history a teacher would
lose access to it. Chosen deliberately: for a security fix the safe direction is deny,
and the endpoint is not called by the SPA at all, so nothing in the product depends on
it today.

### F06 — notes

**Tightened rather than loosened, deliberately.** Two directions were available: make
the gate case-insensitive (so `admin` gains the permission bypass) or make the
repositories exact (so `admin` loses the data visibility). The second is the safe
direction for a security fix, and the codebase supports it: `sync_admin_role` recreates
a role named exactly `Admin` on every boot, and role-name uniqueness is case-insensitive,
so a second role differing only in case cannot be created. Both were verified above.

**Production caveat.** If some deployment has an admin-equivalent role named in another
case, this narrows its data access. Nothing in this instance matches — the roles here are
`Admin`, `Teacher`, `Student`, `User`, `Psixologik`, `dekan` — but that is an observation
about one database, not a guarantee.

**A bug was caught mid-change.** The first attempt substituted `is_admin = is_admin(user)`,
which makes `is_admin` a local name and raises `UnboundLocalError` on the right-hand side.
Reverted and redone importing under the alias `user_is_admin`, so every call site keeps
its existing local variable name and only the predicate moves.

**`teacher` and `student` are still matched by lowercased name** in the same functions.
That is F05 and untouched here.

**Lint discipline.** The import insertions produced three new `I001` errors; those three
files were re-sorted with `ruff --fix --select I001`, scoped to exactly those paths. Net
ruff delta is zero (the two E501s that appear to move are pre-existing lines shifted by
one).
