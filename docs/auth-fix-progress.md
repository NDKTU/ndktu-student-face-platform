# `auth` modulini tuzatish — bajarilgan ish va qolgani

Bu fayl ish boshqa kompyuterda davom ettirilishi uchun yozildi. To‘liq reja
(sabablari bilan) `~/.claude/plans/i-got-question-what-keen-peach.md` da edi —
u mashinaga bog‘liq, shuning uchun muhimi shu yerga ko‘chirildi.

Vetka: `feat/lms-frontend-migration`. Migratsiya boshi: **`d47a1c6e2f80`**.

> **Bazadagi ma’lumot sarflanadigan.** Uni istalgan vaqtda o‘chirib,
> `scripts/seed_mock_data.py` bilan qayta to‘ldirsa bo‘ladi. Migratsiyaning
> mavjud qatorlarga qulayligi hech qachon dalil emas.

---

## Bajarildi

### 1-bosqich — uchta 500 qaytaruvchi endpoint

| Endpoint | Nima qilindi |
|---|---|
| `GET /api/students/with-users` | `student/repository.py` dan mavjud bo‘lmagan `user.is_active` olib tashlandi |
| `GET /api/teacher-assignment/` | `TeacherInfo` ismni `teacher.employee.full_name` dan oladi (`model_validator(mode="before")`), repozitoriyga `selectinload(Teacher.employee)` qo‘shildi |
| `GET /api/teacher/assigned_subjects/by-user/{id}` | `selectinload` qo‘shildi — `MissingGreenlet` yo‘qoldi |

### 2-bosqich — `Employee` modeli · migratsiya `c92f4a17be03`

- `status` va `last_login_at` o‘chirildi (ikkalasi ham hech qachon ishlatilmagan)
- `full_name` dagi `UNIQUE` olib tashlandi
- `gender` → umumiy PostgreSQL `ENUM` (`Erkak`/`Ayol`), `employees` **va** `students` uchun.
  Ta’rifi: `backend/app/core/database/enums.py`
- `position_title` → `job_titles` jadvali + `employees.job_title_id`.
  Yangi modul: `backend/app/modules/auth/job_title/` (to‘liq CRUD, prefiks `/job-title`)
- Frontend: `EmployeeStatus` va «Holati» ustuni ketdi; `EmployeeModal` ga gender va
  lavozim `select` lari; `pages/foydalanuvchilar/LavozimlarTab.tsx` +
  `features/lavozimlar/` + `shared/api/lavozimlar.ts` qo‘shildi

Tekshirildi: `position_title` ning 65/65 qiymati `job_titles` ga ko‘chdi,
`downgrade` qaytarib beradi.

### 3-bosqich — `Curriculum` dagi o‘qituvchi · migratsiya `d47a1c6e2f80`

Backend:

- `teacher_user_id` (→`users.id`) → **`teacher_id`** (→`teachers.id`)
- `teacher_name` ustuni o‘chirildi — ism `teachers → employees` joini bilan keladi
  (`CurriculumResponse.name_from_teacher`)
- 352/352 qator toza ko‘chdi

Frontend:

- `Kafedra.teachers` **butunlay olib tashlandi** — u har doim `[]` edi, ya’ni
  reja formasidagi o‘qituvchi ro‘yxati hech qachon to‘lmagan
- `shared/api/tuzilma.ts` ga `fetchKafedraTeachers(kafedraId)` qo‘shildi
  (`GET /teacher/?kafedra_id=`), `RejaPage` uni kafedra almashganda yuklaydi
- `RejaFanDraft.oqituvchi: string` → `teacherId: string`;
  `TeacherOption` endi `{id, display}`
- `createRejaRow` / `updateRejaRow` `teacher_id` yuboradi
- `RejaRow` ga `teacherId: number | null` qo‘shildi
- `reja.json` ga `noTeacher` («Tayinlanmagan») kaliti

`npx tsc --noEmit` toza, `npx vitest run` — 202/202 o‘tdi.

### 4-bosqich — indekslar va ruxsat tekshiruvi · `d47a1c6e2f80`

Bazada tasdiqlandi (`pg_indexes`): `ix_user_roles_user_id`, `ix_user_roles_role_id`,
`ix_role_permissions_role_id`, `ix_role_permissions_permission_id`,
`ix_students_user_id`, `ix_students_group_id`, `ix_teachers_kafedra_id`.

`core/dependencies/role_checker.py` dagi «huquq mavjudmi» so‘rovi asosiy yo‘ldan
olib tashlandi — endi u faqat 403 chiqqanda bajariladi, «Restart the app to sync
permissions» matni saqlanib qoldi.

### 5-bosqich — rol nomi · `d47a1c6e2f80`

`roles_name_key` o‘rniga `uq_roles_name_lower` — `UNIQUE (lower(name))`. Bazada bor.

---

## Qolgani

### A. `curriculum/repository.py::update_row` dagi ikkita xato — YANGI TOPILDI

Bular 3-bosqichdan **oldin ham bor edi**, lekin `teacher_id` ishlay boshlagach
ko‘rinib qoldi. Ikkalasi ham `backend/app/modules/organization_structure/curriculum/repository.py:157-160`:

```python
for field in ("semester", "credit", "teacher_id", "position"):
    value = getattr(data, field)
    if value is not None:
        setattr(row, field, value)
```

