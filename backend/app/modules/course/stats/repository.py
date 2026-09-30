"""Kurslar statistikasi — ma'muriyat uchun umumiy kesim.

Har bir faol kurs — bitta qator: kafedra, fan va o'quv reja, ta'lim turi,
mashg'ulot va semestr, hamda kursda nechta mavzu, resurs va topshiriq
borligi. Maqsad — qaysi kurs to'ldirilgan, qaysi biri bo'sh turganini bir
qarashda ko'rish.

Mavzu — dars (`lessons.topic`), topshiriq — uy vazifasi. Arxivdagi kurslar
kirmaydi: ular EPOS yuklamasidan yo'qolgan va bo'shligi endi hech kimning
ishi emas.
"""

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.sorting import order_by_clause
from app.modules.course.model import Course, CourseGroup, Homework, Lesson, Resource
from app.modules.organization_structure.model import Curriculum, Faculty, Group, Kafedra, Speciality
from app.modules.quiz.model import Subject

from .schemas import CourseStatsRequest, CourseStatsResponse, CourseStatsRow, CourseStatsSummary


class CourseStatsRepository:
    async def course_stats(self, session: AsyncSession, request: CourseStatsRequest) -> CourseStatsResponse:
        # Sanoqlar alohida guruhlangan so'rovlarda: uchta jadvalni kursga
        # to'g'ridan-to'g'ri JOIN qilsak, qatorlar ko'payib, har bir son
        # boshqalariga ko'paytirilib chiqardi.
        topics = (
            select(Lesson.course_id.label("course_id"), func.count(Lesson.id).label("n"))
            .group_by(Lesson.course_id)
            .subquery()
        )
        # Dars materiali faqat `lesson_id` bilan yoziladi, kurs kutubxonasidagisi
        # esa faqat `course_id` bilan — ikkalasi ham kursning resursi.
        resource_course_id = func.coalesce(Resource.course_id, Lesson.course_id)
        resources = (
            select(resource_course_id.label("course_id"), func.count(Resource.id).label("n"))
            .select_from(Resource)
            .outerjoin(Lesson, Lesson.id == Resource.lesson_id)
            .group_by(resource_course_id)
            .subquery()
        )
        homeworks = (
            select(Homework.course_id.label("course_id"), func.count(Homework.id).label("n"))
            .group_by(Homework.course_id)
            .subquery()
        )
        # Kursning guruhlari odatda bitta oqim — bir xil kurs va shakl.
        # Aralash bo'lsa ham qator bitta qolishi uchun agregat olinadi.
        groups = (
            select(
                CourseGroup.course_id.label("course_id"),
                func.max(Group.course).label("year"),
                func.min(Group.education_shape).label("education_shape"),
            )
            .join(Group, Group.id == CourseGroup.group_id)
            .group_by(CourseGroup.course_id)
            .subquery()
        )

        topic_count = func.coalesce(topics.c.n, 0)
        resource_count = func.coalesce(resources.c.n, 0)
        homework_count = func.coalesce(homeworks.c.n, 0)
        content_count = topic_count + resource_count + homework_count

        # «Bo'lim» — kafedraning fakulteti, `courses.faculty_id` emas: u
        # guruhlardan chiqariladi, ya'ni talabalarning fakulteti, va ko'p
        # kursda kafedranikidan farq qiladi. Kafedrasiz kursda boshqa manba yo'q.
        faculty_id = func.coalesce(Kafedra.faculty_id, Course.faculty_id)
        # Reja fanning o'zida, lekin hamma fanda emas — qolganiga yo'nalish
        # va guruh.
        education_type = func.coalesce(Curriculum.education_type, Speciality.education_type)
        education_form = func.coalesce(Curriculum.education_form, groups.c.education_shape)
        # 4-kurs, kuzgi → 7-semestr. Guruhning `course` i EPOS'dan har yili
        # yangilanadi, arxivlanmagan kurslar esa joriy yuklamadan — shuning
        # uchun ikkalasi bir o'quv yiliga tegishli.
        study_semester = case(
            (
                and_(groups.c.year.is_not(None), Course.semester_number.in_((1, 2))),
                (groups.c.year - 1) * 2 + Course.semester_number,
            ),
            else_=None,
        )

        stmt = (
            select(
                Course.id.label("course_id"),
                Course.name.label("course_name"),
                Course.course_type,
                Course.semester_number,
                Kafedra.name.label("kafedra_name"),
                Faculty.name.label("faculty_name"),
                Subject.name.label("subject_name"),
                Curriculum.name.label("curriculum_name"),
                education_type.label("education_type"),
                education_form.label("education_form"),
                study_semester.label("study_semester"),
                topic_count.label("topic_count"),
                resource_count.label("resource_count"),
                homework_count.label("homework_count"),
            )
            .select_from(Course)
            .join(Subject, Subject.id == Course.subject_id)
            .outerjoin(Curriculum, Curriculum.id == Subject.curriculum_id)
            .outerjoin(Speciality, Speciality.id == Course.speciality_id)
            .outerjoin(Kafedra, Kafedra.id == Course.kafedra_id)
            .outerjoin(Faculty, Faculty.id == faculty_id)
            .outerjoin(groups, groups.c.course_id == Course.id)
            .outerjoin(topics, topics.c.course_id == Course.id)
            .outerjoin(resources, resources.c.course_id == Course.id)
            .outerjoin(homeworks, homeworks.c.course_id == Course.id)
            .where(Course.is_active.is_(True))
        )

        if request.faculty_id:
            stmt = stmt.where(faculty_id == request.faculty_id)
        if request.kafedra_id:
            stmt = stmt.where(Course.kafedra_id == request.kafedra_id)
        if request.course_type:
            stmt = stmt.where(Course.course_type == request.course_type)
        if request.semester:
            stmt = stmt.where(study_semester == request.semester)
        if request.education_type:
            stmt = stmt.where(education_type.ilike(request.education_type))
        if request.education_form:
            # Guruhda «kunduzgi», rejada «Kunduzgi» — registr ahamiyatsiz.
            stmt = stmt.where(education_form.ilike(f"%{request.education_form}%"))
        if request.fill == "empty":
            stmt = stmt.where(content_count == 0)
        elif request.fill == "filled":
            stmt = stmt.where(content_count > 0)
        if request.search and request.search.strip():
            pattern = f"%{request.search.strip()}%"
            stmt = stmt.where(
                or_(
                    Subject.name.ilike(pattern),
                    Curriculum.name.ilike(pattern),
                    Kafedra.name.ilike(pattern),
                )
            )

        filtered = stmt.subquery()
        summary = (
            await session.execute(
                select(
                    func.count(),
                    func.coalesce(func.sum(filtered.c.topic_count), 0),
                    func.coalesce(func.sum(filtered.c.resource_count), 0),
                    func.coalesce(func.sum(filtered.c.homework_count), 0),
                    func.count().filter(
                        filtered.c.topic_count + filtered.c.resource_count + filtered.c.homework_count == 0
                    ),
                ).select_from(filtered)
            )
        ).one()

        sortable = {
            "kafedra": Kafedra.name,
            "subject": Subject.name,
            "semester": study_semester,
            "topics": topic_count,
            "resources": resource_count,
            "homeworks": homework_count,
        }
        # Standart tartib skrinshotdagidek: kafedra, uning ichida fan, keyin
        # mashg'ulot turi va semestr — bir fanning qatorlari yonma-yon turadi.
        default_order = (
            Kafedra.name.asc().nulls_last(),
            Subject.name.asc(),
            Course.course_type.asc(),
            study_semester.asc().nulls_last(),
            Course.id.asc(),
        )
        stmt = (
            stmt.order_by(*order_by_clause(sortable, request.sort_by, request.order, default_order, Course.id))
            .offset(request.offset)
            .limit(request.limit)
        )
        rows = (await session.execute(stmt)).mappings().all()

        return CourseStatsResponse(
            total=summary[0],
            page=request.page,
            limit=request.limit,
            # SUM Postgres'da `numeric` qaytaradi — butun songa aniq keltiriladi.
            summary=CourseStatsSummary(
                course_count=summary[0],
                topic_count=int(summary[1]),
                resource_count=int(summary[2]),
                homework_count=int(summary[3]),
                empty_course_count=summary[4],
            ),
            rows=[CourseStatsRow.model_validate(dict(row)) for row in rows],
        )


get_course_stats_repository = CourseStatsRepository()
