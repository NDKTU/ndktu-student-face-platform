# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Docker (primary workflow)
```bash
make up          # Build and start all services
make down        # Stop all services
make restart     # Restart all services
make logs        # Tail all service logs
make backend-logs   # Tail only backend logs
make frontend-logs  # Tail only frontend logs
make deploy      # Zero-downtime production deployment
```

### Database migrations (run inside the backend container)
```bash
# Generate a new migration, copy it out, then apply it
docker exec nusmt_backend sh -c "cd /face/app && uv run alembic revision --autogenerate -m 'describe_change'"
docker cp nusmt_backend:/face/app/migrations/versions/. ./backend/app/migrations/versions/
docker exec nusmt_backend sh -c "cd /face/app && uv run alembic upgrade head"
```

### Frontend (local dev without Docker)
```bash
cd frontend
npm install
npm run dev      # Vite dev server on :5173
npm run build    # tsc + vite build
npm run lint     # ESLint
```

### Backend (local dev without Docker)
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

## Architecture

### Services (docker-compose)
| Container | Port | Purpose |
|---|---|---|
| `nusmt_backend` | 8000 | FastAPI REST API |
| `nusmt_frontend` | 3000 | React SPA served by nginx |
| `nusmt_face_detection` | 8001 | Face-detection microservice (separate FastAPI app) |
| `database` | 5436→5432 | PostgreSQL 17 |
| `redis_cache` | 6379 | Redis (caching + queue) |
| `nusmt_grafana` | 3001 | Grafana dashboards |

In production, nginx sits in front of everything. In dev, services are exposed directly.

The backend mounts two volumes used by both services:
- `backend_uploads` → `/face/uploads` (served at `/uploads`)
- `backend_logs` → `/face/logs`

### Backend (`backend/`)
FastAPI app at `app/main.py`. All business-logic modules live under `app/modules/`, each with a consistent `model.py / schemas.py / repository.py / router.py` structure. The central router at `app/modules/router.py` includes all module routers under the `/api` prefix.

**ORM:** SQLAlchemy 2 (async) with `AsyncSession`. All models inherit from `app.core.base.Base` and compose `IdIntPk` + `TimestampMixin` mixins. Alembic migrations live at `app/migrations/versions/`. The file `app/core/models_registry.py` must import every model so Alembic can detect them.

**Config:** `app/core/config.py` exports a single `settings: AppConfig` singleton. All env vars are prefixed `APP_CONFIG__` with `__` as the nested delimiter (e.g. `APP_CONFIG__DATABASE__URL`). Always import `settings` from `app.core.config` — never access `os.environ` directly.

**Auth:** JWT-based with a single active session backed by Redis (no refresh tokens). On login, `UserService.create_session_token` issues an access token carrying a unique `jti` and stores `user:session:{user_id} → jti` in Redis. Every authenticated request is validated by `UserService.validate_session` (called from both `dependence/role_checker.py::get_current_user_id` — used by all `PermissionRequired` routes — and `get_current_user` for `/user/me`): it decodes the token, checks the `jti` matches Redis, and **slides the idle TTL** (`settings.jwt.session_idle_minutes`, default 30 min). So the real session timeout is a server-side idle window; the JWT `exp` (`access_token_expires_minutes`) is just an absolute cap. A second login from another device overwrites the `jti` and invalidates the first. `POST /user/logout` and a password change both delete the Redis key to revoke the session immediately.

The frontend stores only the `token` in `localStorage` (shared across tabs to avoid self-eviction) via `frontend/src/services/tokenStorage.ts`. The axios interceptor in `frontend/src/services/api.ts` does NOT refresh — on 401 it clears the token and redirects to `/login` (adding `?reason=session` when the 401 is a single-session eviction). A 15-min client idle timeout (`useIdleTimeout.ts`) logs out before the server window and redirects with `?idle=1`.

**File uploads:** Uploaded files are saved to `settings.file_url.upload_dir` (resolved via `settings.absolute_upload_dir`) and served as static files from `/uploads`. The upload helper is in `question/repository.py::upload_image` and `resource/repository.py` — both use `settings` for paths.

### Frontend (`frontend/`)
React 19 + Vite + TypeScript + Tailwind CSS 4. React Query (`@tanstack/react-query`) handles all server state. Forms use `react-hook-form` + Zod. Rich text editing uses `jodit-react`. HTML from the backend is sanitized with `DOMPurify` before rendering.

**API layer:** All HTTP calls go through `src/services/api.ts` (axios instance). Each domain has a service file (`src/services/psychologyService.ts`, `questionService.ts`, etc.) and a corresponding React Query hook file (`src/hooks/usePsychology.ts`, `useQuestions.ts`, etc.).

**Routing / roles:** `App.tsx` wraps routes in `<RoleRoute allowedRoles={[...]}>`. Roles in use: `admin`, `teacher`, `student`, `psixologik`, `tutor`. Dashboard redirects differ per role: `psixologik` → `/psychology`, `student` → `/quiz-test`, `teacher` → `/questions`.

**Environment:** The frontend reads two Vite env vars:
- `VITE_API_URL` (default: `/api`)
- `VITE_FACE_DETECTION_SERVICE_URL` (default: same-origin WebSocket `/v1/video/stream`)
- `VITE_ENABLE_QUIZ_PROCTORING` (default: `true`)

### Psychology module
The psychology module is a self-contained assessment system. `PsychologyMethod` groups questions; `PsychologyQuestion` uses JSONB `content` and `options` fields whose structure varies by `question_type`:

| type | content | options |
|---|---|---|
| `text` | `{text}` | `[{text, value}]` |
| `true_false` | `{text}` | null |
| `scale` | `{text, min, max, min_label?, max_label?}` | null |
| `image_stimulus` | `{image_url, text?}` | `[{text, value}]` |
| `image_choice` | `{text?}` | `[{image_url, value}]` |
| `multi_choice` | `{text, image_url?, description?}` | `[{text, value, description?}]` |

Scoring logic is in `psychology/scoring.py`. The `instruction` JSONB on `PsychologyMethod` drives scoring: `scoring.method` is `"sum"` or `"category"`. For `multi_choice`, submitted answers are `number[]`; `_coerce_int` sums the array values for scoring.

Adding a new question type requires: updating `QUESTION_TYPES` literal in `schemas.py`, adding a renderer component in `PsychologyTestPage.tsx`, registering it in `QuestionRenderer`, updating label/icon/color maps in `PsychologyPage.tsx`, and adding a display case in `AnswerRow.tsx`.

### Face detection
A separate FastAPI service in `face-detection/`. Communicates with the backend over the internal Docker network via `APP_CONFIG__FACE_SERVICE__URL`. The frontend connects to it via WebSocket during quiz proctoring (`QuizTestPage.tsx`). The backend shares the `backend_uploads` volume with this service (read-only).
