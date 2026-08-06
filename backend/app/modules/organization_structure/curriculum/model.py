from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.teacher.model import Teacher
    from app.modules.organization_structure.speciality.model import Speciality
    from app.modules.quiz.subject.model import Subject


class Curriculum(Base, IdIntPk, TimestampMixin):
    """Строка учебного плана: один предмет в одном семестре специальности.

    Это отдельная сущность, а не связка Speciality↔Subject: у одного предмета
    в разных семестрах разное число кредитов и, как правило, разный ведущий.
    """

    __tablename__ = "curriculum"
    __table_args__ = (
        # Один и тот же предмет не может стоять в одном семестре дважды.
        UniqueConstraint(
            "speciality_id", "subject_id", "semester", name="idx_unique_curriculum_row"
        ),
    )

    speciality_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("specialities.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # RESTRICT: удаление фана, стоящего в чьём-то плане, должно быть осознанным.
    subject_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Денормализованное название: план — это документ, и строка в нём должна
    # читаться даже после того, как справочник фанов переименовали.
    subject_name: Mapped[str] = mapped_column(String(255), nullable=False)

    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    credit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Ссылка на карточку преподавателя, а не на учётку: у студента учётка тоже
    # есть, и teacher_user_id позволял поставить ведущим кого угодно. Снимка
    # имени рядом больше нет — ФИО приходит join'ом через employees, так что
    # переименование сотрудника сразу видно в плане.
    teacher_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True
    )

    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    speciality: Mapped["Speciality"] = relationship("Speciality", back_populates="curriculum")
    teacher: Mapped["Teacher | None"] = relationship("Teacher")
    subject: Mapped["Subject | None"] = relationship("Subject")

    def __str__(self):
        return f"{self.subject_name} ({self.semester}-semestr)"
