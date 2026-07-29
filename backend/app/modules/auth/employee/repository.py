import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.modules.auth.model import Employee, Teacher, User
from app.modules.auth.user.repository import get_user_repository
from app.modules.auth.user.schemas import UserCreateRequest

from .schemas import EmployeeCreateRequest, EmployeeListRequest, EmployeeListResponse, EmployeeUpdateRequest

logger = logging.getLogger(__name__)


class EmployeeRepository:
    @staticmethod
    def _eager_load_options():
        # Built lazily (not at class-body/import time) so this doesn't force
        # SQLAlchemy to configure all mappers before every model module has
        # been imported by the app.
        return (
            selectinload(Employee.user).selectinload(User.roles),
            selectinload(Employee.teacher),
            selectinload(Employee.department),
        )

    def _generate_full_name(self, first_name: str, last_name: str, third_name: str) -> str:
        return f"{last_name} {first_name} {third_name}"

    async def upload_image(self, file) -> str:
        import os
        import shutil
        import uuid

        file_ext = file.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_ext}"

        upload_dir = settings.profile_upload_dir
        os.makedirs(upload_dir, exist_ok=True)
        file_path = upload_dir / filename

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"{settings.file_url.http}/profile/{filename}"

    async def create_employee(self, session: AsyncSession, data: EmployeeCreateRequest) -> Employee:
        full_name = self._generate_full_name(data.first_name, data.last_name, data.third_name)

        existing = (
            await session.execute(select(Employee).where(Employee.full_name == full_name))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{full_name}' already exists",
            )

        # commit=False: the User insert is part of this same transaction, so a
        # failure creating the Employee row (e.g. duplicate full_name above is
        # already handled, but DB-level races) rolls the User insert back too.
        user = await get_user_repository.create_user(
            session=session,
            data=UserCreateRequest(username=data.username, password=data.password, roles=data.roles),
            commit=False,
        )

        new_employee = Employee(
            user_id=user.id,
            first_name=data.first_name,
            last_name=data.last_name,
            third_name=data.third_name,
            full_name=full_name,
            phone_number=data.phone_number,
            image_url=data.image_url,
            department_id=data.department_id,
        )
        # Служебная карточка и персональные данные — списком: перечислять их
        # в конструкторе значило бы забывать новое поле при каждом расширении.
        for _field in ('position_title', 'work_email', 'work_phone', 'gender', 'birth_date', 'hire_date', 'status', 'jshshir', 'passport', 'personal_phone', 'address'):
            _value = getattr(data, _field, None)
            if _value is not None:
                setattr(new_employee, _field, _value)
        session.add(new_employee)

        try:
            await session.commit()
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )

        stmt = select(Employee).options(*self._eager_load_options()).where(Employee.id == new_employee.id)
        result = await session.execute(stmt)
        return result.scalar_one()

    async def get_employee(self, session: AsyncSession, employee_id: int) -> Employee:
        stmt = select(Employee).options(*self._eager_load_options()).where(Employee.id == employee_id)
        result = await session.execute(stmt)
        employee = result.scalar_one_or_none()

        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        return employee

    async def get_employee_by_user_id(self, session: AsyncSession, user_id: int) -> Employee:
        stmt = select(Employee).options(*self._eager_load_options()).where(Employee.user_id == user_id)
        result = await session.execute(stmt)
        employee = result.scalar_one_or_none()

        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found for this user")

        return employee

    async def list_employees(self, session: AsyncSession, request: EmployeeListRequest) -> EmployeeListResponse:
        stmt = select(Employee).options(*self._eager_load_options())
        count_stmt = select(func.count()).select_from(Employee)

        if request.full_name:
            stmt = stmt.where(Employee.full_name.ilike(f"%{request.full_name}%"))
            count_stmt = count_stmt.where(Employee.full_name.ilike(f"%{request.full_name}%"))

        stmt = stmt.order_by(desc(Employee.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        employees = result.scalars().all()

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return EmployeeListResponse(total=total, page=request.page, limit=request.limit, employees=employees)

    async def update_employee(
        self, session: AsyncSession, employee_id: int, data: EmployeeUpdateRequest
    ) -> Employee:
        stmt = select(Employee).options(*self._eager_load_options()).where(Employee.id == employee_id)
        result = await session.execute(stmt)
        employee = result.scalar_one_or_none()

        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        full_name = self._generate_full_name(data.first_name, data.last_name, data.third_name)

        if full_name != employee.full_name:
            existing = (
                await session.execute(
                    select(Employee).where(Employee.full_name == full_name, Employee.id != employee_id)
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Employee name already taken",
                )


        # None означает «не трогать»: форма присылает только отредактированное.
        for _field in ('position_title', 'work_email', 'work_phone', 'gender', 'birth_date', 'hire_date', 'status', 'jshshir', 'passport', 'personal_phone', 'address'):
            _value = getattr(data, _field, None)
            if _value is not None:
                setattr(employee, _field, _value)

        employee.first_name = data.first_name
        employee.last_name = data.last_name
        employee.third_name = data.third_name
        employee.full_name = full_name
        employee.phone_number = data.phone_number
        employee.image_url = data.image_url
        employee.department_id = data.department_id

        await session.commit()
        await session.refresh(employee)
        return employee

    async def delete_employee(self, session: AsyncSession, employee_id: int, force: bool = False) -> None:
        from sqlalchemy import delete

        stmt = select(Employee).where(Employee.id == employee_id)
        result = await session.execute(stmt)
        employee = result.scalar_one_or_none()

        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        teacher = (
            await session.execute(select(Teacher).where(Teacher.employee_id == employee_id))
        ).scalar_one_or_none()

        if teacher and not force:
            raise HTTPException(
                status_code=409,
                detail={
                    "requires_confirmation": True,
                    "message": (
                        f"'{employee.full_name}' xodimini o'chirish quyidagi ma'lumotlarga ta'sir qiladi:"
                    ),
                    "warnings": ["Ushbu xodimga tegishli o'qituvchi profili o'chadi"],
                },
            )

        if teacher:
            # Reuse the Teacher module's own cascade-delete logic (Quiz/Question/
            # GroupTeacher/SubjectTeacher cleanup) before removing the Employee.
            from app.modules.auth.teacher.repository import get_teacher_repository

            await get_teacher_repository.delete_teacher(session=session, teacher_id=teacher.id, force=True)

        await session.execute(delete(Employee).where(Employee.id == employee_id))
        await session.commit()


get_employee_repository = EmployeeRepository()
