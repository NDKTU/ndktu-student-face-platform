from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .course.repository import get_course_repository
from .course.schemas import (
    CourseCreateRequest,
    CourseListRequest,
    CourseListResponse,
    CourseResponse,
    CourseTeacherSummaryResponse,
    CourseUpdateRequest,
)
from .homework.repository import get_homework_repository
from .homework.schemas import (
    HomeworkCreateRequest,
    HomeworkListRequest,
    HomeworkListResponse,
    HomeworkResponse,
    HomeworkUpdateRequest,
    SubmissionFile,
    SubmissionGradeRequest,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionSubmitRequest,
)
from .face_check.repository import get_face_check_repository
from .face_check.schemas import FaceCheckReportResponse, FaceCheckRequest, FaceCheckResponse
from .lesson.repository import get_lesson_repository
from .lesson.schemas import (
    LessonCreateRequest,
    LessonListRequest,
    LessonListResponse,
    LessonResponse,
    LessonUpdateRequest,
)
from .resource.repository import get_resource_repository
from .resource.schemas import (
    ResourceCreateRequest,
    ResourceListRequest,
    ResourceListResponse,
    ResourceResponse,
    ResourceUpdateRequest,
)
from .topic.repository import get_course_topic_repository
from .topic.schemas import (
    CourseTopicCreateRequest,
    CourseTopicListResponse,
    CourseTopicResponse,
    CourseTopicUpdateRequest,
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


@course_router.get("/teachers/summary", response_model=CourseTeacherSummaryResponse)
async def list_course_teacher_summaries(
    search: str | None = None,
    faculty_id: int | None = None,
    kafedra_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:course")),
):
    return await get_course_repository.list_teacher_summaries(
        session=session,
        current_user=current_user,
        restrict_to_teacher=not _is_admin(current_user),
        search=search,
        faculty_id=faculty_id,
        kafedra_id=kafedra_id,
    )


@course_router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:course")),
):
    return await get_course_repository.get_course(
        session=session,
        course_id=course_id,
        current_user=current_user,
    )


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
#  COURSE TOPIC
# ============================================================================
topic_router = APIRouter(tags=["Course Topic"], prefix="/course-topic")


@topic_router.post(
    "/",
    response_model=CourseTopicResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_course_topic(
    data: CourseTopicCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:lesson")),
):
    return await get_course_topic_repository.create_topic(session, data, current_user)


@topic_router.get("/", response_model=CourseTopicListResponse)
async def list_course_topics(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    return await get_course_topic_repository.list_topics(session, course_id, current_user)


@topic_router.put("/{topic_id}", response_model=CourseTopicResponse)
async def update_course_topic(
    topic_id: int,
    data: CourseTopicUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:lesson")),
):
    return await get_course_topic_repository.update_topic(session, topic_id, data, current_user)


@topic_router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_topic(
    topic_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:lesson")),
):
    await get_course_topic_repository.delete_topic(session, topic_id, current_user)


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
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:lesson")),
):
    await get_lesson_repository.delete_lesson(
        session=session, lesson_id=lesson_id, current_user=current_user, force=force
    )


@lesson_router.post(
    "/{lesson_id}/face-check",
    response_model=FaceCheckResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def lesson_face_check(
    lesson_id: int,
    data: FaceCheckRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    """Jonli darsda talabaning yuzini tekshiradi va natijani jurnalga yozadi."""
    return await get_face_check_repository.run_check(
        session=session, lesson_id=lesson_id, data=data, current_user=current_user
    )


@lesson_router.get("/{lesson_id}/face-checks", response_model=FaceCheckReportResponse)
async def lesson_face_check_report(
    lesson_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    return await get_face_check_repository.report(session=session, lesson_id=lesson_id, current_user=current_user)


@lesson_router.get("/face-check/{check_id}/image")
async def lesson_face_check_image(
    check_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    """Muammoli kadr. Ochiq statikada emas — har so'rovda ruxsat tekshiriladi."""
    path = await get_face_check_repository.image_path(
        session=session, check_id=check_id, current_user=current_user
    )
    return FileResponse(path, media_type="image/jpeg")


# ============================================================================
#  HOMEWORK
# ============================================================================
homework_router = APIRouter(tags=["Homework"], prefix="/homework")


@homework_router.post(
    "/",
    response_model=HomeworkResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_homework(
    data: HomeworkCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:homework")),
):
    return await get_homework_repository.create_homework(session=session, data=data, current_user=current_user)


@homework_router.get("/", response_model=HomeworkListResponse)
async def list_homeworks(
    data: HomeworkListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:homework")),
):
    return await get_homework_repository.list_homeworks(session=session, request=data, current_user=current_user)


@homework_router.get("/{homework_id}", response_model=HomeworkResponse)
async def get_homework(
    homework_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:homework")),
):
    return await get_homework_repository.get_homework(
        session=session, homework_id=homework_id, current_user=current_user
    )


@homework_router.put("/{homework_id}", response_model=HomeworkResponse)
async def update_homework(
    homework_id: int,
    data: HomeworkUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:homework")),
):
    return await get_homework_repository.update_homework(
        session=session, homework_id=homework_id, data=data, current_user=current_user
    )


@homework_router.delete("/{homework_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_homework(
    homework_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:homework")),
):
    await get_homework_repository.delete_homework(session=session, homework_id=homework_id, current_user=current_user)


# ── Submissions ────────────────────────────────────────────────────────────


@homework_router.post(
    "/{homework_id}/upload",
    response_model=SubmissionFile,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def upload_submission_file(
    homework_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:submission")),
):
    """Talaba javob faylini yuklaydi — `/resource/upload` unga yopiq."""
    return await get_homework_repository.upload_submission_file(
        session=session, homework_id=homework_id, file=file, current_user=current_user
    )


@homework_router.post(
    "/{homework_id}/submit",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def submit_homework(
    homework_id: int,
    data: SubmissionSubmitRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:submission")),
):
    return await get_homework_repository.submit(
        session=session, homework_id=homework_id, data=data, current_user=current_user
    )


@homework_router.get("/{homework_id}/my-submission", response_model=SubmissionResponse)
async def get_my_submission(
    homework_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:submission")),
):
    s = await get_homework_repository.get_my_submission(
        session=session, homework_id=homework_id, current_user=current_user
    )
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No submission yet")
    return s


@homework_router.get("/{homework_id}/submissions", response_model=SubmissionListResponse)
async def list_submissions(
    homework_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:submission")),
):
    return await get_homework_repository.list_submissions(
        session=session, homework_id=homework_id, current_user=current_user
    )


@homework_router.put(
    "/{homework_id}/submission/{user_id}/grade",
    response_model=SubmissionResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def grade_submission(
    homework_id: int,
    user_id: int,
    data: SubmissionGradeRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:submission")),
):
    return await get_homework_repository.grade_submission(
        session=session,
        homework_id=homework_id,
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
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:resource")),
):
    url = await get_resource_repository.upload_file(
        session=session, file=file, current_user=current_user
    )
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
router.include_router(topic_router)
router.include_router(lesson_router)
router.include_router(homework_router)
router.include_router(resource_router)
