# NDKTU LMS — Codebase Audit

**Date:** 2026-07-31 · **Scope:** `backend/` (229 .py), `frontend/src` (184 .ts/.tsx),
`face-detection/` (29 .py), 70 Alembic revisions, `docker-compose.yml`, nginx config.
**Method:** every finding below comes from a file opened during this audit and cites
`file:line`. **Line numbers were re-derived after commit `ee44418`** ("modular API
routers"), which split three monolithic routers into per-module files and moved most
cited lines. Runtime probes were read-only against the running dev stack
(`localhost:8010`). No code was modified.

---

## 0. System map

### Backend composition

`backend/app/main.py:48` mounts one aggregate router under `/api`. There is **no
`/v1` segment** — the effective contract is `/api/<module>/...`.

```
app.include_router(router, prefix="/api")            main.py:48
  └─ modules/router.py:12-17
       auth · organization_structure · quiz · psychology · course · logs
```

`modules/statistics/` exists on disk but is **not** in `modules/router.py` and is
**not tracked by git** — only `__pycache__/*.pyc` remain (see F16).

**175 operations across 106 paths** (from the live `openapi.json`).
**137 permissions** in the DB, auto-discovered at boot from `PermissionRequired(...)`
literals (`core/lifespan/discovery.py`).

### Auth chain

| Layer | File | Behaviour |
|---|---|---|
| Header extraction | `core/dependencies/role_checker.py:21` | `APIKeyHeader("Authorization", auto_error=False)` → 401 not 403 when absent |
| Session validation | `auth/user/service.py:64-99` | decode JWT → compare `jti` to Redis `user:session:{uid}` → slide 30-min idle TTL |
| Permission gate | `core/dependencies/role_checker.py:34-86` | role `"Admin"` bypasses everything; else join `UserRole→Role→RolePermission→Permission` |
| Token issue | `auth/user/service.py:43-62` | HS256, `jti` in Redis, single active session |

Access and refresh tokens use **separate secrets** (`config.py:21-22`), so a refresh
token cannot be replayed as an access token even though `token_decode` does not check
the `type` claim. Not a finding.

### Models

All models inherit `Base + IdIntPk + TimestampMixin`. Timestamps are **consistently
naive UTC**: `core/mixins/time_stamp_mixin.py:12` plus a connection-level
`timezone=UTC` pin at `core/database/db_helper.py:30`. `TashkentDatetime`
(`core/schemas.py:22`) converts on serialization only. This is coherent — no finding.

`alembic heads` → single head `d1e4a7c93b02`. `alembic check` → **"No new upgrade
operations detected"**: no model/migration drift.

### Frontend

- Routes: `app/App.tsx:89-110` — a `[NavKey, path, render][]` table, every entry
  wrapped in `<RequireAccess>`; a route cannot be added without a guard.
- Transport: `shared/api/http.ts` — single fetch wrapper, `AbortController` timeouts,
  401 → clear token + redirect, 403 → `app:refresh-me` event.
- Token: `shared/lib/tokenStorage.ts` — `localStorage['token']`, every access in
  `try/catch`.
- State: zustand stores per feature, one API module per domain in `shared/api/`.

---

## 1. Summary table

| ID | Severity | Area | Title | File:line |
|---|---|---|---|---|
| F01 | **P0** | Security | ~~`POST /api/user/` has no auth and accepts arbitrary roles → full takeover~~ **FIXED** | `backend/app/modules/auth/user/router.py:97` |
| F02 | **P0** | Security | ~~Three upload handlers accept any extension/size → stored XSS~~ **FIXED** | `backend/app/core/utils/upload.py` |
| F03 | **P1** | Security | ~~`GET /api/result/{id}` has no ownership check while the list endpoint does~~ **FIXED** | `backend/app/modules/quiz/result/repository.py:72` |
| F04 | **P1** | Security | ~~`GET /api/user-answers/` applies no scoping whatsoever~~ **FIXED** | `backend/app/modules/quiz/user_answers/repository.py:17` |
| F05 | **P1** | Security | Data scoping keys on role *names*; fails open for every custom role | `backend/app/modules/quiz/question/repository.py:91` |
| F06 | **P1** | Security | ~~Admin detection is case-sensitive in the gate, case-insensitive in repositories~~ **FIXED** | `backend/app/core/utils/roles.py` |
| F07 | **P1** | Security | ~~`IS_PROD` is documented and set, but does not exist in code~~ **FIXED** | `backend/app/core/config.py:23` |
| F08 | **P1** | Perf/DoS | ~~No upper bound on `limit`; `?limit=100000000` returns 200~~ **FIXED** | `backend/app/core/schemas.py:25` |
| F09 | **P1** | Async | ~~Blocking file and Excel I/O inside `async def` stalls the whole worker~~ **FIXED** | `backend/app/modules/quiz/question/repository.py:262` |
| F10 | **P2** | DB | 33 FK columns unindexed, including `user_roles` on the per-request auth path | (DB introspection, see F10) |
| F11 | **P2** | Security | Login distinguishes unknown user from wrong password → username enumeration | `backend/app/modules/auth/user/service.py:113` |
| F12 | **P2** | Security | No password policy: any non-empty string is accepted | `backend/app/modules/auth/user/schemas.py:44` |
| F13 | **P2** | Security | Production CORS allowlist contains `localhost` origins and a plain-`http` origin | `.env:52` |
| F14 | **P2** | Structure | Transactions commit in 24 repositories; only 1 service owns a transaction | `backend/app/modules/auth/user/repository.py:59` |
| F15 | **P2** | DB | `employees.user_id` FK has no `ondelete` → deleting a user 500s | `backend/app/modules/auth/model.py:177` |
| F16 | **P2** | Structure | `modules/statistics/` ships stale `.pyc` files that are untracked and unroutable | `backend/app/modules/statistics/` |
| F17 | **P3** | DB | 14 of 70 migrations have an empty `downgrade()` | `backend/app/migrations/versions/` |
| F18 | **P3** | Docs | Comment claims plaintext passwords are stored; they are not | `backend/app/modules/auth/hemis/service.py:168` |
| F19 | **P3** | API | 17 endpoints declare no `response_model` | `backend/app/modules/quiz/router.py:529` |
| F20 | **P3** | Ops | Log filename date is frozen at import time | `backend/app/core/logging.py:74` |
| F21 | **P1** | Security | `create:user` alone is enough to mint an `Admin` account | `backend/app/modules/auth/user/repository.py:34` |
| F22 | **P1** | Ops | ~~Enabling `is_prod` on face-detection makes its healthcheck fail and blocks the whole stack~~ **FIXED** | `docker-compose.yml:28` |
| F23 | **P2** | Ops | The two services read *different* env vars for the same `is_prod` switch | `face-detection/app/core/config.py:11` |

### Verified clean

These were checked and found correct — recorded so they are not re-audited:

- **No frontend/backend contract drift.** All 72 distinct paths in `shared/api/*.ts`
  resolve to a declared operation in the live `openapi.json`. The only two
  non-matches were a literal in `http.test.ts:137` and a query-string template.
- **No SQL injection.** Every `text()` occurrence is a static `server_default` inside
  a migration; no string interpolation reaches a query.
- **No model/migration drift**, single Alembic head.
- **Quiz-taking authorization is sound**: `quiz_process/repository.py:172, 218` verify
  `result_obj.user_id == user.id`, and `:181-194` reject answers for questions never
  served to that attempt.
- **`course/resource/repository.py:48-67` is a correct upload implementation** —
  extension allowlist, size cap, UUID filename. Use it as the reference for F02.
- **face-detection uses `secrets.compare_digest`** for its internal token
  (`face-detection/app/core/security.py:22`) — constant-time.
- **Frontend has zero `any`**, no hardcoded API hosts, and no secrets in `VITE_*`.
- **`.env` is gitignored** (`.gitignore:31-32`); `.env.example` contains only
  `<CHANGE_ME>` placeholders.

---

## 2. Findings

### F01 · P0 · `POST /api/user/` is unauthenticated and grants any role

```python
# backend/app/modules/auth/router.py:154-165
@user_router.post("/", response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))])   # rate limit only
async def create_user(data: UserCreateRequest,
                      session: AsyncSession = Depends(db_helper.session_getter)):
```

There is no `PermissionRequired` and no `get_current_user_id` in the signature or in
`dependencies`. `UserCreateRequest.roles` is `list[RoleRequest]` where `RoleRequest`
is `{name: str}` (`auth/user/schemas.py:28-34`), and `create_user` resolves those
names straight to `Role` rows and attaches them (`auth/user/repository.py:30-47`).

**Verified at runtime.** An unauthenticated `POST /api/user/` with an empty body
returns **422** (body validation was reached), while the same probe against
`POST /api/faculty/` returns **401**:

```
no-auth POST /api/user/   with empty body -> HTTP 422
no-auth POST /api/faculty/ with empty body -> HTTP 401
```

**Why it matters.** Anyone who can reach the API — the SPA origin is public — can
send `{"username":"x","password":"y","roles":[{"name":"Admin"}]}` and receive an
account that `role_checker.py:52-55` waves past every permission check in the system:
all student PII, all results, all grades, plus delete on every entity. The 5/60 rate
limit only caps the rate of takeovers. This is a complete authentication bypass, not
a privilege-escalation edge case.

**Fix.** Add `_: PermissionRequired = Depends(PermissionRequired("create:user"))` to
the handler, matching every sibling in the same router. Separately, reject
privileged role names unless the caller is Admin, so `create:user` alone cannot mint
an Admin.

**Risk:** low — one line, and `create:user` already exists in the permission table.
**Effort:** minutes. Confirm the SPA never calls this endpoint anonymously first
(it does not: `shared/api/xodimlar.ts` only calls it from authenticated screens).

---

### F02 · P0 · Unvalidated uploads become stored XSS on the application origin

Three handlers write whatever they are given:

```python
# backend/app/modules/quiz/question/repository.py:253-262
file_ext = file.filename.split(".")[-1]          # no allowlist
filename = f"{uuid.uuid4()}.{file_ext}"
file_path = upload_dir / filename
with open(file_path, "wb") as buffer:
    shutil.copyfileobj(file.file, buffer)        # no size cap
```

Identical code at `auth/employee/repository.py:39-47` and
`quiz/quiz/repository.py:480-488`. No extension allowlist, no MIME sniffing, no size
limit.

The upload directory is mounted as static content at `main.py:29`
(`app.mount("/uploads", StaticFiles(...))`) and nginx proxies `/uploads/` to the
backend on the **same origin as the SPA** (`frontend/nginx.conf:26-27`). Starlette's
`StaticFiles` sets `Content-Type` from the file extension.

**Why it matters.** A user with `create:question` uploads `payload.html` (or `.svg`).
It is served from `https://<app-host>/uploads/question/<uuid>.html` as `text/html`,
same origin as the SPA — so the script reads `localStorage['token']`
(`shared/lib/tokenStorage.ts:16`) and posts it away. That token is a live session for
whoever visits the link. Separately, the missing size cap lets one request fill the
`backend_uploads` volume, which the backend and face-detection service share.

The correct implementation already exists in this repo at
`course/resource/repository.py:48-67`.

**Fix.** Extract the resource validator into a shared helper and call it from all
three sites. Additionally set `Content-Disposition: attachment` (or serve uploads
from a separate origin) so a stored HTML file can never execute against the app.

**Risk:** low. **Effort:** ~1 hour including the shared helper.

---

### F03 · P1 · `GET /api/result/{id}` performs no ownership check

```python
# backend/app/modules/quiz/result/repository.py:21-38
async def get_result(self, session: AsyncSession, result_id: int) -> Result:
    stmt = select(Result).options(...).where(Result.id == result_id)
    obj = (await session.execute(stmt)).scalar_one_or_none()
    if not obj: raise HTTPException(404, "Result not found")
    return obj                                   # returned to any read:result holder
```

The sibling `list_results` at `:40-75` carefully branches on admin/teacher/student and
restricts a teacher to their assigned groups. The by-id path does none of that, and
the router (`quiz/router.py:487-492`) passes no `current_user`.

**Why it matters.** A teacher enumerates `/api/result/1..N` and reads every exam
result in the university — other faculties' students, their grades, and the
`cheating_detected` / `cheating_image_url` proctoring evidence. The list endpoint's
careful scoping creates a false impression that the data is partitioned.

**Fix.** Pass `current_user` into `get_result` and reuse the same predicate
`list_results` builds, rather than duplicating it.

**Risk:** medium — must not break the teacher analytics screen, which legitimately
opens results for its own groups. **Effort:** half a day with tests.

---

### F04 · P1 · `GET /api/user-answers/` applies no scoping at all

```python
# backend/app/modules/quiz/user_answers/repository.py:15-35
async def get_all(self, session, data: UserAnswersListRequest):
    stmt = select(UserAnswers).options(selectinload(UserAnswers.question))
    filters = []
    if data.result_id is not None: filters.append(UserAnswers.result_id == data.result_id)
    ...                                          # user_id / quiz_id taken from the query
```

Every filter comes from the caller's query string; nothing is derived from the
authenticated user. The route (`quiz/router.py:527-531`) gates on
`PermissionRequired("user_answers:read")` and passes `_` — the user object is
discarded.

**Why it matters.** This is the "which answer did this student give" endpoint.
`GET /api/user-answers/?user_id=<any>&quiz_id=<any>` returns another student's
submitted answers alongside `correct_answer` — a working answer key for anyone holding
`user_answers:read`. The SPA does not call this endpoint today (verified:
`grep -rn "user-answers" frontend/src` returns nothing), so exploitation needs a token
and `curl` rather than a click; that lowers the odds of accidental exposure but not of
deliberate use, and the endpoint is published in the public schema (F07).

**Fix.** Same as F03 — thread `current_user` through and constrain by the caller's
role scope; a student must be pinned to `user_id == current_user.id`.

**Risk:** medium. **Effort:** half a day.

---

### F05 · P1 · Authorization scoping keys on role *names*, and fails open

```python
# backend/app/modules/quiz/question/repository.py:88-93
is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
if not is_admin and is_teacher:
    stmt = stmt.where(Question.user_id == current_user.id)   # teachers see only their own
```

33 such checks across 9 repository files: `quiz/question`, `quiz/result`,
`quiz/quiz`, `quiz/subject`, `quiz/quiz_process`, `course/lesson`, `course/content`,
`organization_structure/group`, `auth/role`.

**Why it matters.** The filter is applied only when the role is literally named
`teacher`. Roles are free-form rows an administrator creates in the Rollar UI — the
system deliberately has no closed role list. Give a role named `dekan` (or
`kafedra_mudiri`, or `oqituvchi`) the `read:question` permission and it is neither
`admin` nor `teacher`, so **no** narrowing predicate runs and it reads every
teacher's question bank. The permission grants access; the missing name match removes
the boundary. Every screen in the frontend already derives access from permissions,
never role names (`entities/access/model/nav.ts`) — the backend's data layer is the
one place that still does the opposite.

**Fix.** Replace the name checks with explicit scope permissions
(`read:question_all` vs `read:question_own`), or attach a scope attribute to roles.
Whichever is chosen, the default when nothing matches must be the *narrowest* scope,
not the widest.

**Risk:** high — this is a behavioural change across nine modules and must be rolled
out with the permission grants. **Effort:** 2–3 days.

---

### F06 · P1 · Admin is matched case-sensitively in one place and case-insensitively in another

```python
# backend/app/core/dependencies/role_checker.py:52
is_admin = any(role.name == "Admin" for role in user.roles)          # exact
# backend/app/modules/quiz/result/repository.py:65
is_admin = any(role.name.lower() == "admin" for role in current_user.roles)  # folded
```

And role creation via HEMIS lowercases the name it stores:

```python
# backend/app/modules/auth/user/repository.py:337
normalized_name = role_name.strip().lower()
```

**Why it matters.** A role stored as `admin` (lowercase) — which `ensure_role` will
happily create — passes every repository's admin branch, so it sees **all** results,
questions, groups and lessons unfiltered, yet fails `role_checker.py:52`, so it does
*not* get the permission bypass. The result is a role with university-wide data
visibility that nobody would recognise as an admin when reviewing the Rollar screen.
The inverse also holds: a legitimately-cased `Admin` behaves correctly, so the
inconsistency is invisible until someone creates the lowercase variant.

**Fix.** One shared helper, one comparison rule (case-insensitive), used by both the
gate and the repositories. Enforce it at role creation too.

**Risk:** low. **Effort:** 1–2 hours. Best done together with F05.

---

### F07 · P1 · `IS_PROD` is documented and configured but does not exist in code

```bash
# .env.example:30  and  .env:20
# Set to True in production — disables /docs, /redoc, /openapi.json.
APP_CONFIG__SERVER__IS_PROD=False
```

```python
# backend/app/core/config.py:13-17
class ServerConfig(BaseModel):
    app_path: str; host: str; port: int; reload: bool = True    # no is_prod
```

`grep -rn "is_prod|docs_url|redoc_url|openapi_url" backend/app` returns nothing, and
`main.py:15` is a bare `FastAPI(lifespan=lifespan)`. `AppConfig` sets
`extra="ignore"` (`config.py:98`), so the unknown variable is swallowed silently.

**Verified at runtime:** `/docs` → 200, `/openapi.json` → 200, unauthenticated.

**Why it matters.** An operator reads the template, sets `IS_PROD=True`, and believes
the schema is hidden. It never was. The full 175-operation surface — including
`POST /api/user/` from F01 — stays published. nginx only proxies `/api/` and
`/uploads/` (`frontend/nginx.conf:15,26`), so exposure depends on whether the backend
port is reachable directly; `docker-compose.yml:60` publishes it on the host.

**Fix.** Either implement the flag (`FastAPI(docs_url=None if settings.server.is_prod
else "/docs", ...)`) or delete it from both `.env` files. Silently-ignored security
configuration is worse than none.

**Risk:** low. **Effort:** 30 minutes. See also "Needs your decision" #1.

---

### F08 · P1 · List endpoints accept an unbounded `limit`

```python
# backend/app/modules/auth/user/schemas.py:104-106
class UserListRequest(BaseModel):
    page: int = 1
    limit: int = 10          # no Field(le=...)
```

27 list schemas across every module declare `limit` this way; `grep "limit.*le="`
over `backend/app/modules` returns **nothing**.

**Verified at runtime:** `GET /api/user/?limit=100000000` → **200**.

**Why it matters.** Any authenticated account turns any list endpoint into a
full-table scan plus full ORM materialisation and Pydantic serialization. On
`/api/students/` (1164 rows today, with `selectinload` of user and group) a handful of
concurrent requests exhausts the 50-connection pool (`config.py:38`) and the worker's
memory. No attack tooling is required — a typo in a client does it.

**Fix.** A shared paginated-request base with `limit: int = Field(default=..., ge=1,
le=200)` and `page: int = Field(ge=1)`, inherited by all 27 schemas.

**Risk:** low, but `getAll()` in `frontend/src/shared/api/envelope.ts:56` pages with
`pageSize=200` — keep the cap at or above that. **Effort:** 2 hours.

---

### F09 · P1 · Blocking I/O inside async handlers stalls the event loop

```python
# backend/app/modules/quiz/question/repository.py:261-262
with open(file_path, "wb") as buffer:
    shutil.copyfileobj(file.file, buffer)     # sync copy in an async def
# backend/app/modules/quiz/question/repository.py:274
df = pd.read_excel(io.BytesIO(contents))      # CPU-bound parse in an async def
```

Also `auth/employee/repository.py:47`, `quiz/quiz/repository.py:488`, and the
`openpyxl` export at `quiz/question/repository.py:348-349`.

**Why it matters.** uvicorn runs one event loop. A 20 MB upload copied with
`shutil.copyfileobj`, or a large question workbook parsed by pandas, blocks that loop
for its full duration — every other in-flight request, including `/health`, waits. A
teacher importing questions therefore freezes exam submissions for everyone. Because
uploads are also unbounded (F02) the stall has no upper limit.

**Fix.** `await file.read()` in chunks with `aiofiles`, or wrap the whole blocking
section in `anyio.to_thread.run_sync`. The Excel paths belong in a worker thread
regardless.

**Risk:** low. **Effort:** half a day.

---

### F10 · P2 · 33 foreign-key columns have no index, including the auth hot path

Introspected from the running database:

```
user_roles.user_id      user_roles.role_id
role_permissions.role_id  role_permissions.permission_id
results.user_id  results.quiz_id  results.group_id  results.subject_id
user_answers.user_id  user_answers.question_id  user_answers.quiz_id
students.user_id  students.group_id  questions.subject_id  ... (33 total)
```

**Why it matters.** `PermissionRequired.__call__`
(`core/dependencies/role_checker.py:70-78`) joins
`Permission → RolePermission → Role → UserRole` filtered by `UserRole.user_id` on
**every authenticated request**. With no index on `user_roles.user_id` or
`role_permissions.role_id`, that is a sequential scan per request. It is invisible at
today's five users and becomes the system's floor latency at a few thousand. The
`results` and `user_answers` columns matter for the analytics screens, which join on
exactly those keys.

**Fix.** One migration adding the indexes. `user_roles` and `role_permissions` first —
they are on the request path.

**Risk:** low (additive; use `CREATE INDEX CONCURRENTLY` if the table is hot).
**Effort:** 1 hour.

---

### F11 · P2 · Login reveals whether a username exists

```python
# backend/app/modules/auth/user/service.py:112-116
if not user:
    raise HTTPException(401, detail="Incorrect username")
if not verify_password(data.password, user.password):
    raise HTTPException(401, detail="Incorrect password")
```

**Why it matters.** Two distinguishable responses turn login into a user-enumeration
oracle. The rate limiter (`auth/router.py:118`) is keyed by
`ip:username:path` (`:92-102`), so probing *different* usernames from one IP never
shares a bucket — the design that protects real users against lockout also removes the
brake on enumeration. Combined with F12's absent password policy, a confirmed username
list is directly useful.

**Fix.** One message for both branches, and run `verify_password` against a dummy hash
when the user is missing so the timing does not leak the same fact.

**Risk:** low. **Effort:** 30 minutes.

---

### F12 · P2 · No password policy

```python
# backend/app/modules/auth/user/schemas.py:42-47
@field_validator("password", mode="before")
def validate_password(cls, value: str) -> str:
    if not value.strip():
        raise ValueError("Password cannot be empty")
    return value.strip()
```

Any non-empty string is accepted, here and in `EmployeeCreateRequest`
(`auth/employee/schemas.py:70-75`) and `UserChangeCredentialsRequest`. Hashing itself
is correct — bcrypt via passlib (`core/utils/password_hash.py:3`).

**Why it matters.** Accounts are provisioned in bulk by administrators and by HEMIS
sync; without a floor, `1` is a valid password for a `dekan` account. Note the bcrypt
72-byte truncation is also unhandled — a password longer than 72 bytes silently
compares only its prefix.

**Fix.** Minimum length (8+) in one shared validator, plus an explicit length ceiling.

**Risk:** low, but it will reject existing weak passwords on next change — decide
whether to force a rotation. **Effort:** 1 hour.

---

### F13 · P2 · Production CORS allowlist includes localhost and a plain-http origin

```bash
# .env:52
APP_CONFIG__CORS__ORIGINS=["http://localhost:3000","http://127.0.0.1:3000",
  "http://localhost:5173","http://127.0.0.1:5173",
  "http://lms.api.nsumt.uz","https://lms.api.nsumt.uz"]
```

Used with `allow_credentials=True` at `main.py:37-43`.

**Why it matters.** The four development origins stay trusted in production: a page an
attacker gets a victim to load on `http://localhost:5173` can call the production API
with the browser's cooperation. The impact is bounded here because the session token
travels in an `Authorization` header from `localStorage`, not in a cookie — so
`allow_credentials` buys the attacker nothing by itself. The `http://` variant of the
real host is the more concrete issue: it invites a cleartext call that a network
attacker can read.

**Fix.** Split the config per environment; production keeps only the `https://` origin.

**Risk:** low. **Effort:** 30 minutes — but coordinate with whoever deploys.

---

### F14 · P2 · Transaction boundaries live in repositories, not services

`grep -rln "session.commit()" --include=repository.py` → **24 files**.
`--include=service.py` → **1** (`auth/hemis/service.py`).

```python
# backend/app/modules/auth/user/repository.py:58-60
try:
    await session.commit()
    await session.refresh(new_user, attribute_names=["roles"])
```

**Why it matters.** A repository that commits cannot be composed. The codebase already
hit this: `create_user` needed a `commit: bool = True` escape hatch
(`auth/user/repository.py:23, 52-56`) so `EmployeeRepository` could create a user and
an employee in one transaction. Every future multi-entity operation needs the same
hack, and any that forgets leaves a half-written record — a user with no employee row
— behind a failure.

**Fix.** Move `commit()` up to the service layer; repositories only `add`/`flush`/
`select`. This is a large mechanical refactor — worth scheduling deliberately rather
than doing opportunistically.

**Risk:** medium (touches every write path). **Effort:** several days.

---

### F15 · P2 · `employees.user_id` has no `ondelete`, so deleting a user fails

```python
# backend/app/modules/auth/model.py:212
user: Mapped["User"] = relationship("User", back_populates="employee")
```

Confirmed in the database — every other referencing table declares a policy, this one
does not:

```
employees CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
group_teachers CONSTRAINT group_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id)
```

(compare: `students.user_id ... ON DELETE SET NULL`, `user_roles.user_id ... ON DELETE CASCADE`.)

**Why it matters.** `DELETE /api/user/{id}` on a user who has an employee record raises
an `IntegrityError` that is not caught in that path, surfacing as a 500 with no
explanation. The administrator sees a broken button, not "this user is a member of
staff".

**Fix.** Decide the intended semantics (probably `RESTRICT` with a 409 that names the
employee, matching how faculty/kafedra deletion already reports its blockers) and add
the migration.

**Risk:** low. **Effort:** 2 hours.

---

### F16 · P2 · `modules/statistics/` is stale compiled bytecode

```
backend/app/modules/statistics/__pycache__/router.cpython-312.pyc
backend/app/modules/statistics/routers/__pycache__/psychology.cpython-314.pyc   ... (20+ files)
```

`git ls-files backend/app/modules/statistics` returns **0 files** — no source is
tracked. The package is not imported by `modules/router.py`.

**Why it matters.** The `.pyc` files are in the working tree and therefore in the
built image unless `.dockerignore` excludes them. They are compiled from source that
no longer exists, for two different Python versions (3.12 and 3.14). Anyone reading
the tree sees a "statistics module" that cannot be reviewed, cannot be run, and does
not exist in history. If any of it is still wanted, it must be recovered from
elsewhere before the directory is removed.

**Fix.** Confirm nothing is needed, then delete the directory and ensure
`__pycache__` is ignored by both git and Docker.

**Risk:** low, once the "is any of this wanted?" question is answered — see
"Needs your decision" #3. **Effort:** 15 minutes.

---

### F17 · P3 · 14 of 70 migrations cannot be rolled back

14 revision files contain a `downgrade()` whose body is `pass`.

**Why it matters.** A failed deploy cannot be stepped back through those revisions;
recovery is restore-from-backup only. That is a defensible trade for
data-destructive migrations, but it should be a decision, not an omission.

**Fix.** Implement the reversible ones; for the rest, replace `pass` with an explicit
`raise NotImplementedError("irreversible: <reason>")` so the constraint is visible at
the moment someone tries.

**Risk:** none. **Effort:** 2 hours.

---

### F18 · P3 · Comment claims plaintext passwords are stored

```python
# backend/app/modules/auth/hemis/service.py:168
# User — repo hashes internally and stores both hash + plaintext
```

The claim is false. `get_or_create_for_hemis` (`auth/user/repository.py:322-334`)
stores only `hash_password(plain_password)`, and the `users` table has exactly two
credential columns — `username`, `password` — verified by `\d users`.

**Why it matters.** It is the single most alarming line in the codebase and it is
wrong. An auditor or a new engineer will either raise a false P0 or, worse, believe it
and design around a plaintext column that does not exist.

**Fix.** Delete the trailing clause.

**Risk:** none. **Effort:** one minute.

---

### F19 · P3 · 17 endpoints declare no `response_model`

Examples: `quiz/router.py:527` (`get_user_answers`), `organization_structure/router.py:294`
(`get_group_delete_info`), `course/router.py:521` (`reorder_course_topics`).

**Why it matters.** Most are legitimately shapeless (204 responses, file uploads,
reorder acknowledgements) and are not worth changing. Two are not:
`get_user_answers` and `get_group_delete_info` return substantial dict payloads whose
shape appears nowhere in the OpenAPI schema. Neither is currently called by the SPA
(verified: `grep -rn "user-answers\|delete-info" frontend/src` returns nothing), so
the immediate risk is low — but an undeclared shape is exactly how a field gets
dropped silently, which is the failure this codebase has already hit three times in
the structure module.

**Fix.** Add response models to those two; leave the rest.

**Risk:** low. **Effort:** 1 hour.

---

### F20 · P3 · Log filename date is captured once at import

```python
# backend/app/core/logging.py:74
today = datetime.now().strftime("%Y-%m-%d")  # prefix date in filename
```

`TimedRotatingFileHandler(when="midnight")` rotates correctly, but the *base*
filename keeps the date the process started. After a week of uptime the live file is
still named for the boot date while its rotated siblings carry accurate suffixes.

**Fix.** Drop the date from the base name and let the handler's suffix carry it.

**Risk:** none. **Effort:** 15 minutes.

---

### F21 · P1 · `create:user` on its own is enough to create an Admin

Split out of F01 during remediation, by decision: F01's fix closed the anonymous
access, this is the remaining privilege boundary inside the now-authenticated endpoint.

```python
# backend/app/modules/auth/user/repository.py:30-47
roles = []
if data.roles:
    role_names = [role.name for role in data.roles]
    stmt_roles = select(Role).where(Role.name.in_(role_names))
    roles = (await session.execute(stmt_roles)).scalars().all()   # no caller check
```

The caller's own roles are never consulted. `POST /api/user/` and
`POST /api/employee/` (`auth/employee/schemas.py:39`, same `roles` field) both accept
an arbitrary role list.

**Why it matters.** `create:user` and `create:employee` read as clerical permissions —
the kind an HR or registrar role would be given so it can onboard staff. Either is
enough to create an account holding `Admin`, which `role_checker.py:52-55` waves past
every permission check. The holder then logs in as that account. This is a one-step
escalation from "can add staff" to full control, and nothing in the Rollar UI signals
that the two permissions carry it.

**Fix.** Requires a policy decision first — see "Needs your decision" #6. The narrow
version is to reject the `Admin` role unless the caller holds it; the general version
is to forbid granting any role the caller does not already have.

**Risk:** medium — the general version can break existing provisioning flows.
**Effort:** 2 hours once the policy is chosen.

---

### F22 · P1 · Turning on production hardening for face-detection blocks the stack

Found while implementing F07.

```yaml
# docker-compose.yml:28  (face-detection healthcheck)
test: ["CMD", "curl", "-f", "http://localhost:8000/docs"]
# face-detection/app/main.py:40   docs_url=None if settings.is_prod else "/docs"
```

face-detection implements `is_prod` correctly — and has **no `/health` route at all**
(probe: `localhost:8001/health` → 404, `/docs` → 200). So its healthcheck depends on the
very endpoint the flag removes.

**Why it matters.** Set `is_prod=True` for that service and `/docs` starts returning 404.
The healthcheck fails, the container is marked unhealthy, and `backend` never starts —
`docker-compose.yml:55-56` makes it wait on `face-detection: condition: service_healthy`.
The whole stack stays down, and the log says only "container unhealthy", pointing at the
wrong service. This is a trap that springs precisely when someone hardens for production.

**Fix.** Add a `/health` route to face-detection and point the healthcheck at it — the
same shape the backend already uses. Alternatively drop the flag from that service, but
the route is worth having regardless.

**Risk:** low. **Effort:** 20 minutes.

---

### F23 · P2 · One concept, two environment variable names

Found while verifying F22.

```python
# backend/app/core/config.py:97       env_prefix="APP_CONFIG__"  → APP_CONFIG__SERVER__IS_PROD
# face-detection/app/core/config.py:11 SettingsConfigDict(env_file=".env")  → bare IS_PROD
```

Both services read the same `.env`, both have an `is_prod` flag meaning the same thing,
and they take it from different variables. `.env:20` defines only
`APP_CONFIG__SERVER__IS_PROD`; face-detection ignores it (`extra="ignore"`) and falls
back to its default `False`.

**Why it matters.** An operator hardening for production sets the documented variable,
sees the backend's `/docs` disappear, and reasonably concludes the job is done. The
face-detection service keeps serving `/docs`, `/redoc` and `/openapi.json` — including
its full schema for the proctoring WebSocket. It is the same failure shape as F07: a
security setting that reports success while half of it does nothing.

**Fix.** Give face-detection the same `APP_CONFIG__` prefix and nested `server.is_prod`
shape as the backend, or document the bare `IS_PROD` in `.env.example` next to the other
one. The first is better; the second is a stopgap. Either way it is a naming decision,
which is why it is recorded rather than fixed.

**Risk:** low. **Effort:** 30 minutes.

---

## 3. Fix first — in execution order

**Done so far (see `FIXLOG.md`):** F01, F02, F07, F08, F03, F04, F06, F09, F22 — both
P0s and seven of the P1s. Each was verified against the running stack and committed separately.

Remaining, in the order I would take them:

1. **F21** — the last open P1 in the auth path. Blocked only on the policy question in
   §4; the code change is small either way.
2. **F05** — the largest remaining security item and the reason the two scoping fixes
   above still fail open for custom roles. Needs the design decision in §4 first.
3. **F10** — 33 unindexed FKs, two of them (`user_roles`) on the per-request auth path.
   Pure win, no behaviour change, but it is a migration and so needs approval.
4. **F11 + F12** — login enumeration and the absent password policy. Small, independent.
5. **F15** — `employees.user_id` needs an `ondelete`; deleting a user currently 500s.
6. **F13** — strip `localhost` and the plain-`http` origin from the production CORS list.
7. **F16** — delete the untracked `statistics/` `.pyc` tree.
8. **F14** — move transactions out of the repositories. Large, mechanical, and best done
   after the security work has settled.
9. **F17–F20**
10. **F23** — the P3 tail.

**Before any of these:** the test suite is at 0 passed / 151 errors and `mypy` is not
installed, so none of the above can be regression-tested. See §4.

## 4. Needs your decision

1. **Is the backend port reachable from outside the host?** `docker-compose.yml:60`
   publishes it (`8010:8000`), and nginx proxies only `/api/` and `/uploads/`. If the
   published port is firewalled in production, F07's `/docs` exposure is P3 rather
   than P1 — but F01 is reachable through nginx either way. I could not verify the
   production firewall from here.

2. **Who is meant to hold `read:student_sensitive` and `read:employee_sensitive`?**
   `auth/router.py:418` and `:761` gate on the permission but apply no faculty or
   kafedra scoping — a holder reads any student's JSHSHIR and passport, university-wide.
   If the intent was "a dean sees their own faculty", that is a missing scope check
   and belongs at P1. If the intent was "a small central group sees everyone", the
   code is correct as written. I cannot tell which from the code.

3. **Is anything in `modules/statistics/` still wanted?** No source is tracked in git,
   so I cannot see what it did. The `.pyc` names suggest item analysis, proctoring,
   demographics, and psychology reporting — none of which exists elsewhere in the API.
   If those reports are still expected, the source needs recovering before the
   directory is deleted.

4. **Should `/api/v1/...` exist?** The audit brief refers to `/api/v1/<module>/...`;
   the code uses `/api/<module>/...` with no version segment
   (`main.py:48`), and the frontend matches it exactly. I have treated the brief's
   path as the discrepancy and the code as correct, but if versioned paths are a real
   requirement this is a deliberate migration, not a defect.

5. **Should I repair the test suite before continuing?** `pytest` is at
   **0 passed / 151 errors** and has been since `sardor_student_id` introduced a
   mutual FK between `groups` and `students` — `drop_all()` cannot order the teardown
   (`CircularDependencyError`), which then leaves an `Admin` role behind and breaks
   `conftest.py:102`. Fixing it means touching `conftest.py` and adding
   `use_alter=True` to one FK in a model, i.e. schema-adjacent. Until it is fixed I
   can only verify fixes with targeted live probes, and no fix below can be
   regression-tested. Also: `mypy` is not installed — adding it is a new dependency.

6. **What is the role-granting policy?** Blocks **F21**. Either "only an Admin may
   grant `Admin`" (narrow, safe) or "nobody may grant a role they do not hold"
   (general, may break existing provisioning). Both are behavioural changes to
   `POST /api/user/` and `POST /api/employee/`.

7. **Are the 14 irreversible migrations intentional?** Several drop columns, where a
   no-op downgrade is the honest answer. Confirm before I write
   `NotImplementedError` bodies that would change deploy behaviour.
