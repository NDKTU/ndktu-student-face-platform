from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User
from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_course_content_repository
from .schemas import (
    CourseContentResponse,
    MaterialCreateRequest,
    MaterialResponse,
    MaterialUpdateRequest,
    ReorderRequest,
    TopicCreateRequest,
    TopicResponse,
    TopicUpdateRequest,
)

router = APIRouter(
    tags=["CourseContent"],
    prefix="/course-content",
)


@router.get("/{course_id}", response_model=CourseContentResponse)
async def get_course_content(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:course")),
):
    return await get_course_content_repository.get_content(
        session=session, course_id=course_id, user=current_user
    )


@router.post(
    "/{course_id}/topics",
    response_model=TopicResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def create_course_topic(
    course_id: int,
    data: TopicCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    return await get_course_content_repository.create_topic(
        session=session, course_id=course_id, data=data, user=current_user
    )


@router.put(
    "/topics/reorder",
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def reorder_course_topics(
    data: ReorderRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    await get_course_content_repository.reorder_topics(
        session=session, ids=data.ids, user=current_user
    )
    return {"message": "Reordered"}


@router.put(
    "/topics/{topic_id}",
    response_model=TopicResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def update_course_topic(
    topic_id: int,
    data: TopicUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    return await get_course_content_repository.update_topic(
        session=session, topic_id=topic_id, data=data, user=current_user
    )


@router.delete(
    "/topics/{topic_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def delete_course_topic(
    topic_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    await get_course_content_repository.delete_topic(
        session=session, topic_id=topic_id, user=current_user
    )


@router.post(
    "/topics/{topic_id}/materials",
    response_model=MaterialResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def create_course_material(
    topic_id: int,
    data: MaterialCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    return await get_course_content_repository.create_material(
        session=session, topic_id=topic_id, data=data, user=current_user
    )


@router.put(
    "/materials/reorder",
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def reorder_course_materials(
    data: ReorderRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    await get_course_content_repository.reorder_materials(
        session=session, ids=data.ids, user=current_user
    )
    return {"message": "Reordered"}


@router.put(
    "/materials/{material_id}/completed",
    response_model=MaterialResponse,
    dependencies=[Depends(RateLimiter(times=60, seconds=60))],
)
async def set_material_completed(
    material_id: int,
    completed: bool = True,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:course")),
):
    return await get_course_content_repository.set_completed(
        session=session, material_id=material_id, user=current_user, completed=completed
    )


@router.put(
    "/materials/{material_id}",
    response_model=MaterialResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def update_course_material(
    material_id: int,
    data: MaterialUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    return await get_course_content_repository.update_material(
        session=session, material_id=material_id, data=data, user=current_user
    )


@router.delete(
    "/materials/{material_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def delete_course_material(
    material_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:course")),
):
    await get_course_content_repository.delete_material(
        session=session, material_id=material_id, user=current_user
    )
