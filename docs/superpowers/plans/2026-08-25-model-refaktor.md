# Backend model refaktori — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (tavsiya etiladi) yoki superpowers:executing-plans — rejani vazifa-ma-vazifa bajaring. Qadamlar `- [ ]` checkbox sintaksisida.

**Maqsad:** Backend SQLAlchemy modellarini `docs/db-models.drawio` fayldagi yangi sxemaga keltirish: `Employee`, `Department`, `LessonResult` o'chiriladi; `TeacherAssignment`/`GroupTeacher`/`SubjectTeacher` o'rniga `TeacherGroup` + `TeacherSubject`; `Assignment` → `Homework`; bir nechta ustun qo'shiladi/olib tashlanadi.

**Arxitektura:** Har bir o'zgarish uchun alohida Alembic migratsiyasi yoziladi (autogenerate emas — qo'lda, chunki ma'lumot ko'chirish kerak). Modul chegaralari saqlanadi: model → schemas → repository → router tartibida tahrirlanadi. Har bir vazifa oxirida testlar yashil bo'lishi va `alembic upgrade head` + `alembic downgrade -1` ishlashi shart.

**Tech Stack:** FastAPI, SQLAlchemy 2.x (async, `Mapped`/`mapped_column`), Alembic, PostgreSQL, Pydantic v2, pytest + pytest-asyncio, uv.

**Spec:** `docs/db-models.drawio` (30 ta model, aloqasiz ER-diagramma) — ushbu reja shu fayldagi sxemani kod bilan moslashtiradi.

---

## Global Constraints

- Migratsiyalar **qo'lda** yoziladi, `--autogenerate` faqat tekshirish uchun. Har bir migratsiyada ishlaydigan `downgrade()` bo'lishi shart.
- Ma'lumot yo'qotmaslik qoidasi: jadval `DROP` qilinishidan oldin kerakli ustunlar yangi jadvalga `INSERT ... SELECT` bilan ko'chiriladi.
- Alembic ishga tushirish katalogi: `backend/app` (u yerda `alembic.ini`). Buyruq: `cd backend/app && uv run alembic ...`. Docker orqali: `docker exec nusmt_backend sh -c "cd /face/app && uv run alembic ..."`.
- Testlar: `cd backend && uv run pytest app/test -q`. Testlar alohida test bazasida `Base.metadata.create_all` bilan ishlaydi (`app/test/conftest.py:85`), ya'ni migratsiyalarni tekshirmaydi — migratsiya alohida tekshiriladi.
- Yangi model yozganda mavjud uslubga rioya qiling: `Base, IdIntPk, TimestampMixin[, ExternalRefMixin]`, `__table_args__` ichida `UniqueConstraint` + `external_ref_index("<table>")`.
- Permission'lar startupda route'lardan avtomatik topiladi (`app/core/lifespan/discovery.py`), qo'lda ro'yxatga qo'shish shart emas. Endpoint o'chirilsa, permission yetim qoladi — bu kutilgan holat.
- Har bir vazifa oxirida alohida commit. Commit message formati: `refactor(<modul>): <nima>`.

---

## Qabul qilingan qarorlar

Bular drawio'da ko'rinmaydigan, lekin refaktordan kelib chiqadigan oqibatlar. Hammasi kelishilgan — quyida faqat ijrochi bilishi shart bo'lgan holat qayd etilgan.

1. **`hemis_id` `Teacher`ga ko'chadi.** O'qituvchining HEMIS orqali kirishi aynan shu maydon bo'yicha odamni topadi (`app/modules/auth/hemis/service.py:93`); u yo'qolsa, kirish ishlamaydi.
2. **O'qituvchi bo'lmagan xodimlar zerkal qilinmaydi.** EduPlan `/staff/` sync endi faqat `is_teacher=True` bo'lganlarni oladi — `Teacher`da boshqalar uchun joy yo'q.
3. **Yuklama uchligi yo'qoladi.** `TeacherAssignment` ikkiga bo'lingach, (o'qituvchi, predmet, guruh) uchligi saqlanmaydi: `load_types`/`semester_type` `teacher_subject` ga yoziladi va bir predmet bo'yicha barcha guruhlar birlashtiriladi.
4. **`position`, `staff_type`, `phone_number` o'chadi** — backenddan ham, frontenddan ham.
5. **Davomat yo'qoladi.** `LessonResult` bilan birga `attendance` (`present`/`absent`/`late`) ham ketadi, faqat baho emas.
6. **`teacher_group.teacher_id` → `teachers.id`.** Eski `group_teachers.teacher_id` `users.id` ga qaragan, `subject_teachers.teacher_id` esa `teachers.id` ga — migratsiyada birinchisi ikkinchisiga tarjima qilinadi.
7. **Ustun nomlari o'zgarmaydi.** `Teacher.image_url` shu nomda qoladi (drawio'da ham shunday yangilangan).
8. **`QuestionType` ning faqat `QUIZ` a'zosi ishlaydi.** `Question` jadvalida qat'iy `option_a`…`option_d` va bir harfli `correct_option` bor; `TRUE_FALSE`, `MULTI_SELECT`, `TYPE_ANSWER`, `PUZZLE` uchun bu shakl mos emas. Task 1 da ustun qo'shiladi va qiymatlar tekshiriladi, saqlash sxemasi o'zgarmaydi — uni JSONB'ga o'tkazish alohida reja.

---

## Fayl tuzilishi (nima o'zgaradi)

**O'chiriladigan kataloglar:**
- `backend/app/modules/auth/employee/` — butun modul (repository, schemas)
- `backend/app/modules/auth/teacher_assignment/` — butun modul
- `backend/app/modules/organization_structure/department/` — butun modul

**Nomi o'zgaradigan katalog:**
- `backend/app/modules/course/assignment/` → `backend/app/modules/course/homework/`

**Tahrirlanadigan asosiy fayllar:**
- `backend/app/modules/auth/model.py` — `Employee` o'chadi, `Teacher` kengayadi, `TeacherAssignment` → `TeacherSubject`
- `backend/app/modules/organization_structure/model.py` — `Department`, `GroupTeacher` o'chadi, `TeacherGroup` qo'shiladi
- `backend/app/modules/quiz/model.py` — `SubjectTeacher` o'chadi, `Subject.credits` o'chadi, `Question.question_type` va `Quiz.quiz_type` qo'shiladi
- `backend/app/modules/course/model.py` — `LessonResult` o'chadi, `Assignment`→`Homework`, `Lesson` ustunlari
- `backend/app/core/database/models_registry.py` — barcha o'zgarishlar aks etadi
- Router'lar: `auth/router.py`, `organization_structure/router.py`, `course/router.py`
- EduPlan: `integration/eduplan/{service,repository,schemas,workload_service}.py`

**Yangi fayl:** `backend/app/core/enums.py` — `EducationType`, `QuestionType`, `QuizType`.

**Yangi migratsiyalar:** `backend/app/migrations/versions/` ichida 8 ta fayl.

---

### Task 1: Umumiy enum'lar moduli + `Question.question_type` + `Quiz.quiz_type`

Eng mustaqil o'zgarish — boshqa hech nimaga bog'liq emas, shuning uchun birinchi. Uchala enum bitta modulda yashaydi, ikkala yangi ustun bitta migratsiyada qo'shiladi.

**Muhim qaror — enum'lar Postgres tipiga aylanmaydi.** Ustunlar `String(32)` bo'lib qoladi, enum faqat Python tomonida (Pydantic validatsiyasi) ishlaydi. Sabab kod bazasida allaqachon yozilgan: EPOS'dan keladigan qiymatlar uchun `ExternalRefMixin` da «Строкой, а не Enum: добавление нового источника не должно требовать миграции типа в Postgres» deyilgan. `CREATE TYPE` ishlatilsa, har bir yangi tur qo'shilganda `ALTER TYPE` migratsiyasi kerak bo'ladi va EPOS kutilmagan qiymat yuborsa sync `IntegrityError` bilan yiqiladi.

**Files:**
- Create: `backend/app/core/enums.py`
- Modify: `backend/app/modules/quiz/model.py` (`class Question`, `class Quiz`)
- Modify: `backend/app/modules/quiz/question/schemas.py`, `backend/app/modules/quiz/quiz/schemas.py`, `backend/app/modules/quiz/quiz/repository.py`
- Modify: `backend/app/modules/organization_structure/speciality/schemas.py:8`
- Create: `backend/app/migrations/versions/a1b2c3d4e5f6_question_type_quiz_type.py`
- Test: `backend/app/test/test_question.py`, `backend/app/test/test_quiz.py`, `backend/app/test/test_speciality.py`

