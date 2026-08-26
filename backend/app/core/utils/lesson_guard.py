"""Защита проведённых занятий от каскадного удаления.

``lessons.teacher_subject_id`` — ``ON DELETE RESTRICT``: связку
преподаватель-предмет, по которой уже проведены занятия, удалить нельзя, иначе
вместе с ней молча исчезла бы история занятий (именно так вело себя прежнее
``ON DELETE CASCADE``).

База остановит такое удаление сама, но ``IntegrityError`` доходит до вызывающего
неотличимым от падения — 500 без объяснений. Поэтому препятствие проверяется
заранее и возвращается осмысленным 409; ``except IntegrityError`` на месте
удаления остаётся страховкой на случай гонки.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement


async def ensure_no_lessons(session: AsyncSession, entity: str, *teacher_subject_filters: ColumnElement[bool]) -> None:
    """Бросает 409, если по отбираемым связкам уже есть занятия.

    ``entity`` — то, что удаляют, в виде подлежащего для сообщения:
    «bu o'qituvchi», «bu fan». ``teacher_subject_filters`` — условия, которые
    выбирают удаляемые строки ``teacher_subject``.
    """
    # Импорт внутри функции: модели тянут за собой половину приложения, а
    # core-утилита не должна навязывать этот порядок импорта.
    from app.modules.auth.model import TeacherSubject
    from app.modules.course.model import Lesson

    lesson_count = (
        await session.execute(
            select(func.count(Lesson.id)).where(
                Lesson.teacher_subject_id.in_(select(TeacherSubject.id).where(*teacher_subject_filters))
            )
        )
    ).scalar() or 0

    if lesson_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{entity} bo'yicha {lesson_count} ta dars yozilgan. Dars tarixi yo'qolmasligi uchun "
                f"avval shu darslarni o'chiring, keyin qaytadan urinib ko'ring."
            ),
        )
