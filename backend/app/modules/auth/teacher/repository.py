import logging

from fastapi import HTTPException, status
from sqlalchemy import Float, asc, case, cast, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.employee.model import Employee
from app.modules.auth.teacher.model import Teacher
from app.modules.auth.user.model import User
from app.modules.organization_structure.faculty.model import Faculty
from app.modules.organization_structure.group.model import Group, GroupTeacher
from app.modules.organization_structure.kafedra.model import Kafedra
from app.modules.quiz.result.model import Result
from app.modules.quiz.subject.model import Subject, SubjectTeacher

from .schemas import (
    FacultyRankingResponse,
    FacultyRankItem,
    KafedraRankingResponse,
    KafedraRankItem,
    TeacherCreateRequest,
    TeacherGroupAssignRequest,
    TeacherListRequest,
    TeacherListResponse,
    TeacherRankingResponse,
    TeacherRankItem,
    TeacherSubjectAssignRequest,
    TeacherUpdateRequest,
)

logger = logging.getLogger(__name__)


class TeacherRepository:
    @staticmethod
    def _eager_load_options():
        # Built lazily (not at class-body/import time) so this doesn't force
        # SQLAlchemy to configure all mappers before every model module has
        # been imported by the app.
        return (
            selectinload(Teacher.kafedra),
            selectinload(Teacher.employee)
            .selectinload(Employee.user)
            .selectinload(User.group_teachers)
            .selectinload(GroupTeacher.group),
            selectinload(Teacher.subject_teachers).selectinload(SubjectTeacher.subject),
        )

    async def create_teacher(self, session: AsyncSession, data: TeacherCreateRequest) -> Teacher:
        employee = (
            await session.execute(select(Employee).where(Employee.id == data.employee_id))
        ).scalar_one_or_none()
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        existing = (
            await session.execute(select(Teacher).where(Teacher.employee_id == data.employee_id))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This employee already has a Teacher profile",
            )

        new_teacher = Teacher(
            kafedra_id=data.kafedra_id,
            employee_id=data.employee_id,
        )
        session.add(new_teacher)

        try:
            await session.commit()
            await session.refresh(new_teacher)
            # Eager load relationships for response
            stmt = select(Teacher).options(*self._eager_load_options()).where(Teacher.id == new_teacher.id)
            result = await session.execute(stmt)
            new_teacher = result.scalar_one()
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_teacher

    async def get_teacher(self, session: AsyncSession, teacher_id: int) -> Teacher:
        stmt = select(Teacher).options(*self._eager_load_options()).where(Teacher.id == teacher_id)
        result = await session.execute(stmt)
        teacher = result.scalar_one_or_none()

        if not teacher:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

        return teacher

    async def list_teachers(self, session: AsyncSession, request: TeacherListRequest) -> TeacherListResponse:
        stmt = select(Teacher).options(*self._eager_load_options())
        count_stmt = select(func.count()).select_from(Teacher)

        if request.full_name:
            stmt = stmt.join(Teacher.employee).where(Employee.full_name.ilike(f"%{request.full_name}%"))
            count_stmt = count_stmt.join(Teacher.employee).where(
                Employee.full_name.ilike(f"%{request.full_name}%")
            )

        if request.kafedra_id:
            stmt = stmt.where(Teacher.kafedra_id == request.kafedra_id)
            count_stmt = count_stmt.where(Teacher.kafedra_id == request.kafedra_id)

        stmt = stmt.order_by(desc(Teacher.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        teachers = result.scalars().all()

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return TeacherListResponse(total=total, page=request.page, limit=request.limit, teachers=teachers)

    async def update_teacher(self, session: AsyncSession, teacher_id: int, data: TeacherUpdateRequest) -> Teacher:
        stmt = select(Teacher).options(*self._eager_load_options()).where(Teacher.id == teacher_id)
        result = await session.execute(stmt)
        teacher = result.scalar_one_or_none()

        if not teacher:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

        teacher.kafedra_id = data.kafedra_id

        await session.commit()
        await session.refresh(teacher)
        return teacher

    async def delete_teacher(self, session: AsyncSession, teacher_id: int, force: bool = False) -> None:
        from sqlalchemy import delete

        from app.modules.organization_structure.group.model import GroupTeacher
        from app.modules.quiz.question.model import Question
        from app.modules.quiz.quiz.model import Quiz
        from app.modules.quiz.subject.model import SubjectTeacher

        stmt = select(Teacher).options(selectinload(Teacher.employee)).where(Teacher.id == teacher_id)
        result = await session.execute(stmt)
        teacher = result.scalar_one_or_none()

        if not teacher:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

        employee_user_id = teacher.employee.user_id

        if not force:
            st_count = (
                await session.execute(
                    select(func.count(SubjectTeacher.id)).where(SubjectTeacher.teacher_id == teacher_id)
                )
            ).scalar() or 0
            gt_count = (
                await session.execute(
                    select(func.count(GroupTeacher.id)).where(GroupTeacher.teacher_id == employee_user_id)
                )
            ).scalar() or 0
            quiz_count = (
                await session.execute(select(func.count(Quiz.id)).where(Quiz.user_id == employee_user_id))
            ).scalar() or 0
            question_count = (
                await session.execute(select(func.count(Question.id)).where(Question.user_id == employee_user_id))
            ).scalar() or 0

            total = st_count + gt_count + quiz_count + question_count
            if total > 0:
                warnings = []
                if st_count > 0:
                    warnings.append(f"{st_count} ta fanga biriktiruv o'chadi")
                if gt_count > 0:
                    warnings.append(f"{gt_count} ta guruhga biriktiruv o'chadi")
                if quiz_count > 0:
                    warnings.append(f"{quiz_count} ta yaratgan testlari va ularning natijalari o'chadi")
                if question_count > 0:
                    warnings.append(f"{question_count} ta yaratgan savollari o'chadi")

                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu o'qituvchini o'chirish quyidagi ma'lumotlarga ta'sir qiladi:",
                        "warnings": warnings,
                    },
                )

        # Aggressive delete
        # 1. Quizzes (this will trigger result deletion if we use the repository method or if we do it here)
        quiz_ids = (await session.execute(select(Quiz.id).where(Quiz.user_id == employee_user_id))).scalars().all()
        if quiz_ids:
            from app.modules.quiz.quiz.model import QuizQuestion
            from app.modules.quiz.result.model import Result

            await session.execute(delete(Result).where(Result.quiz_id.in_(quiz_ids)))
            await session.execute(delete(QuizQuestion).where(QuizQuestion.quiz_id.in_(quiz_ids)))
            await session.execute(delete(Quiz).where(Quiz.id.in_(quiz_ids)))

        # 2. Questions
        await session.execute(delete(Question).where(Question.user_id == employee_user_id))

        # 3. Group Assignments
        await session.execute(delete(GroupTeacher).where(GroupTeacher.teacher_id == employee_user_id))

        # 4. Subject Assignments (handled by SQLAlchemy cascade)

        await session.delete(teacher)
        await session.commit()

    async def assign_groups(self, session: AsyncSession, data: TeacherGroupAssignRequest) -> None:
        # 1. Fetch User (since GroupTeacher uses teacher_id pointing to User.id)
        stmt = select(User).where(User.id == data.user_id).options(selectinload(User.group_teachers))
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # 2. Delete existing
        for gt in user.group_teachers:
            await session.delete(gt)

        await session.flush()

        # 3. Fetch specific groups to validate
        if data.group_ids:
            stmt_groups = select(Group).where(Group.id.in_(data.group_ids))
            result_groups = await session.execute(stmt_groups)
            groups = result_groups.scalars().all()

            if len(groups) != len(data.group_ids):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="One or more group_ids are invalid",
                )

            # 4. Create new GroupTeacher entries
            for group_id in data.group_ids:
                new_gt = GroupTeacher(group_id=group_id, teacher_id=data.user_id)
                session.add(new_gt)

        try:
            await session.commit()
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while assigning groups",
            )

    async def assign_subjects(self, session: AsyncSession, data: TeacherSubjectAssignRequest) -> None:
        # 1. Fetch Teacher (since SubjectTeacher uses teacher_id pointing to Teacher.id)
        stmt = select(Teacher).where(Teacher.id == data.teacher_id).options(selectinload(Teacher.subject_teachers))
        result = await session.execute(stmt)
        teacher = result.scalar_one_or_none()

        if not teacher:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

        # 2. Delete existing
        for st in teacher.subject_teachers:
            await session.delete(st)

        await session.flush()

        # 3. Fetch subjects to validate
        if data.subject_ids:
            stmt_subjects = select(Subject).where(Subject.id.in_(data.subject_ids))
            result_subjects = await session.execute(stmt_subjects)
            subjects = result_subjects.scalars().all()

            if len(subjects) != len(data.subject_ids):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="One or more subject_ids are invalid",
                )

            # 4. Create new entries
            for subject_id in data.subject_ids:
                new_st = SubjectTeacher(subject_id=subject_id, teacher_id=data.teacher_id)
                session.add(new_st)

        try:
            await session.commit()
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while assigning subjects",
            )

    async def get_assigned_subjects_by_user(self, session: AsyncSession, user_id: int) -> Teacher:
        stmt = (
            select(Teacher)
            .join(Teacher.employee)
            # selectinload(Teacher.employee) обязателен, а не только join: ответ
            # собирается через _flatten_employee, который читает teacher.employee.
            # Без предзагрузки это ленивый запрос уже вне async-контекста —
            # SQLAlchemy отвечает MissingGreenlet, и эндпоинт падал пятисоткой.
            .options(
                selectinload(Teacher.employee),
                selectinload(Teacher.subject_teachers).selectinload(SubjectTeacher.subject),
            )
            .where(Employee.user_id == user_id)
        )

        result = await session.execute(stmt)
        teacher = result.scalar_one_or_none()

        if not teacher:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher not found for this user",
            )

        return teacher

    async def get_assigned_groups_by_user(self, session: AsyncSession, user_id: int) -> Teacher:
        stmt = (
            select(Teacher)
            .join(Teacher.employee)
            .options(
                selectinload(Teacher.employee)
                .selectinload(Employee.user)
                .selectinload(User.group_teachers)
                .selectinload(GroupTeacher.group)
            )
            .where(Employee.user_id == user_id)
        )

        result = await session.execute(stmt)
        teacher = result.scalar_one_or_none()

        if not teacher:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher not found for this user",
            )

        return teacher

    # ------------------------------------------------------------------
    # Bayesian helper
    # ------------------------------------------------------------------
    @staticmethod
    def _bayesian(entries: list[dict], C: float = 5.0) -> list[dict]:
        """
        Apply Bayesian weighted rating to a list of dicts that have
        'avg_grade' and 'student_count' keys.  Adds 'weighted_rating'.

        Formula: weighted_rating = (C×m + avg_grade×v) / (C + v)
          m = global mean avg_grade across all entries
          v = student_count for this entry
          C = confidence threshold (default 5)
        """
        if not entries:
            return entries
        total_v = sum(e["student_count"] for e in entries)
        if total_v == 0:
            for e in entries:
                e["weighted_rating"] = 0.0
            return entries
        # Global mean = weighted avg of avg_grades
        m = sum(e["avg_grade"] * e["student_count"] for e in entries) / total_v
        for e in entries:
            v = e["student_count"]
            e["weighted_rating"] = round((C * m + e["avg_grade"] * v) / (C + v), 2)
        return entries

    # ------------------------------------------------------------------
    # Teacher ranking  (optional filters: faculty, kafedra, group)
    # ------------------------------------------------------------------
    async def get_ranking(
        self,
        session: AsyncSession,
        faculty_id: int | None = None,
        kafedra_id: int | None = None,
        group_id: int | None = None,
        search: str | None = None,
        page: int = 1,
        limit: int = 10,
    ) -> TeacherRankingResponse:
        """
        Return teachers ranked by weighted rating and student performance.
        Weighted Formula:
            Grade 5: 1.2, Grade 4: 1.0, Grade 3: 0.5, Grade 2: -1.0
        Volume Factor:
            Adds a small bonus based on student count to favor teachers with more students.
        """
        # Define Weighted Points logic
        weighted_points = case(
            (Result.grade == 5, 5 * 1.2),  # 6.0
            (Result.grade == 4, 4 * 1.0),  # 4.0
            (Result.grade == 3, 3 * 0.5),  # 1.5
            (Result.grade == 2, 2 * -1.0),  # -2.0
            else_=0,
        )

        total_students = func.count(func.distinct(Result.user_id)).label("student_count")
        # Use nullif to avoid division by zero and coalesce to provide a default 1.0 rating
        raw_rating = func.sum(weighted_points) / cast(func.nullif(func.count(Result.id), 0), Float)

        # Clamp between 1.0 and 5.0 and ensure it's not NULL
        clamped_rating = func.coalesce(func.least(5.0, func.greatest(1.0, raw_rating)), 0.0)

        # Rank score adds volume boost: 0.01 * Log10(Count + 1)
        rank_score = (clamped_rating + (func.log(cast(total_students + 1, Float)) * 0.01)).label("rank_score")

        columns = [
            Teacher.id.label("teacher_id"),
            Employee.full_name,
            Teacher.kafedra_id,
            Kafedra.name.label("kafedra_name"),
            Kafedra.faculty_id,
            Faculty.name.label("faculty_name"),
            total_students,
            func.coalesce(func.avg(Result.grade), 0).label("avg_grade"),
            clamped_rating.label("weighted_rating"),
            rank_score,
        ]

        stmt = (
            select(*columns)
            .join(Employee, Teacher.employee_id == Employee.id)
            .outerjoin(Kafedra, Teacher.kafedra_id == Kafedra.id)
            .outerjoin(Faculty, Kafedra.faculty_id == Faculty.id)
            .outerjoin(GroupTeacher, Employee.user_id == GroupTeacher.teacher_id)
            .outerjoin(Result, GroupTeacher.group_id == Result.group_id)
        )

        if faculty_id is not None:
            stmt = stmt.where(Kafedra.faculty_id == faculty_id)
        if kafedra_id is not None:
            stmt = stmt.where(Teacher.kafedra_id == kafedra_id)
        if group_id is not None:
            stmt = stmt.where(GroupTeacher.group_id == group_id)

        stmt = stmt.group_by(
            Teacher.id,
            Employee.full_name,
            Teacher.kafedra_id,
            Kafedra.name,
            Kafedra.faculty_id,
            Faculty.name,
        )

        # Subquery 1: Calculate raw metrics and rank_score
        subq1 = stmt.subquery()

        # Subquery 2: Assign global rank across the whole category
        rank_col = func.row_number().over(order_by=desc(subq1.c.rank_score)).label("calculated_rank")
        subq2 = select(subq1, rank_col).subquery()

        # Outer selection: Apply search filter to the ALREADY ranked rows
        filtered_stmt = select(subq2)
        if search:
            filtered_stmt = filtered_stmt.where(subq2.c.full_name.ilike(f"%{search}%"))

        # Calculate total based on search result
        count_stmt = select(func.count()).select_from(filtered_stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        # Apply final order and pagination
        final_stmt = filtered_stmt.order_by(asc(subq2.c.calculated_rank)).offset((page - 1) * limit).limit(limit)
        rows = (await session.execute(final_stmt)).mappings().all()

        teachers = [
            TeacherRankItem(
                rank=int(row["calculated_rank"]),
                teacher_id=row["teacher_id"],
                full_name=row["full_name"],
                kafedra_id=row["kafedra_id"],
                kafedra_name=row["kafedra_name"],
                faculty_id=row["faculty_id"],
                faculty_name=row["faculty_name"],
                group_id=None,
                group_name=None,
                student_count=int(row["student_count"]),
                avg_grade=round(float(row["avg_grade"]), 2),
                weighted_rating=round(float(row["weighted_rating"]), 2),
            )
            for row in rows
        ]

        return TeacherRankingResponse(
            total=total,
            page=page,
            limit=limit,
            teachers=teachers,
            faculty_id=faculty_id,
            kafedra_id=kafedra_id,
            group_id=group_id,
            search=search,
        )

    # ------------------------------------------------------------------
    # Faculty ranking
    # ------------------------------------------------------------------
    async def get_faculty_ranking(
        self, session: AsyncSession, page: int = 1, limit: int = 10
    ) -> FacultyRankingResponse:
        """
        Rank faculties by weighted average student grade in a single pass.
        """
        weighted_points = case(
            (Result.grade == 5, 5 * 1.2),
            (Result.grade == 4, 4 * 1.0),
            (Result.grade == 3, 3 * 0.5),
            (Result.grade == 2, 2 * -1.0),
            else_=0,
        )
        total_students = func.count(func.distinct(Result.user_id)).label("student_count")
        raw_rating = func.sum(weighted_points) / cast(func.nullif(func.count(Result.id), 0), Float)
        clamped_rating = func.coalesce(func.least(5.0, func.greatest(1.0, raw_rating)), 0.0).label("weighted_rating")
        rank_score = (clamped_rating + (func.log(cast(total_students + 1, Float)) * 0.01)).label("rank_score")

        stmt = (
            select(
                Faculty.id.label("faculty_id"),
                Faculty.name.label("faculty_name"),
                func.count(func.distinct(Kafedra.id)).label("kafedra_count"),
                total_students,
                func.coalesce(func.avg(Result.grade), 0).label("avg_grade"),
                clamped_rating,
                rank_score,
            )
            .outerjoin(Kafedra, Kafedra.faculty_id == Faculty.id)
            .outerjoin(Teacher, Teacher.kafedra_id == Kafedra.id)
            .outerjoin(Employee, Teacher.employee_id == Employee.id)
            .outerjoin(GroupTeacher, GroupTeacher.teacher_id == Employee.user_id)
            .outerjoin(Result, Result.group_id == GroupTeacher.group_id)
            .group_by(Faculty.id, Faculty.name)
            .order_by(desc("rank_score"))
        )
        total_stmt = select(func.count(func.distinct(Faculty.id))).select_from(Faculty)

        total = (await session.execute(total_stmt)).scalar() or 0

        stmt = stmt.offset((page - 1) * limit).limit(limit)

        rows = (await session.execute(stmt)).mappings().all()

        faculties = [
            FacultyRankItem(
                rank=(page - 1) * limit + idx,
                faculty_id=row["faculty_id"],
                faculty_name=row["faculty_name"],
                kafedra_count=int(row["kafedra_count"]),
                student_count=int(row["student_count"]),
                avg_grade=round(float(row["avg_grade"]), 2),
                weighted_rating=round(float(row["weighted_rating"]), 2),
            )
            for idx, row in enumerate(rows, start=1)
        ]
        return FacultyRankingResponse(total=total, page=page, limit=limit, faculties=faculties)

    # ------------------------------------------------------------------
    # Kafedra ranking
    # ------------------------------------------------------------------
    async def get_kafedra_ranking(
        self, session: AsyncSession, page: int = 1, limit: int = 10
    ) -> KafedraRankingResponse:
        """
        Rank kafedras by weighted average student grade in a single pass.
        """
        weighted_points = case(
            (Result.grade == 5, 5 * 1.2),
            (Result.grade == 4, 4 * 1.0),
            (Result.grade == 3, 3 * 0.5),
            (Result.grade == 2, 2 * -1.0),
            else_=0,
        )
        total_students = func.count(func.distinct(Result.user_id)).label("student_count")
        raw_rating = func.sum(weighted_points) / cast(func.nullif(func.count(Result.id), 0), Float)
        clamped_rating = func.coalesce(func.least(5.0, func.greatest(1.0, raw_rating)), 0.0).label("weighted_rating")
        rank_score = (clamped_rating + (func.log(cast(total_students + 1, Float)) * 0.01)).label("rank_score")

        stmt = (
            select(
                Kafedra.id.label("kafedra_id"),
                Kafedra.name.label("kafedra_name"),
                Kafedra.faculty_id,
                Faculty.name.label("faculty_name"),
                func.count(func.distinct(Teacher.id)).label("teacher_count"),
                total_students,
                func.coalesce(func.avg(Result.grade), 0).label("avg_grade"),
                clamped_rating,
                rank_score,
            )
            .outerjoin(Faculty, Faculty.id == Kafedra.faculty_id)
            .outerjoin(Teacher, Teacher.kafedra_id == Kafedra.id)
            .outerjoin(Employee, Teacher.employee_id == Employee.id)
            .outerjoin(GroupTeacher, GroupTeacher.teacher_id == Employee.user_id)
            .outerjoin(Result, Result.group_id == GroupTeacher.group_id)
            .group_by(Kafedra.id, Kafedra.name, Kafedra.faculty_id, Faculty.name)
            .order_by(desc("rank_score"))
        )
        total_stmt = select(func.count(func.distinct(Kafedra.id))).select_from(Kafedra)

        total = (await session.execute(total_stmt)).scalar() or 0

        stmt = stmt.offset((page - 1) * limit).limit(limit)

        rows = (await session.execute(stmt)).mappings().all()

        kafedras = [
            KafedraRankItem(
                rank=(page - 1) * limit + idx,
                kafedra_id=row["kafedra_id"],
                kafedra_name=row["kafedra_name"],
                faculty_id=row["faculty_id"],
                faculty_name=row["faculty_name"],
                teacher_count=int(row["teacher_count"]),
                student_count=int(row["student_count"]),
                avg_grade=round(float(row["avg_grade"]), 2),
                weighted_rating=round(float(row["weighted_rating"]), 2),
            )
            for idx, row in enumerate(rows, start=1)
        ]
        return KafedraRankingResponse(total=total, page=page, limit=limit, kafedras=kafedras)


get_teacher_repository = TeacherRepository()
