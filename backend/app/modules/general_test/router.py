"""Elementar test: управление (admin) и прохождение (назначенные пользователи).

Права:
- `create/read/update/delete:general_test_subject` — сам предмет: создание,
  переименование, удаление и назначение на него пользователей;
- `create/read/update/delete:general_test_question` — банк вопросов предмета.
  Отделено от прав на предмет намеренно: преподаватель наполняет чужой
  предмет вопросами, но не переименовывает его, не удаляет и не меняет
  список допущенных. Пока это было одним правом `update:general_test_subject`,
  второе нельзя было дать без первого;
- `create/read/update/delete:general_test` — тесты и их группы;
- `read/delete:general_test_result` — сводная таблица результатов;
- `general_test:take` — пройти тест и увидеть свои результаты. Миграция
  `b7e1c4a9d2f3` выдаёт его всем существующим ролям, а `core/lifespan/defaults.py`
  — teacher и student на чистой базе. Какие тесты видны — решает назначение
  (fan или группа), а не право: см. `model.py`.
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
    FilterOptionsResponse,
    GeneralTestCreateRequest,
    GeneralTestDetail,
    GeneralTestListResponse,
    GeneralTestUpdateRequest,
    GroupOptionListResponse,
    MyResultListResponse,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
    ResultListRequest,
    ResultListResponse,
    SubjectCreateRequest,
    SubjectQuestionListResponse,
    SubjectListResponse,
    SubjectSummary,
    SubjectUpdateRequest,
    SubjectUserListResponse,
    SubjectUsersAddRequest,
    SubjectUsersAddResponse,
    TestGroupsAddRequest,
    TestGroupUpdateRequest,
    UploadResponse,
    UserListRequest,
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
    user: "User" = Depends(PermissionRequired("read:general_test_result")),
):
    return await repo.list_results(session=session, request=request, user=user)


@router.get("/results/export")
async def export_results(
    request: ResultListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("read:general_test_result")),
):
    content = await repo.export_results(session=session, request=request, user=user)
    return StreamingResponse(
        io.BytesIO(content),
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="elementar-test-natijalari.xlsx"'},
    )


@router.delete("/results/{attempt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_result(
    attempt_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("delete:general_test_result")),
):
    await repo.delete_result(session=session, attempt_id=attempt_id, user=user)


# ─── Fanlar ──────────────────────────────────────────────────────────────────


@router.get("/subject", response_model=SubjectListResponse)
async def list_subjects(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    search: str | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("read:general_test_subject")),
):
    return await repo.list_subjects(session=session, page=page, limit=limit, search=search, user=user)


@router.post("/subject", response_model=SubjectSummary, status_code=status.HTTP_201_CREATED)
async def create_subject(
    data: SubjectCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("create:general_test_subject")),
):
    return await repo.create_subject(session=session, data=data, user=user)


@router.get("/subject/filter-options", response_model=FilterOptionsResponse)
async def subject_filter_options(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:general_test_subject")),
):
    return await repo.filter_options(session=session)


@router.get("/subject/{subject_id}", response_model=SubjectSummary)
async def get_subject(
    subject_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("read:general_test_subject")),
):
    return await repo.get_subject(session=session, subject_id=subject_id, user=user)


@router.put("/subject/{subject_id}", response_model=SubjectSummary)
async def update_subject(
    subject_id: int,
    data: SubjectUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test_subject")),
):
    return await repo.update_subject(session=session, subject_id=subject_id, data=data, user=user)


@router.delete("/subject/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    subject_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("delete:general_test_subject")),
):
    await repo.delete_subject(session=session, subject_id=subject_id, user=user)


@router.get("/subject/{subject_id}/users", response_model=SubjectUserListResponse)
async def list_subject_users(
    subject_id: int,
    request: UserListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("read:general_test_subject")),
):
    return await repo.list_subject_users(session=session, subject_id=subject_id, request=request, user=user)


@router.get("/subject/{subject_id}/candidates", response_model=SubjectUserListResponse)
async def list_subject_candidates(
    subject_id: int,
    request: UserListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test_subject")),
):
    return await repo.list_candidates(session=session, subject_id=subject_id, request=request, user=user)


@router.post("/subject/{subject_id}/users", response_model=SubjectUsersAddResponse)
async def add_subject_users(
    subject_id: int,
    data: SubjectUsersAddRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test_subject")),
):
    return await repo.add_subject_users(session=session, subject_id=subject_id, data=data, user=user)


@router.delete("/subject/{subject_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_user(
    subject_id: int,
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test_subject")),
):
    await repo.remove_subject_user(session=session, subject_id=subject_id, user_id=user_id, user=user)


# ─── Guruhlar ────────────────────────────────────────────────────────────────


@router.get("/group-options", response_model=GroupOptionListResponse)
async def group_options(
    search: str | None = None,
    faculty_id: int | None = None,
    course: int | None = Query(None, ge=1, le=7),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.group_options(session=session, search=search, faculty_id=faculty_id, course=course, limit=limit)


@router.post("/{test_id}/groups", response_model=GeneralTestDetail)
async def add_test_groups(
    test_id: int,
    data: TestGroupsAddRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.add_test_groups(session=session, test_id=test_id, data=data, user=user)


@router.patch("/{test_id}/groups/{group_id}", response_model=GeneralTestDetail)
async def set_test_group_active(
    test_id: int,
    group_id: int,
    data: TestGroupUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test")),
):
    """Guruh uchun testni yoqish yoki yashirish."""
    return await repo.set_test_group_active(session=session, test_id=test_id, group_id=group_id, data=data, user=user)


@router.delete("/{test_id}/groups/{group_id}", response_model=GeneralTestDetail)
async def remove_test_group(
    test_id: int,
    group_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.remove_test_group(session=session, test_id=test_id, group_id=group_id, user=user)


# ─── Вопросы (банк fan'а) ────────────────────────────────────────────────────


@router.get("/excel_template")
async def excel_template(_: "User" = Depends(PermissionRequired("create:general_test_question"))):
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
    user: "User" = Depends(PermissionRequired("update:general_test_question")),
):
    return await repo.update_question(session=session, question_id=question_id, data=data, user=user)


@router.delete("/question/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("delete:general_test_question")),
):
    await repo.delete_question(session=session, question_id=question_id, user=user)


@router.get("/subject/{subject_id}/questions", response_model=SubjectQuestionListResponse)
async def list_subject_questions(
    subject_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("read:general_test_question")),
):
    return await repo.list_subject_questions(session=session, subject_id=subject_id, user=user)


@router.post(
    "/subject/{subject_id}/question", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED
)
async def create_question(
    subject_id: int,
    data: QuestionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("create:general_test_question")),
):
    return await repo.create_question(session=session, subject_id=subject_id, data=data, user=user)


@router.post(
    "/question/upload_image",
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def upload_question_image(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:general_test_question")),
):
    """Savol matni yoki variantidagi rasm — kurs savollari bilan bir papkada.

    Kursdagi `/question/upload_image` `create:question` ruxsatini so'raydi,
    elementar test fanini yurituvchida esa u bo'lmasligi mumkin.
    """
    url = await get_question_repository.upload_image(session=session, file=file, current_user=current_user)
    return {"url": url}


@router.post(
    "/subject/{subject_id}/upload_excel",
    response_model=UploadResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def upload_excel(
    subject_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("create:general_test_question")),
):
    return await repo.upload_questions_excel(session=session, subject_id=subject_id, file=file, user=user)


# ─── Тесты ───────────────────────────────────────────────────────────────────


@router.get("/", response_model=GeneralTestListResponse)
async def list_tests(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    search: str | None = None,
    subject_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("read:general_test")),
):
    return await repo.list_tests(session=session, page=page, limit=limit, search=search, subject_id=subject_id, user=user)


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
    user: "User" = Depends(PermissionRequired("read:general_test")),
):
    return await repo.get_test(session=session, test_id=test_id, user=user)


@router.put("/{test_id}", response_model=GeneralTestDetail)
async def update_test(
    test_id: int,
    data: GeneralTestUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("update:general_test")),
):
    return await repo.update_test(session=session, test_id=test_id, data=data, user=user)


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test(
    test_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: "User" = Depends(PermissionRequired("delete:general_test")),
):
    await repo.delete_test(session=session, test_id=test_id, user=user)
