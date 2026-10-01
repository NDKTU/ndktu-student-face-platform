"""Общий тест: управление (admin) и прохождение (любой пользователь).

Права:
- `create/read/update/delete:general_test` — тесты и их вопросы;
- `read/delete:general_test_result` — сводная таблица результатов;
- `general_test:take` — пройти тест и увидеть свои результаты. Миграция
  `b7e1c4a9d2f3` выдаёт его всем существующим ролям, а `core/lifespan/defaults.py`
  — teacher и student на чистой базе.
"""

from __future__ import annotations

import io
from typing import TYPE_CHECKING

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.quiz.question.repository import get_question_repository

from .repository import get_general_test_repository as repo
from .schemas import (
    AnswerRequest,
    AttemptResult,
    AttemptState,
    AvailableTestListResponse,
    GeneralTestCreateRequest,
    GeneralTestDetail,
    GeneralTestListResponse,
    GeneralTestUpdateRequest,
    MyResultListResponse,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
    ResultListRequest,
    ResultListResponse,
    UploadResponse,
)

if TYPE_CHECKING:
    from app.modules.auth.model import User

router = APIRouter(prefix="/general-test", tags=["General test"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_take = PermissionRequired("general_test:take")


# ─── Прохождение ─────────────────────────────────────────────────────────────
# Статические пути — до `/{test_id}`, иначе FastAPI попытается разобрать
# «available» как число и вернёт 422.


@router.get("/available", response_model=AvailableTestListResponse)
async def list_available(
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(_take),
):
    return await repo.list_available(session=session, user=user)


@router.get("/my-results", response_model=MyResultListResponse)
async def my_results(
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(_take),
):
    return await repo.my_results(session=session, user=user)


@router.post(
    "/{test_id}/start",
    response_model=AttemptState,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def start(
    test_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(_take),
):
    return await repo.start(session=session, test_id=test_id, user=user)


@router.get("/attempt/{attempt_id}", response_model=AttemptState)
async def get_attempt(
    attempt_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(_take),
):
    return await repo.get_state(session=session, attempt_id=attempt_id, user=user)


@router.post(
    "/attempt/{attempt_id}/answer",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=240, seconds=60))],
)
async def answer(
    attempt_id: int,
    data: AnswerRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(_take),
):
    await repo.answer(session=session, attempt_id=attempt_id, data=data, user=user)


@router.post("/attempt/{attempt_id}/finish", response_model=AttemptResult)
async def finish(
    attempt_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(_take),
):
    return await repo.finish(session=session, attempt_id=attempt_id, user=user)


# ─── Результаты (администратор) ──────────────────────────────────────────────


@router.get("/results", response_model=ResultListResponse)
async def list_results(
    request: ResultListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:general_test_result")),
):
    return await repo.list_results(session=session, request=request)


@router.get("/results/export")
async def export_results(
    request: ResultListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:general_test_result")),
):
    content = await repo.export_results(session=session, request=request)
    return StreamingResponse(
        io.BytesIO(content),
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="umumiy-test-natijalari.xlsx"'},
    )


@router.delete("/results/{attempt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_result(
    attempt_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("delete:general_test_result")),
):
    await repo.delete_result(session=session, attempt_id=attempt_id)


# ─── Вопросы ─────────────────────────────────────────────────────────────────


@router.get("/excel_template")
async def excel_template(_: "User" = Depends(PermissionRequired("create:general_test"))):
    # Шаблон общий с банком вопросов: формат один, парсер один.
    return StreamingResponse(
        io.BytesIO(get_question_repository.build_excel_template()),
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="savollar-shablon.xlsx"'},
    )


@router.put("/question/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: int,
    data: QuestionUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.update_question(session=session, question_id=question_id, data=data)


@router.delete("/question/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:general_test")),
):
    await repo.delete_question(session=session, question_id=question_id)


@router.post("/{test_id}/question", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    test_id: int,
    data: QuestionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.create_question(session=session, test_id=test_id, data=data)


@router.post(
    "/{test_id}/upload_excel",
    response_model=UploadResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def upload_excel(
    test_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.upload_questions_excel(session=session, test_id=test_id, file=file)


# ─── Тесты ───────────────────────────────────────────────────────────────────


@router.get("/", response_model=GeneralTestListResponse)
async def list_tests(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    search: str | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:general_test")),
):
    return await repo.list_tests(session=session, page=page, limit=limit, search=search)


@router.post("/", response_model=GeneralTestDetail, status_code=status.HTTP_201_CREATED)
async def create_test(
    data: GeneralTestCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("create:general_test")),
):
    return await repo.create_test(session=session, data=data, user=user)


@router.get("/{test_id}", response_model=GeneralTestDetail)
async def get_test(
    test_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:general_test")),
):
    return await repo.get_test(session=session, test_id=test_id)


@router.put("/{test_id}", response_model=GeneralTestDetail)
async def update_test(
    test_id: int,
    data: GeneralTestUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.update_test(session=session, test_id=test_id, data=data)


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test(
    test_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("delete:general_test")),
):
    await repo.delete_test(session=session, test_id=test_id)
