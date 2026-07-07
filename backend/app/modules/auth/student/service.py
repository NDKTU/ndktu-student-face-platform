import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Student

from .repository import student_repository
from .schemas import (
    StudentCreateRequest,
    StudentListRequest,
    StudentListResponse,
    StudentUpdateRequest,
)

logger = logging.getLogger(__name__)


class StudentService:
    async def create_student(self, session: AsyncSession, data: StudentCreateRequest) -> Student:
        return await student_repository.create_student(session, data)

    async def get_student(self, session: AsyncSession, student_id: int) -> Student:
        return await student_repository.get_student(session, student_id)

    async def list_students(
        self, session: AsyncSession, page: int, limit: int, search: str | None = None
    ) -> StudentListResponse:
        students, total = await student_repository.list_students(session, page, limit, search)
        return StudentListResponse(total=total, page=page, limit=limit, students=students)

    async def list_students_with_users(self, session: AsyncSession, request: StudentListRequest):
        return await student_repository.list_students_with_users(session, request)

    async def update_student(self, session: AsyncSession, student_id: int, data: StudentUpdateRequest) -> Student:
        return await student_repository.update_student(session, student_id, data)

    async def delete_student(self, session: AsyncSession, student_id: int) -> None:
        return await student_repository.delete_student(session, student_id)


student_service = StudentService()
