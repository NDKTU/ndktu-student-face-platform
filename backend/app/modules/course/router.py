from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .course.repository import get_course_repository
from .course.schemas import (
    CourseCreateRequest,
    CourseListRequest,
    CourseListResponse,
    CourseResponse,
    CourseUpdateRequest,
)
from .lesson.repository import get_lesson_repository
from .lesson.schemas import (
    LessonCreateRequest,
    LessonListRequest,
    LessonListResponse,
    LessonResponse,
    LessonResultListResponse,
    LessonResultsBulkUpsertRequest,
    LessonUpdateRequest,
)
from .assignment.repository import get_assignment_repository
from .assignment.schemas import (
    AssignmentCreateRequest,
    AssignmentListRequest,
    AssignmentListResponse,
    AssignmentResponse,
    AssignmentUpdateRequest,
    SubmissionGradeRequest,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionSubmitRequest,
)
from .resource.repository import get_resource_repository
from .resource.schemas import (
    ResourceCreateRequest,
    ResourceListRequest,
    ResourceListResponse,
    ResourceResponse,
    ResourceUpdateRequest,
)

if TYPE_CHECKING:
    from app.modules.auth.model import User

logger = logging.getLogger(__name__)


def _is_admin(user: "User") -> bool:
    return any(r.name.lower() == "admin" for r in (user.roles or []))


# ============================================================================
#  COURSE
# ============================================================================
course_router = APIRouter(
    tags=["Course"],
    prefix="/course",
)


@course_router.post(
    "/",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_course(
    data: CourseCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("create:course")),
):
    return await get_course_repository.create_course(session=session, data=data)


@course_router.get("/", response_model=CourseListResponse)
async def list_courses(
    data: CourseListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:course")),
):
    restrict = not _is_admin(current_user)
    return await get_course_repository.list_courses(
        session=session,
        request=data,
        current_user=current_user,
        restrict_to_teacher=restrict,
    )


@course_router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:course")),
):
    return await get_course_repository.get_course(session=session, course_id=course_id)


@course_router.put(
    "/{course_id}",
    response_model=CourseResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_course(
    course_id: int,
    data: CourseUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:course")),
):
    return await get_course_repository.update_course(session=session, course_id=course_id, data=data)


@course_router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_course(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("delete:course")),
):
    await get_course_repository.delete_course(session=session, course_id=course_id)


# ============================================================================
#  LESSON
# ============================================================================
lesson_router = APIRouter(
    tags=["Lesson"],
    prefix="/lesson",
)


