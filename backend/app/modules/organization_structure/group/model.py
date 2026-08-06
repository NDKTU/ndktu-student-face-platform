from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.student.model import Student
    from app.modules.auth.user.model import User
    from app.modules.organization_structure.speciality.model import Speciality
    from app.modules.quiz.quiz.model import Quiz
    from app.modules.quiz.result.model import Result


# Формы обучения. Sirtqi остаётся в словаре: заочное обучение в вузах
# Узбекистана прекращено, но записи прошлых лет должны читаться. Из выпадающих
# списков его убирает фронтенд, а не база.
#
# Дублируется как Literal в organization_structure/group/schemas.py — менять
# нужно оба места разом. Значение ENUM'а из типа не удалить (PostgreSQL этого
# не умеет), так что новое добавлять можно, а старое — только перестать
# предлагать.
EDUCATION_FORMS = ("Kunduzgi", "Kechki", "Masofaviy", "Sirtqi")

education_form_enum = Enum(*EDUCATION_FORMS, name="education_form")


class Group(Base, IdIntPk, TimestampMixin):
    __tablename__ = "groups"

    # RESTRICT, а не SET NULL: у группы есть студенты, и удаление специальности
    # не должно оставлять их в записи, которая ни к какому факультету больше не
    # относится. Раньше рядом лежал ещё faculty_id — второй, независимый путь к
    # факультету, который ничто не держало в согласии с этим: группу можно было
    # перевести на чужой факультет одним UPDATE, и дерево со списком групп
    # начинали отвечать по-разному.
    speciality_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("specialities.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), unique=True)

    # Форма обучения — свойство группы, а не студента и не специальности.
    # «8-24 ENI» — это кундузги-группа целиком; у специальности же форм может
    # быть несколько, а её name UNIQUE и двух строк под одно направление не даёт.
    education_form: Mapped[str | None] = mapped_column(education_form_enum, nullable=True)

    # Курс обучения (1..N). У выпущенных групп остаётся последним.
    kurs: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Староста. SET NULL, а не каскад: отчисление старосты не должно уносить
    # с собой группу. Ссылка на students, а не на users, — старостой бывает
    # только студент, и учётки у него может не быть.
    sardor_student_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    speciality: Mapped["Speciality"] = relationship("Speciality", back_populates="groups")
    # foreign_keys обязателен: между groups и students теперь две связи
    # (students.group_id и groups.sardor_student_id), и без указания
    # SQLAlchemy не знает, по какой из них строить состав группы.
    students: Mapped[list["Student"]] = relationship(
        "Student", back_populates="group", foreign_keys="Student.group_id"
    )

    quizzes: Mapped[list["Quiz"]] = relationship("Quiz", back_populates="group")

    results: Mapped[list["Result"]] = relationship("Result", back_populates="group")

    group_teachers: Mapped[list["GroupTeacher"]] = relationship(
        "GroupTeacher", back_populates="group", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.name


class GroupTeacher(Base, IdIntPk, TimestampMixin):
    __tablename__ = "group_teachers"
    __table_args__ = (UniqueConstraint("group_id", "teacher_id", name="idx_unique_group_teacher"),)

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    group: Mapped["Group"] = relationship("Group", back_populates="group_teachers")
    teacher: Mapped["User"] = relationship("User", back_populates="group_teachers")

    def __str__(self):
        return f"{self.group_id} - {self.teacher_id}"