**A1. `teacher_id: null` e’tiborsiz qoldiriladi.** `if value is not None` sababli
o‘qituvchini olib tashlab bo‘lmaydi. Frontend endi «Tayinlanmagan» ni yuboradi —
ya’ni bu yo‘l foydalanuvchiga ochiq va ishlamaydi. To‘g‘risi:
`data.model_dump(exclude_unset=True)` bo‘yicha yurish, ya’ni «yuborilmagan» bilan
«ataylab `null`» ni ajratish.

**A2. Javobdagi `teacher_name` bir so‘rov ortda qoladi.** `update_row` oxirida
`get_row` chaqiriladi, lekin `Curriculum` obyekti sessiya identity-map’ida qolgani
uchun `selectinload(Curriculum.teacher)` eski bog‘lanishni qaytaradi.

Takrorlash (355 — sinov qatori):

```
PUT /api/curriculum/355  {"teacher_id": 5}
  → teacher_id 5, teacher_name «Olimova Sevara…»   ← bu 2-o‘qituvchining ismi
PUT /api/curriculum/355  {"teacher_id": null}
  → teacher_id 5 (o‘zgarmadi), teacher_name «Xolmatov Farrux…»  ← endi 5-niki
```

Yechimi: `commit()` dan keyin `session.expire(row)` yoki `get_row` da
`populate_existing()`.

Tuzatilgandan keyin yuqoridagi ikki `PUT` ni qaytadan bosib ko‘rish kerak.

### B. `project.drawio`

Faylda hozir `User`, `UserRole`, `Role`, `RolePermission`, `Permission`,
`Employee`, `Student` bor. Qo‘shiladi:

- **`Teacher`** — `id`, `kafedra_id`, `employee_id`
- **`TeacherAssignment`** — `id`, `teacher_id`, `subject_id`, `group_id`
- **`JobTitle`** — `id`, `name`
- **`Employee`** dagi `position_id` → **`job_title_id`** (nomi noto‘g‘ri yozilgan)

**Bog‘lanish chiziqlari chizilmaydi** — bu talab. Mavjud beshta jadval va
ular orasidagi to‘rtta chiziq tegilmaydi.

### C. Yakuniy tekshiruv

```bash
# Model va baza ajralmaganini tekshirish — bo‘sh upgrade() chiqishi shart
docker exec nusmt_backend sh -c "cd /face/app && uv run alembic revision --autogenerate -m check"
# tekshirgandan keyin bu vaqtinchalik migratsiya o‘chiriladi

cd backend && uv run ruff check app
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run && npx vite build
```

Endpointlar bo‘ylab: `/employee/`, `/employee/{id}`, `/employee/{id}/sensitive`,
`/permission/`, `/role/`, `/teacher/`, `/teacher/ranking/*`, `/user/`, `/user/me`,
`/user/role-counts`, `/students/`, `/students/with-users`, `/students/{id}/sensitive`,
`/teacher-assignment/`, `/job-title/`.
`/employee/me` admin uchun 404 — bu to‘g‘ri, adminda xodim kartochkasi yo‘q.

Brauzerda: `/foydalanuvchilar` — xodim formasidagi gender va lavozim `select` lari,
«Lavozimlar» tabi; `/reja` — o‘qituvchi tanlash, saqlashdan keyin ismning to‘g‘ri
ko‘rinishi va «Tayinlanmagan» ni tanlab saqlay olish (A1 tuzatilgandan keyin).

---

## Ishlamaydigan tekshiruvlar — bu ishga bog‘liq emas

Ikkalasi ham bu ish boshlanishidan **oldin ham** buzuq edi (alohida `git worktree`
da `HEAD` ga o‘tib tekshirildi):

- `cd backend && uv run pytest` — umuman ishga tushmaydi: `drop_all` da
  `CircularDependencyError`, `groups.sardor_student_id` ↔ `students.group_id`
  sikli `use_alter` talab qiladi
- `cd frontend && npm run verify` — lint bosqichida yiqiladi: 45 ta
  `i18next/no-literal-string`, hammasi tegilmagan fayllarda

Shuning uchun frontend `npx tsc` / `npx vitest` / `npx vite build` bilan alohida
tekshiriladi.

---

## Bu ishga kirmaydi (ataylab)

- **`GroupTeacher.teacher_id` ni `teachers.id` ga ko‘chirish** — ~50 joyda o‘qiladi
  va ko‘pincha `current_user.id` bilan solishtiriladi. Alohida ish
- **`TeacherAssignment` ni yagona manbaga aylantirish** — avval uning o‘zi
  to‘ldiriladigan bo‘lishi kerak, hozir frontend uni chaqirmaydi
- **`Employee`/`Student` dagi 11 ta takrorlangan maydon** (umumiy `Person`)
- **Rol nomi bo‘yicha avtorizatsiya (F05)** — `group/repository.py:107`,
  `course/lesson/repository.py:174`, `course/assignment/repository.py:44`
- **HEMIS paroli** — har HEMIS logini bizdagi parolni qayta yozadi
  (`user/repository.py:327`). Qayd etildi, qaror qabul qilinmadi
- `Employee.image_url` va `Student.image_path` nomlaridagi nomuvofiqlik
