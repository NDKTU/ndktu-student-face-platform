import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.schemas import TASHKENT_TZ
from app.core.utils.course_access import can_manage as can_manage_course
from app.core.utils.lesson_access import ensure_can_manage_lesson
from app.core.utils.lesson_scope import visible_to_group
from app.modules.auth.model import Student, User
from app.modules.course.model import Course, CourseGroup, CourseTeacher, Lesson, LessonAttendance
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Subject

from .schemas import (
    AttendanceBulkRequest,
    AttendanceGroupInfo,
    AttendanceListResponse,
    AttendanceRow,
    AttendanceStats,
    CourseAttendanceLesson,
    CourseAttendanceResponse,
    CourseAttendanceStudent,
    MyAttendanceCourse,
    MyAttendanceItem,
    MyAttendanceResponse,
)

logger = logging.getLogger(__name__)


class AttendanceRepository:
    async def _get_lesson(self, session: AsyncSession, lesson_id: int) -> Lesson:
        lesson = (await session.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dars topilmadi")
        return lesson

    async def _lesson_group_ids(self, session: AsyncSession, lesson: Lesson) -> list[int]:
        """Dars qaysi guruhlarni qamraydi.

        `lessons.group_id` bo'sh bo'lsa — dars kursniki va kursning barcha
        guruhlariga tegishli (`app/core/utils/lesson_scope.py` dagi qoida bilan
        bir xil).
        """
        if lesson.group_id is not None:
            return [lesson.group_id]
        rows = await session.execute(
            select(CourseGroup.group_id).where(CourseGroup.course_id == lesson.course_id)
        )
        return [row[0] for row in rows]

    def _locked_after(self, lesson: Lesson):
        """Jurnal qaysi sanadan keyin yopiladi. Bo'sh — cheklov o'chirilgan."""
        window = settings.attendance.edit_window_days
        if window is None:
            return None
        return lesson.date + timedelta(days=window)

    def _is_editable(self, lesson: Lesson) -> bool:
        locked_after = self._locked_after(lesson)
        if locked_after is None:
            return True
        # Toshkent sanasi bo'yicha: konteyner UTC'da yuradi va yarim tunda
        # jurnal bir kun erta yopilib qolardi.
        today = datetime.now(timezone.utc).astimezone(TASHKENT_TZ).date()
        return today <= locked_after

    def _ensure_editable(self, lesson: Lesson) -> None:
        if not self._is_editable(lesson):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Jurnal yopilgan: dars sanasidan keyin "
                    f"{settings.attendance.edit_window_days} kun o'tdi"
                ),
            )

    async def _groups_info(
        self, session: AsyncSession, lesson: Lesson, group_ids: list[int]
    ) -> list[AttendanceGroupInfo]:
        if not group_ids:
            return []

        groups = list(
            (
                await session.execute(select(Group).where(Group.id.in_(group_ids)).order_by(Group.name))
            )
            .scalars()
            .all()
        )

        counts = dict(
            (
                await session.execute(
                    select(Student.group_id, func.count(Student.id))
                    .where(Student.group_id.in_(group_ids))
                    .group_by(Student.group_id)
                )
            ).all()
        )
        marked = dict(
            (
                await session.execute(
                    select(LessonAttendance.group_id, func.count(LessonAttendance.id))
                    .where(
                        LessonAttendance.lesson_id == lesson.id,
                        LessonAttendance.group_id.in_(group_ids),
                    )
                    .group_by(LessonAttendance.group_id)
                )
            ).all()
        )

        return [
            AttendanceGroupInfo(
                id=g.id,
                name=g.name,
                student_count=counts.get(g.id, 0),
                marked_count=marked.get(g.id, 0),
            )
            for g in groups
        ]

    async def _roster(
        self, session: AsyncSession, lesson: Lesson, group_id: int
    ) -> list[AttendanceRow]:
        students = list(
            (
                await session.execute(
                    select(Student)
                    .where(Student.group_id == group_id)
                    .order_by(Student.full_name)
                )
            )
            .scalars()
            .all()
        )
        if not students:
            return []

        group_name = (
            await session.execute(select(Group.name).where(Group.id == group_id))
        ).scalar_one_or_none()

        marks = {
            row.student_id: row
            for row in (
                await session.execute(
                    select(LessonAttendance).where(
                        LessonAttendance.lesson_id == lesson.id,
                        LessonAttendance.student_id.in_([s.id for s in students]),
                    )
                )
            )
            .scalars()
            .all()
        }

        rows: list[AttendanceRow] = []
        for student in students:
            mark = marks.get(student.id)
            rows.append(
                AttendanceRow(
                    student_id=student.id,
                    full_name=student.full_name,
                    student_id_number=student.student_id_number,
                    group_id=student.group_id,
                    group_name=group_name,
                    status=mark.status if mark else None,
                    source=mark.source if mark else None,
                    comment=mark.comment if mark else None,
                    marked_by_user_id=mark.marked_by_user_id if mark else None,
                    marked_at=mark.updated_at if mark else None,
                )
            )
        return rows

    async def list_attendance(
        self,
        session: AsyncSession,
        lesson_id: int,
        current_user: User,
        group_id: int | None = None,
    ) -> AttendanceListResponse:
        lesson = await self._get_lesson(session, lesson_id)
        await ensure_can_manage_lesson(
            session, lesson, current_user, detail="Davomat jurnali faqat dars o'qituvchisiga ochiq"
        )

        group_ids = await self._lesson_group_ids(session, lesson)
        groups = await self._groups_info(session, lesson, group_ids)

        response = AttendanceListResponse(
            lesson_id=lesson.id,
            lesson_date=lesson.date,
            groups=groups,
            is_editable=self._is_editable(lesson),
            locked_after=self._locked_after(lesson),
        )

        if group_id is not None:
            if group_id not in group_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Bu guruh darsga tegishli emas",
                )
            selected = group_id
        elif len(group_ids) == 1:
            selected = group_ids[0]
        else:
            # Oqim darsida guruhsiz ro'yxat bermaymiz: to'qqiz guruhli kursda
            # bu 200 dan ortiq qator bo'lardi va jurnal ishlatib bo'lmas edi.
            response.group_required = len(group_ids) > 1
            return response

        response.group_id = selected
        response.students = await self._roster(session, lesson, selected)

        for row in response.students:
            if row.status == "present":
                response.present_count += 1
            elif row.status == "late":
                response.late_count += 1
            elif row.status == "absent":
                response.absent_count += 1
            elif row.status == "excused":
                response.excused_count += 1
            else:
                response.unmarked_count += 1

        return response

    async def save_attendance(
        self,
        session: AsyncSession,
        lesson_id: int,
        data: AttendanceBulkRequest,
        current_user: User,
    ) -> AttendanceListResponse:
        lesson = await self._get_lesson(session, lesson_id)
        await ensure_can_manage_lesson(
            session, lesson, current_user, detail="Davomatni faqat dars o'qituvchisi belgilaydi"
        )
        self._ensure_editable(lesson)

        if not data.items:
            return await self.list_attendance(session, lesson_id, current_user, data.group_id)

        group_ids = await self._lesson_group_ids(session, lesson)
        student_ids = [item.student_id for item in data.items]

        # Talaba darsning guruhlaridan bo'lishi shart: aks holda o'qituvchi
        # universitetning istalgan talabasiga belgi qo'ya olardi.
        students = {
            student.id: student
            for student in (
                await session.execute(
                    select(Student).where(
                        Student.id.in_(student_ids),
                        Student.group_id.in_(group_ids),
                    )
                )
            )
            .scalars()
            .all()
        }
        unknown = set(student_ids) - set(students)
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Talabalar bu darsning guruhlariga kirmaydi: {sorted(unknown)}",
            )

        existing = {
            row.student_id: row
            for row in (
                await session.execute(
                    select(LessonAttendance).where(
                        LessonAttendance.lesson_id == lesson.id,
                        LessonAttendance.student_id.in_(student_ids),
                    )
                )
            )
            .scalars()
            .all()
        }

        for item in data.items:
            row = existing.get(item.student_id)

            if item.status is None:
                # Belgini olib tashlash: qator o'chadi va dars yana
                # «belgilanmagan» holatga qaytadi.
                if row is not None:
                    await session.delete(row)
                continue

            if row is None:
                session.add(
                    LessonAttendance(
                        lesson_id=lesson.id,
                        student_id=item.student_id,
                        group_id=students[item.student_id].group_id,
                        status=item.status,
                        source="manual",
                        marked_by_user_id=current_user.id,
                        comment=item.comment,
                    )
                )
            else:
                row.status = item.status
                row.comment = item.comment
                row.source = "manual"
                row.marked_by_user_id = current_user.id
                # Guruh o'zgargan bo'lsa yangilanadi: belgi qo'yilgan paytdagi
                # guruh saqlanishi kerak.
                row.group_id = students[item.student_id].group_id

        await session.commit()

        return await self.list_attendance(session, lesson_id, current_user, data.group_id)

    # ── Statistika ─────────────────────────────────────────────────────────

    @staticmethod
    def _percent(present: int, late: int, absent: int) -> float | None:
        """Foiz. `excused` va belgilanmagan darslar maxrajga kirmaydi.

        Hech narsa belgilanmagan bo'lsa `None`, 0 emas: «hali jurnal
        to'ldirilmagan» va «hech qachon kelmagan» — bir xil emas.
        """
        counted = present + late + absent
        if counted == 0:
            return None
        return round((present + late) * 100 / counted, 1)

    async def stats_for_students(
        self,
        session: AsyncSession,
        student_ids: list[int],
        course_ids: list[int] | None = None,
    ) -> dict[int, AttendanceStats]:
        """Talabalar kesimida davomat ko'rsatkichi.

        `course_ids` — hisobni cheklash uchun: o'qituvchi o'z sahifasida
        universitet bo'yicha emas, o'z kurslari bo'yicha foizni ko'rishi kerak.
        """
        result = {sid: AttendanceStats(student_id=sid) for sid in student_ids}
        if not student_ids:
            return result

        stmt = (
            select(
                LessonAttendance.student_id,
                LessonAttendance.status,
                func.count(LessonAttendance.id),
            )
            .where(LessonAttendance.student_id.in_(student_ids))
            .group_by(LessonAttendance.student_id, LessonAttendance.status)
        )
        if course_ids is not None:
            if not course_ids:
                return result
            stmt = stmt.join(Lesson, Lesson.id == LessonAttendance.lesson_id).where(
                Lesson.course_id.in_(course_ids)
            )

        for student_id, status_value, count in (await session.execute(stmt)).all():
            stats = result[student_id]
            setattr(stats, status_value, count)

        for stats in result.values():
            stats.counted = stats.present + stats.late + stats.absent
            stats.percent = self._percent(stats.present, stats.late, stats.absent)

        return result

    async def teacher_course_ids(self, session: AsyncSession, user_id: int) -> list[int]:
        """O'qituvchining kurslari: asosiy va yordamchi sifatida."""
        rows = await session.execute(
            select(Course.id)
            .where(Course.teacher_id == user_id)
            .union(select(CourseTeacher.course_id).where(CourseTeacher.user_id == user_id))
        )
        return [row[0] for row in rows]

    # ── Kurs jurnali ───────────────────────────────────────────────────────

    async def course_attendance(
        self,
        session: AsyncSession,
        course_id: int,
        current_user: User,
        group_id: int | None = None,
    ) -> CourseAttendanceResponse:
        course = (await session.execute(select(Course).where(Course.id == course_id))).scalar_one_or_none()
        if course is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kurs topilmadi")
        if not await can_manage_course(session, course, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Jurnal faqat kurs o'qituvchilariga ochiq",
            )

        group_ids = [
            row[0]
            for row in await session.execute(
                select(CourseGroup.group_id).where(CourseGroup.course_id == course_id)
            )
        ]

        groups = list(
            (await session.execute(select(Group).where(Group.id.in_(group_ids)).order_by(Group.name)))
            .scalars()
            .all()
        )
        counts = dict(
            (
                await session.execute(
                    select(Student.group_id, func.count(Student.id))
                    .where(Student.group_id.in_(group_ids))
                    .group_by(Student.group_id)
                )
            ).all()
        )

        response = CourseAttendanceResponse(
            course_id=course_id,
            groups=[
                AttendanceGroupInfo(id=g.id, name=g.name, student_count=counts.get(g.id, 0))
                for g in groups
            ],
        )

        if group_id is not None:
            if group_id not in group_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Bu guruh kursga tegishli emas"
                )
            selected = group_id
        elif len(group_ids) == 1:
            selected = group_ids[0]
        else:
            response.group_required = len(group_ids) > 1
            return response

        response.group_id = selected

        # Guruhga ko'rinadigan darslar: o'zining va butun kursning darslari.
        lessons = list(
            (
                await session.execute(
                    select(Lesson)
                    .where(Lesson.course_id == course_id)
                    .where(visible_to_group(selected))
                    .order_by(Lesson.date, Lesson.id)
                )
            )
            .scalars()
            .all()
        )
        response.lessons = [
            CourseAttendanceLesson(
                id=lesson.id, topic=lesson.topic, date=lesson.date, lesson_type=lesson.lesson_type
            )
            for lesson in lessons
        ]

        students = list(
            (
                await session.execute(
                    select(Student).where(Student.group_id == selected).order_by(Student.full_name)
                )
            )
            .scalars()
            .all()
        )
        if not students or not lessons:
            response.students = [
                CourseAttendanceStudent(
                    student_id=s.id,
                    full_name=s.full_name,
                    student_id_number=s.student_id_number,
                    stats=AttendanceStats(student_id=s.id),
                )
                for s in students
            ]
            return response

        lesson_ids = [lesson.id for lesson in lessons]
        marks: dict[int, dict[int, str]] = {}
        rows = await session.execute(
            select(LessonAttendance.student_id, LessonAttendance.lesson_id, LessonAttendance.status).where(
                LessonAttendance.lesson_id.in_(lesson_ids),
                LessonAttendance.student_id.in_([s.id for s in students]),
            )
        )
        for student_id, lesson_id, status_value in rows.all():
            marks.setdefault(student_id, {})[lesson_id] = status_value

        response.students = []
        for student in students:
            student_marks = marks.get(student.id, {})
            stats = AttendanceStats(student_id=student.id)
            for value in student_marks.values():
                setattr(stats, value, getattr(stats, value) + 1)
            stats.counted = stats.present + stats.late + stats.absent
            stats.percent = self._percent(stats.present, stats.late, stats.absent)
            response.students.append(
                CourseAttendanceStudent(
                    student_id=student.id,
                    full_name=student.full_name,
                    student_id_number=student.student_id_number,
                    marks=student_marks,
                    stats=stats,
                )
            )

        return response

    # ── Talabaning o'z davomati ────────────────────────────────────────────

    async def my_attendance(self, session: AsyncSession, current_user: User) -> MyAttendanceResponse:
        student = (
            await session.execute(select(Student).where(Student.user_id == current_user.id))
        ).scalar_one_or_none()
        if student is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bu hisob talabaga bog'lanmagan",
            )

        group_name = None
        if student.group_id:
            group_name = (
                await session.execute(select(Group.name).where(Group.id == student.group_id))
            ).scalar_one_or_none()

        response = MyAttendanceResponse(
            student_id=student.id, group_id=student.group_id, group_name=group_name
        )

        rows = (
            await session.execute(
                select(
                    LessonAttendance.status,
                    LessonAttendance.comment,
                    Lesson.id,
                    Lesson.topic,
                    Lesson.date,
                    Course.id.label("course_id"),
                    Course.name.label("course_name"),
                    Subject.name.label("subject_name"),
                )
                .join(Lesson, Lesson.id == LessonAttendance.lesson_id)
                .join(Course, Course.id == Lesson.course_id)
                .outerjoin(Subject, Subject.id == Course.subject_id)
                .where(LessonAttendance.student_id == student.id)
                .order_by(Lesson.date.desc(), Lesson.id.desc())
            )
        ).all()

        per_course: dict[int, MyAttendanceCourse] = {}
        for row in rows:
            course = per_course.setdefault(
                row.course_id,
                MyAttendanceCourse(
                    course_id=row.course_id,
                    course_name=row.course_name,
                    subject_name=row.subject_name,
                ),
            )
            setattr(course, row.status, getattr(course, row.status) + 1)
            setattr(response, row.status, getattr(response, row.status) + 1)

            if row.status != "present":
                response.misses.append(
                    MyAttendanceItem(
                        lesson_id=row.id,
                        lesson_date=row.date,
                        lesson_topic=row.topic,
                        course_id=row.course_id,
                        course_name=row.course_name,
                        status=row.status,
                        comment=row.comment,
                    )
                )

        for course in per_course.values():
            course.percent = self._percent(course.present, course.late, course.absent)

        response.courses = sorted(per_course.values(), key=lambda c: c.course_name)
        response.percent = self._percent(response.present, response.late, response.absent)
        return response


get_attendance_repository = AttendanceRepository()