**Interfaces:**
- Produces: `app.core.enums.{EducationType, QuestionType, QuizType}`; `Question.question_type: Mapped[str]` (default `QuestionType.QUIZ`), `Quiz.quiz_type: Mapped[str]` (default `QuizType.LESSON_QUIZ`).
- ⚠️ `QuestionType` ning `QUIZ` dan boshqa a'zolari hozirgi `Question` jadvalida amalda ishlamaydi — ustun qo'shiladi, saqlash sxemasi o'zgarmaydi (qaror 8).

- [ ] **Step 1: Enum modulini yaratish**

`backend/app/core/enums.py`:

```python
"""Domen bo'ylab umumiy sanoqli qiymatlar.

Ular `str` dan meros oladi, shuning uchun Pydantic ham, SQLAlchemy ham ularni
oddiy satr sifatida qabul qiladi — ustunlar `String` bo'lib qoladi, Postgres
enum tipi yaratilmaydi (yangi a'zo qo'shish migratsiya talab qilmasin uchun).
"""

import enum


class EducationType(str, enum.Enum):
    BACHELOR = "Bakalavr"
    MASTER = "Magistr"
    DOCTORATE = "Doktorantura"


class QuestionType(str, enum.Enum):
    QUIZ = "QUIZ"
    TRUE_FALSE = "TRUE_FALSE"
    MULTI_SELECT = "MULTI_SELECT"
    TYPE_ANSWER = "TYPE_ANSWER"
    PUZZLE = "PUZZLE"


class QuizType(str, enum.Enum):
    LESSON_QUIZ = "LESSON_QUIZ"
    SEMESTER_FINAL = "SEMESTER_FINAL"
    YEAR_PROMOTION = "YEAR_PROMOTION"
    PUBLIC_FREE = "PUBLIC_FREE"
```

- [ ] **Step 2: `Question` ga ustun qo'shish**

`backend/app/modules/quiz/model.py`, `class Question` ichida, `text` maydonidan oldin:

```python
    # Savol turi (QuestionType). Ustun satr sifatida saqlanadi — Postgres enum
    # tipi emas. Diqqat: hozircha faqat "QUIZ" haqiqatan ishlaydi, qolgan
    # turlar uchun option_a..option_d / correct_option shakli mos kelmaydi.
    question_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text(f"'{QuestionType.QUIZ.value}'"),
    )
```

Fayl boshiga importlarni qo'shing:

```python
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, text

from app.core.enums import QuestionType, QuizType
```

- [ ] **Step 3: `Quiz` ga ustun qo'shish**

Shu faylda, `class Quiz` ichida, `title` maydonidan oldin:

```python
    # Nazorat turi (QuizType). Ilgari bu ma'lumot hech qayerda saqlanmagan —
    # testlar faqat nomi bilan farqlangan, shuning uchun ro'yxatni turi
    # bo'yicha filtrlash ham imkonsiz edi.
    quiz_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text(f"'{QuizType.LESSON_QUIZ.value}'"),
    )
```

- [ ] **Step 4: Migratsiya yozish**

```python
"""question_type va quiz_type ustunlari

Revision ID: a1b2c3d4e5f6
Revises: <oxirgi head — `uv run alembic heads` bilan aniqlang>
"""

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "<oxirgi head>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column("question_type", sa.String(32), nullable=False, server_default="QUIZ"),
    )
    op.add_column(
        "quizzes",
        sa.Column("quiz_type", sa.String(32), nullable=False, server_default="LESSON_QUIZ"),
    )


def downgrade() -> None:
    op.drop_column("quizzes", "quiz_type")
    op.drop_column("questions", "question_type")
```

Migratsiyada enum import qilinmaydi — qiymatlar qo'lda yozilgan. Bu ataylab: migratsiya o'z vaqtidagi holatni muzlatib qo'yishi kerak, keyinchalik enum o'zgarsa eski migratsiya ma'nosini yo'qotmasligi uchun.

- [ ] **Step 5: `Question` sxemalari**

`backend/app/modules/quiz/question/schemas.py`:

```python
from app.core.enums import QuestionType
```

- yaratish/yangilash so'rovlariga: `question_type: QuestionType = QuestionType.QUIZ`
- javob sxemasiga: `question_type: QuestionType`

Excel import/export (`question/repository.py:462-486`) ustunlar ro'yxatiga tegmang — u yerda `question_type` yo'q va bu vazifada qo'shilmaydi.

- [ ] **Step 6: `Quiz` sxemalari va ro'yxat filtri**

`backend/app/modules/quiz/quiz/schemas.py`:

```python
from app.core.enums import QuizType
```

- `QuizCreateRequest`, `QuizUpdateRequest`: `quiz_type: QuizType = QuizType.LESSON_QUIZ`
- `QuizResponse` va ro'yxat elementi sxemasi: `quiz_type: QuizType`
- `QuizListRequest`: `quiz_type: Optional[QuizType] = None`

`backend/app/modules/quiz/quiz/repository.py`, `list_quizzes` ichida — filtrni **ikkala** so'rovga qo'ying:

```python
        if request.quiz_type:
            stmt = stmt.where(Quiz.quiz_type == request.quiz_type.value)
            count_stmt = count_stmt.where(Quiz.quiz_type == request.quiz_type.value)
```

`count_stmt` unutilsa, `total` filtrlangan ro'yxatga mos kelmay qoladi — bu kod bazasida allaqachon uchragan xato (`GET /api/role/` dagi `name` filtri).

- [ ] **Step 7: `Speciality.education_type` ni enumga o'tkazish**

`backend/app/modules/organization_structure/speciality/schemas.py` da 8-qatordagi

```python
EDUCATION_TYPES = Literal["Bakalavr", "Magistr"]
```

qatorini o'chiring va uning o'rniga `from app.core.enums import EducationType` qo'ying. `Optional[EDUCATION_TYPES]` yozilgan uchta joyni `Optional[EducationType]` ga o'zgartiring. `blank_education_type_is_none` validatorlari o'z holida qoladi (bo'sh satrni `None` ga aylantiradi).

Ustun turi o'zgarmaydi (`String(32)`), migratsiya kerak emas. Amalda o'zgarish bitta: endi **`Doktorantura`** ham qabul qilinadi. EPOS faqat `Bakalavr`/`Magistr` yuboradi, `Doktorantura` qo'lda kiritish orqali paydo bo'ladi.

