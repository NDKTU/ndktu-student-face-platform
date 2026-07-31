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
| F02 | The three image-upload handlers wrote whatever they were sent — no extension, type or size check — into a directory served as static content from the SPA's own origin. All three now go through one validator: raster-image allowlist, 5 MB cap, chunked read, UUID filename. | new `backend/app/core/utils/upload.py`; `quiz/question/repository.py:249`, `quiz/quiz/repository.py:475`, `auth/employee/repository.py:35` | Live probes as admin against all three endpoints: `.html` payload → **400** on each; `.svg` → **400**; 6 MB PNG → **400** ("must not exceed 5MB"); valid 1×1 PNG → **200** with a URL. Disk checked after the rejected 6 MB upload: no partial file, no file over 5 MB, count back to its original 7. ruff **72 → 72**. pytest **1 failed / 151 errors → 1 failed / 151 errors**. | ✅ Done |

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