@lesson_router.post(
    "/",
    response_model=LessonResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_lesson(
    data: LessonCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:lesson")),
):
    return await get_lesson_repository.create_lesson(session=session, data=data, current_user=current_user)


@lesson_router.get("/", response_model=LessonListResponse)
async def list_lessons(
    data: LessonListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    return await get_lesson_repository.list_lessons(session=session, request=data, current_user=current_user)


@lesson_router.get("/{lesson_id}", response_model=LessonResponse)
async def get_lesson(
    lesson_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:lesson")),
):
    return await get_lesson_repository.get_lesson(session=session, lesson_id=lesson_id)


@lesson_router.put(
    "/{lesson_id}",
    response_model=LessonResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_lesson(
    lesson_id: int,
    data: LessonUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:lesson")),
):
    return await get_lesson_repository.update_lesson(
        session=session, lesson_id=lesson_id, data=data, current_user=current_user
    )


@lesson_router.delete(
    "/{lesson_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_lesson(
    lesson_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:lesson")),
):
    await get_lesson_repository.delete_lesson(session=session, lesson_id=lesson_id, current_user=current_user)


# ── Lesson results ──────────────────────────────────────────────────────────


@lesson_router.get(
    "/{lesson_id}/results",
    response_model=LessonResultListResponse,
)
async def list_lesson_results(
    lesson_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    return await get_lesson_repository.list_lesson_results(
        session=session, lesson_id=lesson_id, current_user=current_user
    )


@lesson_router.put(
    "/{lesson_id}/results",
    response_model=LessonResultListResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def upsert_lesson_results(
    lesson_id: int,
    data: LessonResultsBulkUpsertRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:lesson_result")),
):
    return await get_lesson_repository.upsert_lesson_results(
        session=session,
        lesson_id=lesson_id,
        data=data,
        current_user=current_user,
    )


# ============================================================================
#  ASSIGNMENT
# ============================================================================
assignment_router = APIRouter(tags=["Assignment"], prefix="/assignment")


@assignment_router.post(
    "/",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_assignment(
    data: AssignmentCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:assignment")),
):
    return await get_assignment_repository.create_assignment(session=session, data=data, current_user=current_user)


@assignment_router.get("/", response_model=AssignmentListResponse)
async def list_assignments(
    data: AssignmentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:assignment")),
):
    return await get_assignment_repository.list_assignments(session=session, request=data, current_user=current_user)


@assignment_router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:assignment")),
):
    return await get_assignment_repository.get_assignment(
        session=session, assignment_id=assignment_id, current_user=current_user
    )


@assignment_router.put("/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: int,
    data: AssignmentUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:assignment")),
):
    return await get_assignment_repository.update_assignment(
        session=session, assignment_id=assignment_id, data=data, current_user=current_user
    )


@assignment_router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:assignment")),
):
    await get_assignment_repository.delete_assignment(
        session=session, assignment_id=assignment_id, current_user=current_user
    )


# ── Submissions ────────────────────────────────────────────────────────────


@assignment_router.post(
    "/{assignment_id}/submit",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def submit_assignment(
    assignment_id: int,
    data: SubmissionSubmitRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:submission")),
):
    return await get_assignment_repository.submit(
        session=session, assignment_id=assignment_id, data=data, current_user=current_user
    )


@assignment_router.get("/{assignment_id}/my-submission", response_model=SubmissionResponse)
async def get_my_submission(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:submission")),
):
    s = await get_assignment_repository.get_my_submission(
        session=session, assignment_id=assignment_id, current_user=current_user
    )
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No submission yet")
    return s


@assignment_router.get("/{assignment_id}/submissions", response_model=SubmissionListResponse)
async def list_submissions(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:submission")),
):
    return await get_assignment_repository.list_submissions(
        session=session, assignment_id=assignment_id, current_user=current_user
    )


@assignment_router.put(
    "/{assignment_id}/submission/{user_id}/grade",
    response_model=SubmissionResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def grade_submission(
    assignment_id: int,
    user_id: int,
    data: SubmissionGradeRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:submission")),
):
    return await get_assignment_repository.grade_submission(
        session=session,
        assignment_id=assignment_id,
        user_id=user_id,
        data=data,
        current_user=current_user,
    )


# ============================================================================
#  RESOURCE
# ============================================================================
resource_router = APIRouter(
    tags=["Resource"],
    prefix="/resource",
)


@resource_router.post(
    "/",
    response_model=ResourceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_resource(
    data: ResourceCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:resource")),
):
    return await get_resource_repository.create_resource(session=session, data=data, current_user=current_user)


@resource_router.get("/", response_model=ResourceListResponse)
async def list_resources(
    data: ResourceListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:resource")),
):
    return await get_resource_repository.list_resources(session=session, request=data)


@resource_router.post(
    "/upload",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def upload_resource_file(
    file: UploadFile = File(...),
    _: "User" = Depends(PermissionRequired("create:resource")),
):
    url = await get_resource_repository.upload_file(file=file)
    return {"url": url}


@resource_router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:resource")),
):
    return await get_resource_repository.get_resource(session=session, resource_id=resource_id)


@resource_router.put(
    "/{resource_id}",
    response_model=ResourceResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def update_resource(
    resource_id: int,
    data: ResourceUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:resource")),
):
    return await get_resource_repository.update_resource(
        session=session, resource_id=resource_id, data=data, current_user=current_user
    )


@resource_router.delete(
    "/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def delete_resource(
    resource_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:resource")),
):
    await get_resource_repository.delete_resource(session=session, resource_id=resource_id, current_user=current_user)


# ============================================================================
#  AGGREGATE ROUTER
# ============================================================================
router = APIRouter()
router.include_router(course_router)
router.include_router(lesson_router)
router.include_router(assignment_router)
router.include_router(resource_router)
