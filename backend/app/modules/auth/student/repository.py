import logging
from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.student.model import Student

from .schemas import (
    StudentCreateRequest,
    StudentListRequest,
    StudentListResponse,
    StudentUpdateRequest,
    StudentWithUserListResponse,
)

logger = logging.getLogger(__name__)

# Справочники HEMIS: код → каноническое значение, которое хранит наша база.
#
# Держим их здесь, а не в конфиге: это часть контракта с чужим API, и менять
# их приходится вместе с кодом, который их читает. Коды взяты из ответа
# /me — они уникальны только внутри своего справочника.
HEMIS_DICTIONARIES: dict[str, dict[str, str]] = {
    "gender": {"11": "Erkak", "12": "Ayol"},
    "studentStatus": {"11": "O'qimoqda", "12": "Akademik ta'tilda", "13": "Chetlashtirilgan"},
    "educationType": {"11": "Bakalavr", "12": "Magistr"},
    "paymentForm": {"11": "Davlat granti", "12": "To'lov-shartnoma"},
    "educationLang": {"11": "O'zbek", "12": "Rus", "13": "Ingliz"},
}


class StudentRepository:
    async def create_student(self, session: AsyncSession, data: StudentCreateRequest) -> Student:
        stmt = select(Student).where(Student.student_id_number == data.student_id_number)
        result = await session.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student with this ID number already exists",
            )

        new_student = Student(**data.model_dump())
        session.add(new_student)
        await session.commit()
        await session.refresh(new_student)
        return new_student

    async def get_student(self, session: AsyncSession, student_id: int) -> Student:
        stmt = (
            select(Student)
            .where(Student.id == student_id)
            .options(selectinload(Student.user), selectinload(Student.group))
        )
        result = await session.execute(stmt)
        student = result.scalar_one_or_none()

        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        return student

    async def list_students(self, session: AsyncSession, request: StudentListRequest) -> StudentListResponse:
        stmt = select(Student).options(selectinload(Student.user), selectinload(Student.group))

        if request.search:
            stmt = stmt.where(
                (Student.first_name.ilike(f"%{request.search}%"))
                | (Student.last_name.ilike(f"%{request.search}%"))
                | (Student.student_id_number.ilike(f"%{request.search}%"))
            )

        if request.user_id is not None:
            stmt = stmt.where(Student.user_id == request.user_id)

        if request.group_id is not None:
            stmt = stmt.where(Student.group_id == request.group_id)

        stmt = stmt.order_by(desc(Student.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        students = result.scalars().all()

        count_stmt = select(func.count()).select_from(Student)
        if request.search:
            count_stmt = count_stmt.where(
                (Student.first_name.ilike(f"%{request.search}%"))
                | (Student.last_name.ilike(f"%{request.search}%"))
                | (Student.student_id_number.ilike(f"%{request.search}%"))
            )

        if request.user_id is not None:
            count_stmt = count_stmt.where(Student.user_id == request.user_id)

        if request.group_id is not None:
            count_stmt = count_stmt.where(Student.group_id == request.group_id)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return StudentListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            students=students,
        )

    async def list_students_with_users(
        self, session: AsyncSession, request: StudentListRequest
    ) -> StudentWithUserListResponse:
        from app.modules.auth.user.model import User

        # Query students that have a user_id and filter by student role
        stmt = (
            select(Student)
            .join(User, Student.user_id == User.id)
            .options(selectinload(Student.user), selectinload(Student.group))
            .where(Student.user_id.isnot(None))
        )

        # Filter by search (name, username, or student_id_number)
        if request.search:
            stmt = stmt.where(
                (Student.first_name.ilike(f"%{request.search}%"))
                | (Student.last_name.ilike(f"%{request.search}%"))
                | (Student.student_id_number.ilike(f"%{request.search}%"))
                | (User.username.ilike(f"%{request.search}%"))
            )

        if request.group_id is not None:
            stmt = stmt.where(Student.group_id == request.group_id)

        stmt = stmt.order_by(desc(Student.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        students = result.scalars().all()

        # Convert to response format
        students_with_users = []
        for student in students:
            students_with_users.append(
                {
                    "student_id": student.id,
                    "user_id": student.user_id,
                    "username": student.user.username if student.user else None,
                    # is_active тут не отдаём: такого поля у User нет и не было —
                    # обращение к нему роняло весь эндпоинт AttributeError'ом.
                    "first_name": student.first_name,
                    "last_name": student.last_name,
                    "full_name": student.full_name,
                    "student_id_number": student.student_id_number,
                    "phone": student.phone,
                    "gender": student.gender,
                    "faculty": student.faculty,
                    "level": student.level,
                    "semester": student.semester,
                    "specialty": student.specialty,
                    "student_status": student.student_status,
                    "avg_gpa": student.avg_gpa,
                    "group_id": student.group_id,
                    "created_at": student.created_at,
                    "updated_at": student.updated_at,
                }
            )

        # Count total students with users matching filters
        count_stmt = (
            select(func.count())
            .select_from(Student)
            .join(User, Student.user_id == User.id)
            .where(Student.user_id.isnot(None))
        )

        if request.search:
            count_stmt = count_stmt.where(
                (Student.first_name.ilike(f"%{request.search}%"))
                | (Student.last_name.ilike(f"%{request.search}%"))
                | (Student.student_id_number.ilike(f"%{request.search}%"))
                | (User.username.ilike(f"%{request.search}%"))
            )

        if request.group_id is not None:
            count_stmt = count_stmt.where(Student.group_id == request.group_id)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return StudentWithUserListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            students=students_with_users,
        )

    async def update_student(self, session: AsyncSession, student_id: int, data: StudentUpdateRequest) -> Student:
        student = await self.get_student(session, student_id)

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(student, key, value)

        await session.commit()
        await session.refresh(student)
        return student

    async def delete_student(self, session: AsyncSession, student_id: int, force: bool = False) -> None:
        from sqlalchemy import delete

        from app.modules.quiz.result.model import Result

        student = await self.get_student(session, student_id)

        if not force:
            result_count = (
                await session.execute(select(func.count(Result.id)).where(Result.user_id == student.user_id))
            ).scalar() or 0
            if result_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu talabani o'chirish quyidagi bog'langan ma'lumotlarga ta'sir qiladi:",
                        "warnings": [f"{result_count} ta talaba natijalari (ballari) o'chadi"],
                    },
                )

        # Aggressive delete results
        await session.execute(delete(Result).where(Result.user_id == student.user_id))

        await session.delete(student)
        await session.commit()

    async def get_id_by_user_id(self, session: AsyncSession, user_id: int) -> int | None:
        stmt = select(Student.id).where(Student.user_id == user_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def upsert_for_hemis(
        self,
        session: AsyncSession,
        user_id: int,
        group_id: int,
        faculty_name: str,
        me_data: dict,
    ) -> Student:
        def _extract(data, dictionary: str | None = None) -> str:
            """Значение справочника HEMIS.

            HEMIS отдаёт их парой — `{"code": "11", "name": "Kunduzgi"}`.
            Сопоставляем по `code`: коды стабильны, названия — нет. В них,
            вдобавок, типографский апостроф U+2018 («O‘qimoqda»), и сравнение
            строк молча промахивается.

            Коды уникальны только внутри своего справочника: "11" — это Erkak
            в gender, Bakalavr в educationType и Kunduzgi в educationForm,
            поэтому таблица у каждого своя.

            Незнакомый код не роняет синхронизацию: берём присланное имя и
            пишем предупреждение — иначе один новый пункт в справочнике HEMIS
            закрыл бы вход всем студентам.
            """
            if not isinstance(data, dict):
                return data if isinstance(data, str) else ""

            name = data.get("name", "")
            code = str(data.get("code", "")) if data.get("code") is not None else ""
            if not dictionary or not code:
                return name

            table = HEMIS_DICTIONARIES.get(dictionary, {})
            known = table.get(code)
            if known is None:
                logger.warning(
                    "HEMIS: неизвестный код %r в справочнике %r (name=%r) — берём name как есть",
                    code, dictionary, name,
                )
                return name
            return known

        birth_ts = me_data.get("birth_date", 0)
        try:
            birth_date = datetime.fromtimestamp(birth_ts).date() if birth_ts else date(1970, 1, 1)
        except (OSError, OverflowError, ValueError):
            birth_date = date(1970, 1, 1)

        full_name = me_data.get("full_name", "")
        parts = full_name.split()
        fields = {
            "full_name": full_name,
            "first_name": parts[1] if len(parts) > 1 else "",
            "last_name": parts[0] if parts else "",
            "third_name": " ".join(parts[2:]) if len(parts) > 2 else "",
            "student_id_number": me_data.get("student_id_number", ""),
            "image_path": me_data.get("image", ""),
            "birth_date": birth_date,
            "phone": me_data.get("phone", ""),
            "gender": _extract(me_data.get("gender"), "gender"),
            "university": me_data.get("university", ""),
            "specialty": _extract(me_data.get("specialty")),
            "student_status": _extract(me_data.get("studentStatus"), "studentStatus"),
            # education_form не пишем: форма обучения живёт на группе. HEMIS
            # присылает её на студенте, но это особенность их API — держать
            # рядом второе значение значило бы дать им разойтись.
            "education_type": _extract(me_data.get("educationType"), "educationType"),
            "payment_form": _extract(me_data.get("paymentForm"), "paymentForm"),
            "education_lang": _extract(me_data.get("educationLang"), "educationLang"),
            "faculty": faculty_name,
            "level": _extract(me_data.get("level")),
            "semester": _extract(me_data.get("semester")),
            "address": me_data.get("address", ""),
            "group_id": group_id,
        }

        stmt = select(Student).where(Student.user_id == user_id)
        student = (await session.execute(stmt)).scalar_one_or_none()
        if not student:
            student = Student(user_id=user_id, avg_gpa=0.0, **fields)
            session.add(student)
        else:
            for k, v in fields.items():
                setattr(student, k, v)

        await session.flush()
        return student


student_repository = StudentRepository()
