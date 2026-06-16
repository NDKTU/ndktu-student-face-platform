import logging
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.modules.group.models.group_teachers import GroupTeacher
from app.modules.resource.model import Resource
from app.modules.course.model import CourseGroup
from app.modules.course.repository import get_course_repository
from app.modules.student.model import Student
from app.modules.subject.models.subject_teacher import SubjectTeacher
from app.modules.teacher.model import Teacher
from app.modules.user.models.user import User

from .schemas import (
    ResourceCreateRequest,
    ResourceListRequest,
    ResourceListResponse,
    ResourceUpdateRequest,
)

logger = logging.getLogger(__name__)

_ALLOWED_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "pdf", "docx", "xlsx", "pptx"}
_IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp"}
_IMAGE_MAX = 5 * 1024 * 1024
_DOC_MAX = 20 * 1024 * 1024


class ResourceRepository:
    async def _is_role(self, user: User, role_name: str) -> bool:
        return any(r.name.lower() == role_name for r in user.roles)

    async def _teacher_owns_subject_teacher(self, session: AsyncSession, user_id: int, subject_teacher_id: int) -> bool:
        stmt = (
            select(SubjectTeacher.id)
            .join(Teacher, Teacher.id == SubjectTeacher.teacher_id)
            .where(
                SubjectTeacher.id == subject_teacher_id,
                Teacher.user_id == user_id,
            )
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _teacher_assigned_to_group(self, session: AsyncSession, user_id: int, group_id: int) -> bool:
        stmt = select(GroupTeacher.id).where(
            GroupTeacher.teacher_id == user_id,
            GroupTeacher.group_id == group_id,
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _save_file(self, file: UploadFile) -> tuple[str, str]:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Fayl nomi bo'sh")
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext not in _ALLOWED_EXTS:
            raise HTTPException(status_code=400, detail=f"Ruxsat etilmagan tur: .{ext}")
        content = await file.read()
        max_size = _IMAGE_MAX if ext in _IMAGE_EXTS else _DOC_MAX
        if len(content) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"Fayl {max_size // (1024 * 1024)}MB dan oshmasligi kerak",
            )
        filename = f"{uuid.uuid4()}.{ext}"
        with open(f"{settings.file_url.upload_dir}/{filename}", "wb") as buf:
            buf.write(content)
        return filename, ext

    async def upload_file(self, file: UploadFile) -> dict:
        filename, ext = await self._save_file(file)
        return {
            "url": f"{settings.file_url.http}/{filename}",
            "name": file.filename,
            "type": "image" if ext in _IMAGE_EXTS else ext,
        }

    async def upload_file_only(self, file: UploadFile) -> dict:
        filename, _ = await self._save_file(file)
        return {"url": f"{settings.file_url.http}/{filename}"}

    async def create_resource(
        self,
        session: AsyncSession,
        data: ResourceCreateRequest,
        current_user: User,
    ) -> Resource:
        is_admin = await self._is_role(current_user, "admin")
        is_teacher = await self._is_role(current_user, "teacher")

        subject_teacher_id = data.subject_teacher_id
        course_id = data.course_id
        target_group_id = data.group_id

        if course_id is not None:
            course = await get_course_repository.get_course_orm(session, course_id)
            if not is_admin and course.teacher_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Teacher is not the owner of this Course",
                )
            if target_group_id is not None:
                cg_stmt = select(CourseGroup.id).where(
                    CourseGroup.course_id == course.id, CourseGroup.group_id == target_group_id
                )
                if (await session.execute(cg_stmt)).scalar_one_or_none() is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="group_id does not belong to this Course",
                    )
            subject_teacher = await get_course_repository.get_or_create_subject_teacher_for_course(session, course)
            subject_teacher_id = subject_teacher.id
        else:
            if subject_teacher_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="subject_teacher_id is required when course_id is not provided",
                )
            st_stmt = select(SubjectTeacher).where(SubjectTeacher.id == subject_teacher_id)
            subject_teacher_obj = (await session.execute(st_stmt)).scalar_one_or_none()
            if not subject_teacher_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="SubjectTeacher not found",
                )

            if not is_admin and is_teacher:
                if not await self._teacher_owns_subject_teacher(session, current_user.id, subject_teacher_id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Teacher does not own this subject_teacher",
                    )
                if target_group_id is not None and not await self._teacher_assigned_to_group(
                    session, current_user.id, target_group_id
                ):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Teacher is not assigned to this group",
                    )

        new_resource = Resource(
            subject_teacher_id=subject_teacher_id,
            group_id=target_group_id,
            lesson_id=data.lesson_id,
            course_id=course_id,
            topic_id=data.topic_id,
            main_text=data.main_text,
            links=[link.model_dump() for link in data.links],
            files=[f.model_dump() for f in data.files],
        )
        session.add(new_resource)

        try:
            await session.commit()
            await session.refresh(new_resource)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error creating resource: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

        return await self.get_resource(session=session, resource_id=new_resource.id)

    async def get_resource(self, session: AsyncSession, resource_id: int) -> Resource:
        stmt = (
            select(Resource)
            .options(
                selectinload(Resource.subject_teacher),
                selectinload(Resource.group),
            )
            .where(Resource.id == resource_id)
        )
        result = await session.execute(stmt)
        resource = result.scalar_one_or_none()

        if not resource:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

        return resource

    async def list_resources(
        self,
        session: AsyncSession,
        request: ResourceListRequest,
        current_user: User,
    ) -> ResourceListResponse:
        stmt = select(Resource).options(
            selectinload(Resource.subject_teacher),
            selectinload(Resource.group),
        )

        is_teacher = await self._is_role(current_user, "teacher")
        is_student = await self._is_role(current_user, "student")
        role_filter = None
        student_group_id = None

        if is_student:
            student_stmt = select(Student.group_id).where(Student.user_id == current_user.id)
            student_result = await session.execute(student_stmt)
            student_group_id = student_result.scalar_one_or_none()
            if student_group_id:
                role_filter = Resource.group_id == student_group_id
            else:
                role_filter = Resource.id == -1

        elif is_teacher:
            gt_stmt = select(GroupTeacher.group_id).where(GroupTeacher.teacher_id == current_user.id)
            gt_result = await session.execute(gt_stmt)
            allowed_group_ids = gt_result.scalars().all()

            st_stmt = (
                select(SubjectTeacher.id)
                .join(Teacher, Teacher.id == SubjectTeacher.teacher_id)
                .where(Teacher.user_id == current_user.id)
            )
            st_result = await session.execute(st_stmt)
            allowed_subject_teacher_ids = st_result.scalars().all()

            conditions = []
            if allowed_group_ids:
                conditions.append(Resource.group_id.in_(allowed_group_ids))
            if allowed_subject_teacher_ids:
                conditions.append(Resource.subject_teacher_id.in_(allowed_subject_teacher_ids))

            role_filter = or_(*conditions) if conditions else (Resource.id == -1)

        if role_filter is not None:
            stmt = stmt.where(role_filter)

        if request.subject_teacher_id:
            stmt = stmt.where(Resource.subject_teacher_id == request.subject_teacher_id)
        if request.group_id:
            stmt = stmt.where(Resource.group_id == request.group_id)
        if request.lesson_id is not None:
            stmt = stmt.where(Resource.lesson_id == request.lesson_id)
        if request.course_id is not None:
            stmt = stmt.where(Resource.course_id == request.course_id)
        if request.topic_id is not None:
            stmt = stmt.where(Resource.topic_id == request.topic_id)

        stmt = stmt.order_by(desc(Resource.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        resources = result.scalars().all()

        count_stmt = select(func.count()).select_from(Resource)
        if role_filter is not None:
            count_stmt = count_stmt.where(role_filter)
        if request.subject_teacher_id:
            count_stmt = count_stmt.where(Resource.subject_teacher_id == request.subject_teacher_id)
        if request.group_id:
            count_stmt = count_stmt.where(Resource.group_id == request.group_id)
        if request.lesson_id is not None:
            count_stmt = count_stmt.where(Resource.lesson_id == request.lesson_id)
        if request.course_id is not None:
            count_stmt = count_stmt.where(Resource.course_id == request.course_id)
        if request.topic_id is not None:
            count_stmt = count_stmt.where(Resource.topic_id == request.topic_id)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return ResourceListResponse(total=total, page=request.page, limit=request.limit, resources=resources)

    async def update_resource(
        self,
        session: AsyncSession,
        resource_id: int,
        data: ResourceUpdateRequest,
        current_user: User,
    ) -> Resource:
        stmt = (
            select(Resource)
            .options(
                selectinload(Resource.subject_teacher),
                selectinload(Resource.group),
            )
            .where(Resource.id == resource_id)
        )
        result = await session.execute(stmt)
        resource = result.scalar_one_or_none()

        if not resource:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

        is_admin = await self._is_role(current_user, "admin")
        is_teacher = await self._is_role(current_user, "teacher")

        if not is_admin and is_teacher:
            if resource.course_id is not None:
                if not await get_course_repository.user_owns_course(session, resource.course_id, current_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Teacher is not the owner of this Course",
                    )
            else:
                if not await self._teacher_owns_subject_teacher(session, current_user.id, resource.subject_teacher_id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Teacher does not own this resource",
                    )
                target_group_id = data.group_id if data.group_id is not None else resource.group_id
                if target_group_id is not None and not await self._teacher_assigned_to_group(
                    session, current_user.id, target_group_id
                ):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Teacher is not assigned to this group",
                    )
                if data.subject_teacher_id is not None and not await self._teacher_owns_subject_teacher(
                    session, current_user.id, data.subject_teacher_id
                ):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Teacher does not own the target subject_teacher",
                    )

        if data.main_text is not None:
            resource.main_text = data.main_text
        if data.links is not None:
            resource.links = [link.model_dump() for link in data.links]
        if data.files is not None:
            resource.files = [f.model_dump() for f in data.files]
        if data.group_id is not None:
            resource.group_id = data.group_id
        if data.subject_teacher_id is not None:
            resource.subject_teacher_id = data.subject_teacher_id
        if data.lesson_id is not None:
            resource.lesson_id = data.lesson_id
        if data.course_id is not None:
            resource.course_id = data.course_id
        if data.topic_id is not None:
            resource.topic_id = data.topic_id

        try:
            await session.commit()
            await session.refresh(resource)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error updating resource: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

        return await self.get_resource(session=session, resource_id=resource.id)

    async def delete_resource(
        self,
        session: AsyncSession,
        resource_id: int,
        current_user: User,
    ) -> None:
        stmt = select(Resource).where(Resource.id == resource_id)
        result = await session.execute(stmt)
        resource = result.scalar_one_or_none()

        if not resource:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

        is_admin = await self._is_role(current_user, "admin")
        is_teacher = await self._is_role(current_user, "teacher")

        if not is_admin and is_teacher:
            if resource.course_id is not None:
                if not await get_course_repository.user_owns_course(session, resource.course_id, current_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Teacher is not the owner of this Course",
                    )
            elif not await self._teacher_owns_subject_teacher(session, current_user.id, resource.subject_teacher_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Teacher does not own this resource",
                )

        await session.delete(resource)
        await session.commit()


get_resource_repository = ResourceRepository()
