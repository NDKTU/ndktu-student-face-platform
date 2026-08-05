import logging

from core.config import settings
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.roles import is_admin as user_is_admin
from app.core.utils.upload import DOC_LIMITS, IMAGE_LIMITS, VIDEO_LIMITS, save_upload
from app.modules.course.model import Course, Lesson, Resource
from app.modules.auth.model import User

from .schemas import ResourceCreateRequest, ResourceListRequest, ResourceListResponse, ResourceUpdateRequest

logger = logging.getLogger(__name__)

# Материалы курса — это и картинки, и раздатка, и видеоуроки, поэтому здесь
# разрешены все три группы. Лимит берётся по расширению, так что 150 МБ
# доступны только видео: `.pptx` по-прежнему обрывается на 20 МБ.
COURSE_UPLOAD_LIMITS = {**IMAGE_LIMITS, **DOC_LIMITS, **VIDEO_LIMITS}


class ResourceRepository:
    def _eager_load_options(self):
        return (selectinload(Resource.lesson), selectinload(Resource.course))

    async def _resolve_course_id(self, session: AsyncSession, data_course_id: int | None, lesson_id: int | None) -> int:
        if data_course_id is not None:
            return data_course_id
        lesson = (await session.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
        if not lesson:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        return lesson.course_id

    async def _check_access(self, session: AsyncSession, course_id: int, user: User) -> None:
        course = (await session.execute(select(Course).where(Course.id == course_id))).scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        is_admin = user_is_admin(user)
        if not is_admin and course.teacher_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Course owner or admin can manage resources",
            )

    async def upload_file(self, file: UploadFile) -> str:
        return await save_upload(
            file,
            settings.course_resource_upload_dir,
            "course_resources",
            COURSE_UPLOAD_LIMITS,
        )

    async def create_resource(
        self, session: AsyncSession, data: ResourceCreateRequest, current_user: User
    ) -> Resource:
        course_id = await self._resolve_course_id(session, data.course_id, data.lesson_id)
        await self._check_access(session, course_id, current_user)

        resource = Resource(
            lesson_id=data.lesson_id,
            course_id=data.course_id,
            resource_type=data.resource_type,
            title=data.title,
            file_url=data.file_url,
            link_url=data.link_url,
            text_content=data.text_content,
            order_index=data.order_index,
            created_by_user_id=current_user.id,
        )
        session.add(resource)
        await session.commit()

        stmt = select(Resource).options(*self._eager_load_options()).where(Resource.id == resource.id)
        return (await session.execute(stmt)).scalar_one()

    async def get_resource(self, session: AsyncSession, resource_id: int) -> Resource:
        stmt = select(Resource).options(*self._eager_load_options()).where(Resource.id == resource_id)
        resource = (await session.execute(stmt)).scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
        return resource

    async def list_resources(self, session: AsyncSession, request: ResourceListRequest) -> ResourceListResponse:
        stmt = select(Resource).options(*self._eager_load_options())
        count_stmt = select(func.count()).select_from(Resource)

        if request.lesson_id is not None:
            stmt = stmt.where(Resource.lesson_id == request.lesson_id)
            count_stmt = count_stmt.where(Resource.lesson_id == request.lesson_id)
        if request.course_id is not None:
            stmt = stmt.where(Resource.course_id == request.course_id)
            count_stmt = count_stmt.where(Resource.course_id == request.course_id)

        stmt = stmt.order_by(Resource.order_index).offset(request.offset).limit(request.limit)

        resources = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return ResourceListResponse(total=total, page=request.page, limit=request.limit, resources=resources)

    async def update_resource(
        self, session: AsyncSession, resource_id: int, data: ResourceUpdateRequest, current_user: User
    ) -> Resource:
        resource = await self.get_resource(session, resource_id)
        course_id = await self._resolve_course_id(session, resource.course_id, resource.lesson_id)
        await self._check_access(session, course_id, current_user)

        if data.title is not None:
            resource.title = data.title
        if data.file_url is not None:
            resource.file_url = data.file_url
        if data.link_url is not None:
            resource.link_url = data.link_url
        if data.text_content is not None:
            resource.text_content = data.text_content
        if data.order_index is not None:
            resource.order_index = data.order_index

        await session.commit()
        await session.refresh(resource)
        return await self.get_resource(session, resource.id)

    async def delete_resource(self, session: AsyncSession, resource_id: int, current_user: User) -> None:
        resource = await self.get_resource(session, resource_id)
        course_id = await self._resolve_course_id(session, resource.course_id, resource.lesson_id)
        await self._check_access(session, course_id, current_user)

        await session.delete(resource)
        await session.commit()


get_resource_repository = ResourceRepository()
