"""Yuklamani oʻqish: kim, qaysi guruhga, qaysi fandan dars beradi.

Faqat oʻqish. Yozish EPOS sinxronizatsiyasining ishi
(``integration/eduplan/workload_service.py``) — bu yerdan qoʻlda oʻzgartirish
keyingi progn tomonidan jimgina qaytarilardi.
"""

import logging

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Teacher, TeacherAssignment, User
from app.modules.organization_structure.model import Group, Kafedra
from app.modules.quiz.model import Subject

from .schemas import AssignmentListRequest, AssignmentListResponse, AssignmentRow

logger = logging.getLogger(__name__)


class TeacherAssignmentRepository:
    @staticmethod
    def _base_query():
        """Uchta nomni bitta soʻrovda olib kelamiz.

        Alohida soʻrovlar bilan olsak, 50 qatorlik sahifa 150 ta qoʻshimcha
        soʻrovga aylanardi.
        """
        return (
            select(
                TeacherAssignment.id,
                TeacherAssignment.teacher_id,
                Teacher.full_name.label("teacher_name"),
                TeacherAssignment.subject_id,
                Subject.name.label("subject_name"),
                TeacherAssignment.group_id,
                Group.name.label("group_name"),
                Kafedra.id.label("kafedra_id"),
                Kafedra.name.label("kafedra_name"),
                TeacherAssignment.load_types,
                TeacherAssignment.semester_type,
                TeacherAssignment.academic_year_id,
                TeacherAssignment.is_active,
            )
            .join(Teacher, Teacher.id == TeacherAssignment.teacher_id)
            .join(Subject, Subject.id == TeacherAssignment.subject_id)
            .join(Group, Group.id == TeacherAssignment.group_id)
            .outerjoin(Kafedra, Kafedra.id == Teacher.kafedra_id)
        )

    def _apply_filters(self, stmt, request: AssignmentListRequest):
        if not request.include_inactive:
            stmt = stmt.where(TeacherAssignment.is_active.is_(True))
        if request.teacher_id:
            stmt = stmt.where(TeacherAssignment.teacher_id == request.teacher_id)
        if request.subject_id:
            stmt = stmt.where(TeacherAssignment.subject_id == request.subject_id)
        if request.group_id:
            stmt = stmt.where(TeacherAssignment.group_id == request.group_id)
        if request.kafedra_id:
            stmt = stmt.where(Teacher.kafedra_id == request.kafedra_id)
        if request.load_type:
            # JSONB roʻyxat ichida qidiramiz: bitta biriktirmada bir nechta
            # mashgʻulot turi boʻlishi mumkin.
            stmt = stmt.where(TeacherAssignment.load_types.contains([request.load_type]))
        if request.search:
            pattern = f"%{request.search}%"
            stmt = stmt.where(
                or_(
                    Teacher.full_name.ilike(pattern),
                    Subject.name.ilike(pattern),
                    Group.name.ilike(pattern),
                )
            )
        return stmt

    async def list_assignments(
        self, session: AsyncSession, request: AssignmentListRequest, current_user: User
    ) -> AssignmentListResponse:
        """Yuklama roʻyxati.

        Oʻqituvchi faqat oʻzinikini koʻradi: birovning yuklamasi unga kerak
        emas. Admin hammasini koʻradi.
        """
        roles = {role.name.lower() for role in (current_user.roles or [])}
        is_admin = "admin" in roles

        stmt = self._apply_filters(self._base_query(), request)
        count_stmt = self._apply_filters(
            select(func.count())
            .select_from(TeacherAssignment)
            .join(Teacher, Teacher.id == TeacherAssignment.teacher_id)
            .join(Subject, Subject.id == TeacherAssignment.subject_id)
            .join(Group, Group.id == TeacherAssignment.group_id),
            request,
        )

        if not is_admin:
            own = select(Teacher.id).where(Teacher.user_id == current_user.id).scalar_subquery()
            stmt = stmt.where(TeacherAssignment.teacher_id.in_(own))
            count_stmt = count_stmt.where(TeacherAssignment.teacher_id.in_(own))

        total = (await session.execute(count_stmt)).scalar() or 0

        stmt = (
            stmt.order_by(Teacher.full_name, Subject.name, Group.name)
            .offset(request.offset)
            .limit(request.limit)
        )
        rows = (await session.execute(stmt)).all()

        return AssignmentListResponse(
            items=[
                AssignmentRow(
                    id=row.id,
                    teacher_id=row.teacher_id,
                    teacher_name=row.teacher_name,
                    subject_id=row.subject_id,
                    subject_name=row.subject_name,
                    group_id=row.group_id,
                    group_name=row.group_name,
                    kafedra_id=row.kafedra_id,
                    kafedra_name=row.kafedra_name,
                    load_types=row.load_types or [],
                    semester_type=row.semester_type,
                    academic_year_id=row.academic_year_id,
                    is_active=row.is_active,
                )
                for row in rows
            ],
            total=total,
            page=request.page,
            limit=request.limit,
        )


get_teacher_assignment_repository = TeacherAssignmentRepository()