- [ ] **Step 8: Testlar yozish (avval qizil bo'lishi kerak)**

`backend/app/test/test_question.py` oxiriga:

```python
@pytest.mark.asyncio
async def test_question_type_defaults_to_quiz(async_client, test_question):
    response = await async_client.get(f"/question/{test_question['id']}")
    assert response.status_code == 200
    assert response.json()["question_type"] == "QUIZ"
```

`backend/app/test/test_quiz.py` oxiriga:

```python
@pytest.mark.asyncio
async def test_quiz_type_defaults_and_filters(async_client, admin_token, test_quiz):
    detail = await async_client.get(f"/quiz/{test_quiz['id']}", headers=admin_token)
    assert detail.json()["quiz_type"] == "LESSON_QUIZ"

    empty = await async_client.get("/quiz/?quiz_type=SEMESTER_FINAL", headers=admin_token)
    assert empty.status_code == 200
    assert empty.json()["total"] == 0

    matching = await async_client.get("/quiz/?quiz_type=LESSON_QUIZ", headers=admin_token)
    assert matching.json()["total"] == 1


@pytest.mark.asyncio
async def test_quiz_type_rejects_unknown_value(async_client, admin_token, test_quiz_payload):
    payload = {**test_quiz_payload, "quiz_type": "MIDTERM"}
    response = await async_client.post("/quiz/", json=payload, headers=admin_token)
    assert response.status_code == 422
```

`backend/app/test/test_speciality.py` oxiriga:

```python
@pytest.mark.asyncio
async def test_speciality_accepts_doctorate(async_client, admin_token, test_kafedra):
    response = await async_client.post(
        "/speciality/",
        json={"name": "Sun'iy intellekt", "kafedra_id": test_kafedra["id"], "education_type": "Doktorantura"},
        headers=admin_token,
    )
    assert response.status_code == 201
    assert response.json()["education_type"] == "Doktorantura"
```

(`test_question` / `test_quiz` / `test_quiz_payload` / `admin_token` / `test_kafedra` fixture nomlarini shu fayllardagi mavjudlari bilan moslang.)

- [ ] **Step 9: Testlarni ishga tushirish**

`cd backend && uv run pytest app/test/test_question.py app/test/test_quiz.py app/test/test_speciality.py -q`
Kutilgan: yashil.

- [ ] **Step 10: Migratsiyani tekshirish**

`cd backend/app && uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`
Kutilgan: uchala buyruq xatosiz.

- [ ] **Step 11: Commit**

```bash
git add backend/app/core/enums.py backend/app/modules backend/app/migrations/versions backend/app/test
git commit -m "feat(quiz): add QuestionType and QuizType, share EducationType enum"
```
---

### Task 2: `Subject.credits` ni o'chirish

**Files:**
- Modify: `backend/app/modules/quiz/model.py:35`
- Modify: `backend/app/modules/quiz/subject/schemas.py`, `backend/app/modules/quiz/subject/repository.py`
- Modify: `backend/app/modules/integration/eduplan/service.py:296,514`, `.../schemas.py`, `.../repository.py`
- Create: `backend/app/migrations/versions/b2c3d4e5f6a7_drop_subject_credits.py`

**Interfaces:**
- Consumes: —
- Produces: `Subject` modelida `credits` yo'q; EduPlan sync `credits` ni o'qimaydi va yozmaydi.

- [ ] **Step 1: Modeldan ustunni olib tashlash**

`backend/app/modules/quiz/model.py` dan quyidagi qatorni o'chiring:

```python
    credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

- [ ] **Step 2: EduPlan sync'dan `credits` ni olib tashlash**

`backend/app/modules/integration/eduplan/service.py` da `_external_items` ichidagi `subject` bo'limidan `"credits": s.credits,` qatorini o'chiring. Shu faylda `changes.get("credits")` ishlatilgan joyni (taxminan 514-qator) ham o'chiring. `schemas.py` dagi `EduPlanSubject.credits` maydonini qoldiring (EPOS javobida bor, faqat biz yozmaymiz) yoki o'chiring — ikkalasi ham to'g'ri; oddiylik uchun o'chiring va `repository.py` dagi `credits` yozuvini ham olib tashlang.

- [ ] **Step 3: Grep bilan qoldiqni tekshirish**

`grep -rn "credits" backend/app --include=*.py | grep -v migrations`
Kutilgan: bo'sh.

- [ ] **Step 4: Migratsiya**

```python
def upgrade() -> None:
    op.drop_column("subjects", "credits")


def downgrade() -> None:
    op.add_column("subjects", sa.Column("credits", sa.Integer(), nullable=True))
```

- [ ] **Step 5: Testlar**

`cd backend && uv run pytest app/test -q -k "subject or eduplan"`
Kutilgan: yashil.

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor(subject): drop credits column"
```

---

### Task 3: `Lesson.duration_minutes` ni o'chirish

**Files:**
- Modify: `backend/app/modules/course/model.py` (`class Lesson`)
- Modify: `backend/app/modules/course/lesson/schemas.py`, `backend/app/modules/course/lesson/repository.py`
- Modify: `backend/app/test/test_course_topics.py`, `backend/app/test/test_lesson_group_inherit.py`
- Create: `backend/app/migrations/versions/c3d4e5f6a7b8_drop_lesson_duration.py`

- [ ] **Step 1: Modeldan olib tashlash**

`class Lesson` dan `duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)` qatorini o'chiring.

- [ ] **Step 2: Sxemalar va repository**

`lesson/schemas.py` — `LessonCreateRequest`, `LessonUpdateRequest`, `LessonResponse` dan `duration_minutes` ni olib tashlang.
`lesson/repository.py` — `duration_minutes` yozilgan/o'qilgan barcha joylarni olib tashlang.

- [ ] **Step 3: Testlarni tuzatish**

`test_course_topics.py` va `test_lesson_group_inherit.py` dagi payload'lardan `"duration_minutes": ...` kalitini o'chiring.

- [ ] **Step 4: Migratsiya**

```python
def upgrade() -> None:
    op.drop_column("lessons", "duration_minutes")


def downgrade() -> None:
    op.add_column("lessons", sa.Column("duration_minutes", sa.Integer(), nullable=True))
```

- [ ] **Step 5: Testlar**

`cd backend && uv run pytest app/test -q -k lesson`
Kutilgan: yashil.

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor(lesson): drop duration_minutes"
```

---

### Task 4: `LessonResult` ni to'liq o'chirish

⚠️ Bu bilan **davomat** funksiyasi ham yo'qoladi (qaror 5).

**Files:**
- Modify: `backend/app/modules/course/model.py:191-217` — `class LessonResult` o'chiriladi, `Lesson.results` relationship'i ham
- Modify: `backend/app/modules/course/lesson/schemas.py:129-150` — `LessonResultUpsertItem`, `LessonResultsBulkUpsertRequest`, `LessonResultResponse`, `LessonResultListResponse`, `LessonResultUserInfo`, `ATTENDANCE_VALUES`
- Modify: `backend/app/modules/course/lesson/repository.py` — `list_lesson_results`, `upsert_lesson_results`
- Modify: `backend/app/modules/course/router.py:286-316` — ikkala endpoint
- Modify: `backend/app/core/database/models_registry.py`
- Create: `backend/app/migrations/versions/d4e5f6a7b8c9_drop_lesson_results.py`

- [ ] **Step 1: Router'dan endpoint'larni o'chirish**

`backend/app/modules/course/router.py` dan `GET /{lesson_id}/results` va `PUT /{lesson_id}/results` bloklarini hamda `LessonResultListResponse`, `LessonResultsBulkUpsertRequest` importlarini o'chiring.

- [ ] **Step 2: Repository metodlarini o'chirish**

`lesson/repository.py` dan `list_lesson_results` va `upsert_lesson_results` metodlarini, `LessonResult` importini o'chiring.

- [ ] **Step 3: Sxemalarni o'chirish**

`lesson/schemas.py` dan yuqorida sanab o'tilgan klasslarni va `ATTENDANCE_VALUES` konstantasini o'chiring.

- [ ] **Step 4: Modelni o'chirish**

`course/model.py` dan `class LessonResult` ni butunlay o'chiring. `class Lesson` ichidagi `results: Mapped[list["LessonResult"]] = relationship(...)` qatorini ham o'chiring.

- [ ] **Step 5: Registry'ni yangilash**

`models_registry.py` — `__all__` dan `"LessonResult"` ni va `from app.modules.course.model import (...)` ro'yxatidan `LessonResult` ni o'chiring.

- [ ] **Step 6: Grep**

`grep -rn "LessonResult\|attendance" backend/app --include=*.py | grep -v migrations`
Kutilgan: bo'sh.

- [ ] **Step 7: Migratsiya**

```python
def upgrade() -> None:
    op.drop_table("lesson_results")


def downgrade() -> None:
    op.create_table(
        "lesson_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attendance", sa.String(16), nullable=False),
        sa.Column("grade", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("lesson_id", "user_id", name="uq_lesson_result_per_user"),
    )
```

- [ ] **Step 8: Testlar + commit**

```bash
cd backend && uv run pytest app/test -q
git commit -am "refactor(lesson): remove LessonResult (grading moved to external platform)"
```

---

### Task 5: `Assignment` → `Homework` nomlash

**Files:**
- Rename: `backend/app/modules/course/assignment/` → `backend/app/modules/course/homework/`
- Modify: `backend/app/modules/course/model.py` (`Assignment`, `AssignmentSubmission`)
- Modify: `backend/app/modules/course/router.py` (endpoint'lar, `assignment_router` → `homework_router`)
- Modify: `backend/app/core/database/models_registry.py`
- Create: `backend/app/migrations/versions/e5f6a7b8c9d0_rename_assignment_to_homework.py`

**Interfaces:**
- Produces: `Homework` (`homeworks`), `HomeworkSubmission` (`homework_submissions`, FK ustuni `homework_id`). URL prefiksi `/assignment` → `/homework`. Permission nomlari `*:assignment` → `*:homework` (route'lardan avtomatik topiladi).

- [ ] **Step 1: Katalogni ko'chirish**

```bash
git mv backend/app/modules/course/assignment backend/app/modules/course/homework
```

- [ ] **Step 2: Modelni qayta nomlash**

`course/model.py`:
- `class Assignment(...)` → `class Homework(...)`, `__tablename__ = "homeworks"`
- `class AssignmentSubmission(...)` → `class HomeworkSubmission(...)`, `__tablename__ = "homework_submissions"`
- `assignment_id` ustuni → `homework_id`, `ForeignKey("assignments.id", ...)` → `ForeignKey("homeworks.id", ...)`
- Barcha `relationship("Assignment"...)` / `back_populates` nomlarini moslang (`assignments` → `homeworks`, `submissions` o'zgarmaydi).
- `Lesson` va `Course` ichidagi `assignments` relationship'lari → `homeworks`.

- [ ] **Step 3: Sxemalar va repository**

`course/homework/schemas.py` va `repository.py` da `Assignment` → `Homework`, `assignment_id` → `homework_id`, `AssignmentCreateRequest` → `HomeworkCreateRequest` va h.k. Sinf nomlarini butunlay moslang, yarim yo'lda qoldirmang.

- [ ] **Step 4: Router**

`course/router.py`:
- `assignment_router = APIRouter(prefix="/assignment", tags=[...])` → `homework_router = APIRouter(prefix="/homework", tags=["Homework"])`
- `PermissionRequired("create:assignment")` → `"create:homework"` (va `read:`, `update:`, `delete:` variantlari)
- Router ro'yxatga qo'shilgan joyni (`app/modules/router.py` yoki `course/router.py` oxiri) yangilang.

- [ ] **Step 5: Registry**

`models_registry.py` — `"Assignment"` → `"Homework"`, `"AssignmentSubmission"` → `"HomeworkSubmission"`, importlar ham.

- [ ] **Step 6: Grep**

`grep -rni "assignment" backend/app --include=*.py | grep -v migrations | grep -v teacher_assignment`
Kutilgan: bo'sh (`teacher_assignment` Task 8 da hal qilinadi).

- [ ] **Step 7: Migratsiya**

```python
def upgrade() -> None:
    op.rename_table("assignments", "homeworks")
    op.rename_table("assignment_submissions", "homework_submissions")
    op.alter_column("homework_submissions", "assignment_id", new_column_name="homework_id")


def downgrade() -> None:
    op.alter_column("homework_submissions", "homework_id", new_column_name="assignment_id")
    op.rename_table("homework_submissions", "assignment_submissions")
    op.rename_table("homeworks", "assignments")
```

Eslatma: `rename_table` indeks va constraint nomlarini o'zgartirmaydi (`ix_assignments_course_id` shu nomda qoladi). Bu ishlashga xalaqit bermaydi; agar tozalik kerak bo'lsa, `op.execute("ALTER INDEX ... RENAME TO ...")` qo'shing.

- [ ] **Step 8: Testlar + commit**

```bash
cd backend && uv run pytest app/test -q
git commit -am "refactor(course): rename Assignment to Homework"
```

---

### Task 6: `Department` ni o'chirish

**Files:**
- Delete: `backend/app/modules/organization_structure/department/`
- Modify: `backend/app/modules/organization_structure/model.py:127-140`
- Modify: `backend/app/modules/organization_structure/router.py`
- Modify: `backend/app/modules/integration/eduplan/{service,schemas,repository}.py`
- Modify: `backend/app/modules/auth/model.py` (`Employee.department_id` — Task 7 da baribir o'chadi, lekin bu yerda oldin uzamiz)
- Modify: `backend/app/modules/auth/employee/schemas.py` (`EmployeeDepartmentInfo`)
- Create: `backend/app/migrations/versions/f6a7b8c9d0e1_drop_departments.py`

- [ ] **Step 1: EduPlan sync'dan `department` entity'sini olib tashlash**

`integration/eduplan/service.py`:
- `ENTITY_MODEL` dan `EduPlanEntity.department: Department,` qatorini o'chiring
- `_external_items` dagi `elif entity == EduPlanEntity.department:` blokini o'chiring
- `_summarize` dagi `EduPlanEntity.department: "sections"` moslashuvini o'chiring
- `build_preview` dagi `"sections": await client.sections(),` qatorini o'chiring
- `Department` importini o'chiring

`integration/eduplan/schemas.py`: `EduPlanEntity` enum'idan `department` a'zosini, `EduPlanSection` sxemasini o'chiring.
`integration/eduplan/client.py`: `sections()` metodini o'chiring.

- [ ] **Step 2: Router va modulni o'chirish**

`organization_structure/router.py` dan `department_router` va uning barcha endpoint'larini, importlarini o'chiring.

```bash
git rm -r backend/app/modules/organization_structure/department
```

- [ ] **Step 3: Model**

`organization_structure/model.py` dan `class Department` ni o'chiring.
`auth/model.py` dagi `Employee.department_id` ustunini va `department` relationship'ini o'chiring.
`auth/employee/schemas.py` dan `EmployeeDepartmentInfo` va `EmployeeResponse.department`, `EmployeeCreateRequest.department_id`, `EmployeeUpdateRequest.department_id` ni o'chiring.

- [ ] **Step 4: Registry**

`models_registry.py` — `"Department"` ni `__all__` dan va importdan o'chiring.

- [ ] **Step 5: Grep**

`grep -rni "department" backend/app --include=*.py | grep -v migrations`
Kutilgan: faqat EduPlan `EduPlanDepartment` (bu EPOS'dagi **kafedra**, nomi shunday — tegmang).

- [ ] **Step 6: Migratsiya**

```python
def upgrade() -> None:
    op.drop_column("employees", "department_id")
    op.drop_table("departments")


def downgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("external_id", sa.String(64), nullable=True),
        sa.Column("external_source", sa.String(32), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.add_column("employees", sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True))
```

- [ ] **Step 7: Testlar + commit**

```bash
cd backend && uv run pytest app/test -q
git commit -am "refactor(org): remove Department entity"
```

---

### Task 7: `Employee` ni o'chirib, maydonlarini `Teacher` ga ko'chirish

Bu eng yirik vazifa. Ma'lumot ko'chirish talab qiladi.

**Files:**
- Modify: `backend/app/modules/auth/model.py` — `Employee` o'chadi, `Teacher` qayta yoziladi
- Delete: `backend/app/modules/auth/employee/`
- Modify: `backend/app/modules/auth/teacher/{repository,schemas}.py`
- Modify: `backend/app/modules/auth/router.py` (`employee_router` o'chadi, `teacher_router` kengayadi)
- Modify: `backend/app/modules/auth/user/{repository,schemas,service}.py`
- Modify: `backend/app/modules/auth/hemis/service.py:93`
- Modify: `backend/app/modules/integration/eduplan/{service,repository,workload_service}.py`
- Modify: `backend/app/modules/{course,quiz,organization_structure}/**/repository.py` — `Employee` orqali qilingan join'lar
- Modify: `backend/app/test/{test_employee,test_teacher,test_user_assign_role,test_role_assign_permission,test_result_org_filters}.py`
- Create: `backend/app/migrations/versions/a7b8c9d0e1f2_merge_employee_into_teacher.py`

**Interfaces:**
- Produces yangi `Teacher`:

```python
class Teacher(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "teachers"
    __table_args__ = (
        external_ref_index("teachers"),
        # hemis_id — odamning HEMIS'dagi shaxsiyligi; o'qituvchi login aynan
        # shu bo'yicha topiladi, shuning uchun unikallik majburiy.
        Index(
            "uq_teachers_hemis_id",
            "hemis_id",
            unique=True,
            postgresql_where=text("hemis_id IS NOT NULL"),
        ),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    kafedra_id: Mapped[int | None] = mapped_column(ForeignKey("kafedras.id"), nullable=True)

    last_name: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(255))
    third_name: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(500), index=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hemis_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="teacher")
    kafedra: Mapped["Kafedra | None"] = relationship("Kafedra", back_populates="teachers")

    def __str__(self):
        return self.full_name
```

- [ ] **Step 1: Modelni yozish**

`auth/model.py`: `class Employee` ni butunlay o'chiring, `class Teacher` ni yuqoridagi kod bilan almashtiring. `class User` ichidagi `employee` relationship'ini `teacher` ga o'zgartiring:

```python
    teacher: Mapped["Teacher | None"] = relationship("Teacher", back_populates="user", uselist=False)
```

`Kafedra.teachers` relationship'i o'zgarishsiz qoladi.

- [ ] **Step 2: Migratsiya — ma'lumot bilan**

```python
def upgrade() -> None:
    # 1. Yangi ustunlar (avval nullable, ma'lumot ko'chgach NOT NULL)
    op.add_column("teachers", sa.Column("user_id", sa.Integer(), nullable=True))
    for col in ("last_name", "first_name", "third_name"):
        op.add_column("teachers", sa.Column(col, sa.String(255), nullable=True))
    op.add_column("teachers", sa.Column("full_name", sa.String(500), nullable=True))
    op.add_column("teachers", sa.Column("image_url", sa.String(255), nullable=True))
    op.add_column("teachers", sa.Column("hemis_id", sa.String(64), nullable=True))
    op.add_column("teachers", sa.Column("external_id", sa.String(64), nullable=True))
    op.add_column("teachers", sa.Column("external_source", sa.String(32), nullable=True))
    op.add_column("teachers", sa.Column("synced_at", sa.DateTime(), nullable=True))
    op.add_column("teachers", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")))

    # 2. Employees'dan ma'lumotni ko'chirish
    op.execute("""
        UPDATE teachers t SET
            user_id         = e.user_id,
            last_name       = e.last_name,
            first_name      = e.first_name,
            third_name      = e.third_name,
            full_name       = e.full_name,
            image_url       = e.image_url,
            hemis_id        = e.hemis_id,
            external_id     = e.external_id,
            external_source = e.external_source,
            synced_at       = e.synced_at,
            is_active       = e.is_active
        FROM employees e
        WHERE t.employee_id = e.id
    """)

    # 3. user_id topilmagan yetim qatorlar bo'lsa — o'chiramiz
    op.execute("DELETE FROM teachers WHERE user_id IS NULL")

    # 4. Cheklovlar
    op.alter_column("teachers", "user_id", nullable=False)
    for col in ("last_name", "first_name", "third_name", "full_name"):
        op.alter_column("teachers", col, nullable=False)
    op.create_unique_constraint("uq_teachers_user_id", "teachers", ["user_id"])
    op.create_foreign_key("fk_teachers_user_id", "teachers", "users", ["user_id"], ["id"])
    op.create_index("ix_teachers_full_name", "teachers", ["full_name"])
    op.execute("""
        CREATE UNIQUE INDEX uq_teachers_hemis_id ON teachers (hemis_id)
        WHERE hemis_id IS NOT NULL
    """)
    op.execute("""
        CREATE UNIQUE INDEX uq_teachers_external_ref ON teachers (external_source, external_id)
        WHERE external_id IS NOT NULL
    """)

    # 5. Eski bog'lanish va jadval
    op.drop_column("teachers", "employee_id")
    op.drop_table("employees")


def downgrade() -> None:
    raise NotImplementedError(
        "Employee -> Teacher birlashuvi qaytarilmaydi: o'qituvchi bo'lmagan xodimlar yo'qoladi"
    )
```

⚠️ Bu migratsiya **o'qituvchi bo'lmagan xodimlarni o'chiradi** (`employees` da `teachers` qatori yo'q bo'lganlar). Ishlab chiqarish bazasida bajarishdan oldin `make backup-database`.

- [ ] **Step 3: Employee modulini o'chirish**

```bash
git rm -r backend/app/modules/auth/employee
```

`auth/router.py` dan `employee_router` va uning 8 ta endpoint'ini (`router.py:688-780`) o'chiring. `POST /employee/upload_image` o'rniga `POST /teacher/upload_image` yarating — mavjud kod `EmployeeRepository.upload_image` dan `TeacherRepository` ga ko'chiriladi (`save_image(file, settings.profile_upload_dir)`).

- [ ] **Step 4: Teacher repository'ni qayta yozish**

`auth/teacher/repository.py`:
- `_eager_load_options()` endi shunday:

```python
    @staticmethod
    def _eager_load_options():
        return (
            selectinload(Teacher.kafedra),
            selectinload(Teacher.user).selectinload(User.roles),
        )
```

(`GroupTeacher`/`SubjectTeacher` selectinload'lari Task 8 da tiklanadi.)

- `create_teacher` endi `Employee` qidirmaydi, balki eski `EmployeeRepository.create_employee` mantig'ini oladi: `User` yaratadi (`get_user_repository.create_user(..., commit=False)`), so'ng `Teacher` yozadi. `full_name` ni `f"{last_name} {first_name} {third_name}"` dan hosil qiladi.
- `list_teachers` dagi `stmt.join(Teacher.employee).where(Employee.full_name.ilike(...))` → `stmt.where(Teacher.full_name.ilike(...))`.
- `update_teacher` endi ism maydonlarini ham yangilaydi va `full_name` ni qayta hisoblaydi.

- [ ] **Step 5: Teacher sxemalari**

`auth/teacher/schemas.py`: `TeacherCreateRequest` endi `employee_id` emas, balki `username`, `password`, `roles`, `first_name`, `last_name`, `third_name`, `image_url`, `kafedra_id` oladi (eski `EmployeeCreateRequest` dan ko'chiring, `department_id`/`phone_number` siz). `TeacherResponse` ga `first_name`/`last_name`/`third_name`/`full_name`/`image_url`/`hemis_id` qo'shing, `employee` ichki obyektini o'chiring.

- [ ] **Step 6: HEMIS login**

`auth/hemis/service.py:93` ni almashtiring:

```python
        teacher = (await session.execute(select(Teacher).where(Teacher.hemis_id == hemis_id))).scalar_one_or_none()

        if teacher is None:
            logger.warning("O'qituvchi kirishi %s: hemis_id %s zerkalda topilmadi", data.login, hemis_id)
            raise HTTPException(
                status_code=403,
                detail="Xodim tizimda topilmadi. EduPlan bilan sinxronizatsiyani kuting yoki administratorga murojaat qiling.",
            )
```

Undan keyingi `employee.user` ishlatilgan joylarni `teacher.user` ga o'zgartiring.

- [ ] **Step 7: User modul**

`user/repository.py`:
- 84-qator: `selectinload(User.employee).selectinload(Employee.teacher).selectinload(Teacher.kafedra)` → `selectinload(User.teacher).selectinload(Teacher.kafedra)`
- 162-163 va 211-212 qatorlaridagi `.join(Employee, TeacherModel.employee_id == Employee.id).where(Employee.user_id == user_id)` → `.where(TeacherModel.user_id == user_id)`
- 220-qator: `delete(Employee).where(...)` ni o'chiring (endi `Teacher` o'chirish yetarli)

`user/service.py:134` — xuddi shu tarzda.
`user/schemas.py:120-175` — `EmployeeDetailResponse` → `TeacherDetailResponse`, `UserMeResponse.employee` → `UserMeResponse.teacher`. ⚠️ Bu `/user/me` javob shaklini o'zgartiradi — frontend Task 10 da moslashadi.

- [ ] **Step 8: EduPlan**

`integration/eduplan/service.py`:
- `ENTITY_MODEL`: `EduPlanEntity.employee: Employee` → `EduPlanEntity.teacher: Teacher` (enum a'zosi nomini ham `teacher` ga o'zgartiring)
- `_external_items` dagi `employee` bloki endi **faqat `profile is not None`** bo'lganlarni beradi (qaror 2):

```python
        elif entity == EduPlanEntity.teacher:
            for raw in snapshot["staff"]:
                st = EduPlanStaff.model_validate(raw)
                profile = st.teacher
                if profile is None:
                    continue  # o'qituvchi bo'lmagan xodimlar zerkal qilinmaydi
                yield (
                    str(st.id),
                    st.full_name or st.username,
                    {
                        "username": st.username,
                        "hemis_id": st.hemis_id,
                        "first_name": st.first_name or "",
                        "last_name": st.last_name or "",
                        "third_name": st.third_name or "",
                        "full_name": st.full_name,
                        "kafedra_external_id": (
                            str(profile.department_id) if profile.department_id else None
                        ),
                    },
                    lambda row: row.full_name,
                )
```

`integration/eduplan/repository.py`:
- `load_employees` → `load_teachers`, `select(Teacher).options(selectinload(Teacher.user).selectinload(User.roles))`
- `upsert_employee` → `upsert_teacher`: `is_teacher`, `position`, `staff_type` parametrlari olib tashlanadi; `Employee(...)` o'rniga `Teacher(user_id=user.id, kafedra_id=kafedra_id, ...)`; `_ensure_role(session, user, "teacher")` har doim chaqiriladi.

`integration/eduplan/workload_service.py`:
- `_teacher_map` soddalashadi:

```python
    @staticmethod
    async def _teacher_map(session: AsyncSession) -> dict[str, int]:
        """EduPlan foydalanuvchi identifikatori -> bizdagi teachers.id."""
        stmt = select(Teacher.external_id, Teacher.id).where(
            Teacher.external_source == SOURCE_EDUPLAN,
            Teacher.external_id.is_not(None),
        )
        return {ext_id: local_id for ext_id, local_id in (await session.execute(stmt)).all()}
```

- [ ] **Step 9: Qolgan modullardagi join'lar**

Quyidagi fayllarda `Employee` orqali `full_name` olinadi — hammasini `Teacher.full_name` ga o'zgartiring:
`course/course/repository.py`, `course/lesson/repository.py`, `course/homework/repository.py`, `quiz/question/repository.py`, `quiz/quiz/repository.py`, `quiz/result/repository.py`, `quiz/subject/repository.py`, `organization_structure/faculty/repository.py`, `organization_structure/kafedra/repository.py`.

Har birida qolip bir xil: `.join(Employee, Teacher.employee_id == Employee.id)` — bu join butunlay olib tashlanadi, `Employee.full_name` → `Teacher.full_name`.

- [ ] **Step 10: Registry**

`models_registry.py` — `"Employee"` ni `__all__` dan va importdan o'chiring.

- [ ] **Step 11: Testlar**

`git rm backend/app/test/test_employee.py` (endpoint yo'q) — yoki uni `test_teacher.py` ga birlashtiring: yangi `POST /teacher/` endi user + teacher yaratadi, shuni tekshiring:

```python
@pytest.mark.asyncio
async def test_create_teacher_creates_user_and_profile(async_client, admin_token, test_kafedra):
    payload = {
        "username": "teacher_one",
        "password": "password123",
        "first_name": "Ali",
        "last_name": "Valiyev",
        "third_name": "Aliyevich",
        "kafedra_id": test_kafedra["id"],
        "roles": [{"name": "teacher"}],
    }
    response = await async_client.post("/teacher/", json=payload, headers=admin_token)
    assert response.status_code == 201
    body = response.json()
    assert body["full_name"] == "Valiyev Ali Aliyevich"
    assert body["user_id"] is not None
```

`test_user_assign_role.py`, `test_role_assign_permission.py`, `test_result_org_filters.py`, `test_teacher.py` dagi `employee` fixture'larini yangi `POST /teacher/` ga o'tkazing.

- [ ] **Step 12: Grep**

`grep -rni "employee" backend/app --include=*.py | grep -v migrations`
Kutilgan: bo'sh.

- [ ] **Step 13: To'liq testlar + migratsiya + commit**

```bash
cd backend && uv run pytest app/test -q
cd app && uv run alembic upgrade head
git commit -am "refactor(auth): merge Employee into Teacher"
```

---

### Task 8: `TeacherAssignment` + `GroupTeacher` + `SubjectTeacher` → `TeacherGroup` + `TeacherSubject`

**Files:**
- Modify: `backend/app/modules/auth/model.py` (`TeacherAssignment` → `TeacherSubject`)
- Modify: `backend/app/modules/organization_structure/model.py` (`GroupTeacher` → `TeacherGroup`)
- Modify: `backend/app/modules/quiz/model.py` (`SubjectTeacher` o'chadi)
- Modify: `backend/app/modules/course/model.py` (`Lesson.subject_teacher_id` → `teacher_subject_id`)
- Delete: `backend/app/modules/auth/teacher_assignment/`
- Modify: `auth/router.py`, `auth/teacher/{repository,schemas}.py`, `course/lesson/{repository,schemas}.py`, `course/course/repository.py`, `quiz/{quiz,result,subject}/repository.py`, `organization_structure/{faculty,group,kafedra}/repository.py`, `integration/eduplan/workload_service.py`
- Modify: `backend/app/test/test_quiz_group_teacher.py`
- Create: `backend/app/migrations/versions/b8c9d0e1f2a3_split_teacher_assignment.py`

**Interfaces:**
- Produces:

```python
class TeacherGroup(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "teacher_group"
    __table_args__ = (
        UniqueConstraint("teacher_id", "group_id", name="uq_teacher_group"),
        external_ref_index("teacher_group"),
    )

    teacher_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="teacher_groups")
    group: Mapped["Group"] = relationship("Group", back_populates="teacher_groups")


class TeacherSubject(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "teacher_subject"
    __table_args__ = (
        UniqueConstraint("teacher_id", "subject_id", name="uq_teacher_subject"),
        external_ref_index("teacher_subject"),
    )

    teacher_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # EduPlan yuklamasidagi mashg'ulot turlari (ma'ruza, amaliyot, laboratoriya).
    # Ilgari bular (o'qituvchi, predmet, guruh) uchligiga bog'langan edi; endi
    # guruh ajratilgani uchun barcha guruhlar bo'yicha birlashtiriladi.
    load_types: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    semester_type: Mapped[str | None] = mapped_column(String(32), nullable=True)

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="teacher_subjects")
    subject: Mapped["Subject"] = relationship("Subject", back_populates="teacher_subjects")
```

`Teacher` ga qo'shiladi: `teacher_groups`, `teacher_subjects` relationship'lari.
`Group.group_teachers` → `Group.teacher_groups`. `Subject.subject_teachers` → `Subject.teacher_subjects`. `User.group_teachers` **o'chadi** (endi bog'lanish `Teacher` orqali).

- [ ] **Step 1: Modellarni yozish**

Yuqoridagi ikkita klassni `auth/model.py` ga qo'ying (`TeacherAssignment` o'rniga). `organization_structure/model.py` dan `class GroupTeacher` ni, `quiz/model.py` dan `class SubjectTeacher` ni o'chiring. `Group`, `Subject`, `User`, `Teacher` dagi relationship'larni yuqoridagi ro'yxat bo'yicha moslang.

- [ ] **Step 2: `Lesson` FK'sini o'zgartirish**

`course/model.py`, `class Lesson`:

```python
    teacher_subject_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("teacher_subject.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
```

(eski `subject_teacher_id` ustuni va `subject_teacher` relationship'i o'rniga; relationship nomi `teacher_subject`).

- [ ] **Step 3: Migratsiya — ma'lumot bilan**

```python
def upgrade() -> None:
    # 1. teacher_subject: teacher_assignments dan (guruh bo'yicha yig'ib)
    op.create_table(
        "teacher_subject",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("load_types", postgresql.JSONB(), nullable=True),
        sa.Column("semester_type", sa.String(32), nullable=True),
        sa.Column("external_id", sa.String(64), nullable=True),
        sa.Column("external_source", sa.String(32), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("teacher_id", "subject_id", name="uq_teacher_subject"),
    )
    op.create_index("ix_teacher_subject_teacher_id", "teacher_subject", ["teacher_id"])
    op.create_index("ix_teacher_subject_subject_id", "teacher_subject", ["subject_id"])

    # Eski subject_teachers + teacher_assignments dan birlashtirib ko'chiramiz.
    op.execute("""
        INSERT INTO teacher_subject (teacher_id, subject_id, load_types, semester_type,
                                     external_source, is_active, created_at, updated_at)
        SELECT teacher_id, subject_id,
               (array_agg(load_types) FILTER (WHERE load_types IS NOT NULL))[1],
               max(semester_type),
               max(external_source),
               bool_or(is_active),
               min(created_at), max(updated_at)
        FROM teacher_assignments
        GROUP BY teacher_id, subject_id
    """)
    op.execute("""
        INSERT INTO teacher_subject (teacher_id, subject_id, is_active, created_at, updated_at)
        SELECT st.teacher_id, st.subject_id, true, st.created_at, st.updated_at
        FROM subject_teachers st
        WHERE NOT EXISTS (
            SELECT 1 FROM teacher_subject ts
            WHERE ts.teacher_id = st.teacher_id AND ts.subject_id = st.subject_id
        )
    """)

    # 2. teacher_group
    op.create_table(
        "teacher_group",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(64), nullable=True),
        sa.Column("external_source", sa.String(32), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("teacher_id", "group_id", name="uq_teacher_group"),
    )
    op.create_index("ix_teacher_group_teacher_id", "teacher_group", ["teacher_id"])
    op.create_index("ix_teacher_group_group_id", "teacher_group", ["group_id"])

    op.execute("""
        INSERT INTO teacher_group (teacher_id, group_id, external_source, is_active, created_at, updated_at)
        SELECT teacher_id, group_id, max(external_source), bool_or(is_active), min(created_at), max(updated_at)
        FROM teacher_assignments
        GROUP BY teacher_id, group_id
    """)
    # group_teachers.teacher_id -> users.id bo'lgani uchun teachers.id ga tarjima qilamiz (qaror 6)
    op.execute("""
        INSERT INTO teacher_group (teacher_id, group_id, is_active, created_at, updated_at)
        SELECT t.id, gt.group_id, true, gt.created_at, gt.updated_at
        FROM group_teachers gt
        JOIN teachers t ON t.user_id = gt.teacher_id
        WHERE NOT EXISTS (
            SELECT 1 FROM teacher_group tg
            WHERE tg.teacher_id = t.id AND tg.group_id = gt.group_id
        )
    """)

    # 3. lessons.subject_teacher_id -> teacher_subject_id
    op.add_column("lessons", sa.Column("teacher_subject_id", sa.Integer(), nullable=True))
    op.execute("""
        UPDATE lessons l SET teacher_subject_id = ts.id
        FROM subject_teachers st
        JOIN teacher_subject ts
          ON ts.teacher_id = st.teacher_id AND ts.subject_id = st.subject_id
        WHERE l.subject_teacher_id = st.id
    """)
    op.execute("DELETE FROM lessons WHERE teacher_subject_id IS NULL")
    op.alter_column("lessons", "teacher_subject_id", nullable=False)
    op.create_foreign_key(
        "fk_lessons_teacher_subject_id", "lessons", "teacher_subject",
        ["teacher_subject_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_index("ix_lessons_teacher_subject_id", "lessons", ["teacher_subject_id"])
    op.drop_column("lessons", "subject_teacher_id")

    # 4. Eski jadvallar
    op.drop_table("teacher_assignments")
    op.drop_table("group_teachers")
    op.drop_table("subject_teachers")


def downgrade() -> None:
    raise NotImplementedError("Uchlik (teacher, subject, group) tiklanmaydi — 3-qarorga qarang")
```

Fayl boshida `from sqlalchemy.dialects import postgresql` importini qo'shing.

⚠️ `DELETE FROM lessons WHERE teacher_subject_id IS NULL` — yetim darslar o'chadi. Migratsiyadan oldin `SELECT count(*) FROM lessons l LEFT JOIN subject_teachers st ON st.id = l.subject_teacher_id WHERE st.id IS NULL` bilan tekshiring.

- [ ] **Step 4: `teacher_assignment` modulini o'chirish**

```bash
git rm -r backend/app/modules/auth/teacher_assignment
```

`auth/router.py` dan `teacher_assignment_router` va uning 3 ta endpoint'ini (`router.py:643-680`) o'chiring.

- [ ] **Step 5: Teacher repository'ni yangilash**

`auth/teacher/repository.py`:
- `_eager_load_options()`:

```python
    @staticmethod
    def _eager_load_options():
        return (
            selectinload(Teacher.kafedra),
            selectinload(Teacher.user).selectinload(User.roles),
            selectinload(Teacher.teacher_groups).selectinload(TeacherGroup.group),
            selectinload(Teacher.teacher_subjects).selectinload(TeacherSubject.subject),
        )
```

- `assign_groups` (`POST /teacher/assign_groups`) endi `TeacherGroup(teacher_id=..., group_id=...)` yozadi, ilgari `GroupTeacher(teacher_id=<user_id>)` edi — **so'rov endi `teacher_id` sifatida `teachers.id` kutadi**, `users.id` emas.
- `assign_subjects` endi `TeacherSubject` yozadi.
- `assigned_subjects/by-user/{user_id}` va `assigned_groups/by-user/{user_id}` endpoint'lari `Teacher.user_id == user_id` orqali topadi.
- Ranking so'rovlaridagi (`ranking/faculty`, `ranking/kafedra`) `GroupTeacher`/`SubjectTeacher` join'larini yangi jadvallarga o'tkazing.

- [ ] **Step 6: Qolgan repository'lar**

`GroupTeacher` ishlatilgan: `course/lesson/repository.py`, `organization_structure/{faculty,group,kafedra}/repository.py`, `quiz/{quiz,result}/repository.py`.
`SubjectTeacher` ishlatilgan: `course/{course,lesson}/repository.py`, `quiz/{quiz,result,subject}/repository.py`, `organization_structure/{faculty,kafedra}/repository.py`.

Har birida:
- `GroupTeacher` → `TeacherGroup`, va **muhim**: `GroupTeacher.teacher_id == User.id` shartlari `TeacherGroup.teacher_id == Teacher.id` ga aylanadi; agar so'rov `users.id` dan boshlansa, `.join(Teacher, Teacher.user_id == User.id)` qo'shing.
- `SubjectTeacher` → `TeacherSubject`.

- [ ] **Step 7: Lesson moduli**

`course/lesson/schemas.py` — `subject_teacher_id` → `teacher_subject_id` (barcha request/response sxemalarida).
`course/lesson/repository.py` — ustun nomi va `SubjectTeacher` importi.

- [ ] **Step 8: EduPlan workload sync**

`integration/eduplan/workload_service.py` — `_persist` va `_deactivate_missing` ni ikkita jadvalga yozadigan qilib qayta yozing:

```python
    @staticmethod
    async def _persist(session: AsyncSession, collapsed: dict[tuple[int, int, int], dict]):
        if not collapsed:
            return 0, 0

        # (teacher, subject) va (teacher, group) juftliklariga yoyamiz.
        by_subject: dict[tuple[int, int], dict] = defaultdict(
            lambda: {"load_types": set(), "semester_types": set()}
        )
        pairs_group: set[tuple[int, int]] = set()
        for (teacher_id, subject_id, group_id), bucket in collapsed.items():
            b = by_subject[(teacher_id, subject_id)]
            b["load_types"] |= bucket["load_types"]
            b["semester_types"] |= bucket["semester_types"]
            pairs_group.add((teacher_id, group_id))

        created = updated = 0
        now = utcnow_naive()

        existing_ts = {
            (r.teacher_id, r.subject_id): r
            for r in (await session.execute(select(TeacherSubject))).scalars().all()
        }
        for key, bucket in by_subject.items():
            row = existing_ts.get(key)
            if row is None:
                row = TeacherSubject(teacher_id=key[0], subject_id=key[1])
                created += 1
            else:
                updated += 1
            row.load_types = sorted(bucket["load_types"])
            row.semester_type = ", ".join(sorted(bucket["semester_types"])) or None
            row.external_source = SOURCE_EDUPLAN
            row.synced_at = now
            row.is_active = True
            session.add(row)

        existing_tg = {
            (r.teacher_id, r.group_id): r
            for r in (await session.execute(select(TeacherGroup))).scalars().all()
        }
        for key in pairs_group:
            row = existing_tg.get(key)
            if row is None:
                row = TeacherGroup(teacher_id=key[0], group_id=key[1])
                created += 1
            else:
                updated += 1
            row.external_source = SOURCE_EDUPLAN
            row.synced_at = now
            row.is_active = True
            session.add(row)

        await session.flush()
        return created, updated
```

`_deactivate_missing` ni ham ikkita jadval uchun ikkita to'plam (`present_subjects`, `present_groups`) bilan qayta yozing. `sync()` ichida chaqiruvni moslang.

- [ ] **Step 9: Registry**

`models_registry.py`: `"TeacherAssignment"`, `"GroupTeacher"`, `"SubjectTeacher"` o'rniga `"TeacherGroup"`, `"TeacherSubject"`; importlarni moslang (`TeacherGroup` — `organization_structure.model` dan, `TeacherSubject` — `auth.model` dan).

- [ ] **Step 10: Testlar**

`test_quiz_group_teacher.py` — `GroupTeacher(group_id=..., teacher_id=<user.id>)` yozilgan fixture'ni `TeacherGroup(group_id=..., teacher_id=<teacher.id>)` ga o'tkazing. Yangi test qo'shing:

```python
@pytest.mark.asyncio
async def test_assign_groups_writes_teacher_group(async_client, admin_token, test_teacher, test_group):
    response = await async_client.post(
        "/teacher/assign_groups",
        json={"teacher_id": test_teacher["id"], "group_ids": [test_group["id"]]},
        headers=admin_token,
    )
    assert response.status_code == 200

    listing = await async_client.get(
        f"/teacher/assigned_groups/by-user/{test_teacher['user_id']}", headers=admin_token
    )
    assert [g["id"] for g in listing.json()["groups"]] == [test_group["id"]]
```

- [ ] **Step 11: Grep**

`grep -rn "GroupTeacher\|SubjectTeacher\|TeacherAssignment\|subject_teacher_id" backend/app --include=*.py | grep -v migrations`
Kutilgan: bo'sh.

- [ ] **Step 12: To'liq testlar + migratsiya + commit**

```bash
cd backend && uv run pytest app/test -q
cd app && uv run alembic upgrade head
git commit -am "refactor(teacher): split TeacherAssignment into TeacherGroup and TeacherSubject"
```

---

### Task 9: Frontend — REJADAN CHIQARILDI

**Holat: bajarilmaydi.** Buyurtmachi qarori (2026-08-26): hozircha faqat backend ustida ishlanadi, frontend keyinroq alohida ish sifatida moslashtiriladi.

**Buning oqibati ochiq aytilishi kerak:** bu refaktordan keyin yig'ilgan ilova ishlamaydi. Frontend hali ham mavjud bo'lmagan endpointlarga murojaat qiladi va eski shakldagi ma'lumot yuboradi. Backend o'z-o'zicha to'g'ri va testlar bilan qoplangan, lekin uchidan-uchiga bog'lanish frontend ishi bajarilmaguncha uzilgan bo'ladi.

Frontend ishi uchun to'liq ro'yxat quyida saqlanadi — keyingi reja shu yerdan boshlanadi.

**O'chiriladigan fayllar:** `frontend/src/services/employeeService.ts`, `frontend/src/hooks/useEmployees.ts`, `frontend/src/pages/EmployeesPage.tsx`, `frontend/src/components/employees/EmployeeModal.tsx`, `frontend/src/schemas/employee.ts`

**O'zgartiriladigan fayllar:** `frontend/src/services/teacherService.ts`, `frontend/src/schemas/teacher.ts`, `frontend/src/components/teachers/*.tsx`, `frontend/src/types/auth.ts`, `frontend/src/pages/{ProfilePage,UsersPage,StudentsPage,TeachersPage,LessonDetailPage,CourseDetailPage,EduPlanSyncPage}.tsx`, `frontend/src/components/layout/Navbar.tsx`, `frontend/src/App.tsx`, `frontend/src/services/{lessonService,eduplanService}.ts`, `frontend/src/hooks/{useLessons,useEduPlan}.ts`, `frontend/src/constants/resources.ts`, `frontend/src/components/courses/{CourseFilters,CourseModal,CourseLessonModal}.tsx`, `frontend/src/components/quizzes/{QuizFilters,QuizModal}.tsx`, `frontend/src/components/faculty/KafedraTeachersView.tsx`

**Nomi o'zgaradigan fayllar:** `assignmentService.ts` -> `homeworkService.ts`, `useAssignments.ts` -> `useHomeworks.ts`, `AssignmentFormModal.tsx` -> `HomeworkFormModal.tsx`

**Backend tomonidan kelgan buzuvchi o'zgarishlar ro'yxati (frontend rejasining kirish nuqtasi):**

1. `/employee/*` ning barcha 8 endpointi yo'q. O'rniga: `POST /teacher/` endi user + teacher birgalikda yaratadi; `GET/PUT /teacher/me`; `POST /teacher/upload_image`.
2. `/user/me` javobida `employee` bloki o'rniga `teacher` bloki. Ichida `first_name`, `last_name`, `third_name`, `full_name`, `image_url`, `hemis_id`, `kafedra`. `position`, `staff_type`, `phone_number`, `department` maydonlari umuman yo'q.
3. `/assignment/*` -> `/homework/*`; so'rov maydoni `assignment_id` -> `homework_id`.
4. `/teacher_assignment/*` endpointlari yo'q.
5. `GET/PUT /lesson/{id}/results` yo'q — davomat va baho UI'si olib tashlanishi kerak.
6. `POST /teacher/assign_groups` tanasi: `{"teacher_id": <teachers.id>, "group_ids": [...]}`. Ilgari `user_id` yuborilardi va u `users.id` edi — maydon nomi ham, ma'nosi ham o'zgardi. `teacherService.ts:89` shu sababli buziladi.
7. Dars sxemalarida `subject_teacher_id` -> `teacher_subject_id`.
8. `duration_minutes` (dars) va `credits` (predmet) maydonlari yo'q.
9. Yangi maydonlar: `Question.question_type` (`QuestionType`), `Quiz.quiz_type` (`QuizType`), `Speciality.education_type` endi `Doktorantura` ni ham qabul qiladi.
10. EduPlan sync sahifasidagi entity ro'yxatidan `department` va `employee` chiqarildi, `teacher` qo'shildi.
11. Permission satrlari `*:assignment` -> `*:homework`; `*:department`, `*:employee`, `update:lesson_result` yo'q.

---

### Task 10: Yakuniy tekshiruv

- [ ] **Step 1: Toza bazada migratsiyalar**

```bash
docker compose down -v && docker compose up -d db
cd backend/app && uv run alembic upgrade head
```
Kutilgan: xatosiz, oxirida `alembic current` yagona head ko'rsatadi.

- [ ] **Step 2: Backend testlari to'liq**

```bash
cd backend && uv run pytest app/test -q
```
Kutilgan: 0 failed.

- [ ] **Step 3: Ilova ko'tariladi va Swagger ochiladi**

⚠️ Frontend konteyneri ishlamaydi va ishlamasligi kutiladi (Task 9 rejadan chiqarilgan). Faqat backend'ni tekshiring.

```bash
make up
curl -s localhost:8000/api/openapi.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['paths']), 'endpoint')"
```
Kutilgan: `/employee`, `/department`, `/teacher_assignment`, `/lesson/{id}/results`, `/assignment` yo'q; `/homework`, `/teacher` bor.

- [ ] **Step 4: `docs/db-models.drawio` bilan solishtirish**

`models_registry.py` dagi `__all__` ro'yxati drawio'dagi 30 ta model bilan bir xil ekanini tekshiring (`PsychologyQuestion`/`PsychologyResult` registry'da hech qachon bo'lmagan — ular alohida masala, bu rejaga kirmaydi).

- [ ] **Step 5: API hujjatini yangilash**

`docs/` ichidagi API qo'llanmasida (`c82e2f9` commitida qo'shilgan) o'chirilgan endpoint'lar bo'limlarini olib tashlang, `/homework` va yangilangan `/teacher` bo'limlarini yozing.

- [ ] **Step 6: Yakuniy commit**

```bash
git commit -am "docs: update API guide after model refactor"
```

---

## Rejadan tashqarida qolgan narsalar

- **`Course.teacher_id` → `users.id`** bo'lib qoladi (drawio ham shunday ko'rsatadi). Kodda "o'qituvchi" ba'zan `User`, ba'zan `Teacher` — bu chalkashlik bu refaktorda hal qilinmaydi.
- **`PsychologyQuestion` / `PsychologyResult`** `models_registry.py` da ro'yxatga olinmagan (modul importi orqali metadata'ga tushadi). Alohida masala.
- **`Question` ni JSONB'ga o'tkazish** — `TRUE_FALSE`, `MULTI_SELECT`, `TYPE_ANSWER`, `PUZZLE` turlarini haqiqatan ishlatish uchun kerak (qaror 8). Namuna sifatida `PsychologyQuestion` dagi `content`/`options` maydonlariga qarang.
- **Ishlab chiqarish bazasidagi ma'lumot**: Task 7 va Task 8 migratsiyalari `downgrade()` ni qo'llab-quvvatlamaydi. Har ikkalasidan oldin `make backup-database`.
