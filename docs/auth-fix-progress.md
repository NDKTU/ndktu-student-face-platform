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

### 6-bosqich — `curriculum` dagi ikkita xato (topildi va tuzatildi)

Ikkalasi ham 3-bosqichdan **oldin ham** bor edi, lekin `teacher_id` ishlay
boshlagach ko‘rinib qoldi. Har ikkisi
`backend/app/modules/organization_structure/curriculum/repository.py` da.

**`teacher_id: null` e’tiborsiz qolardi.** Yangilash `if value is not None`
bo‘yicha yurar edi, ya’ni o‘qituvchini olib tashlab bo‘lmasdi — frontend esa
«Tayinlanmagan» ni aynan `null` qilib yuboradi. Endi
`data.model_dump(exclude_unset=True)` ishlatiladi: «yubormadi» va «ataylab `null`»
ajratiladi. `null` faqat `teacher_id` uchun ma’noli, qolgan uch ustun `NOT NULL`.

**Javobdagi `teacher_name` bir so‘rov ortda qolardi.** Sessiya
`expire_on_commit=False` bilan ishlaydi, shuning uchun `commit()` dan keyin qator
identity-map’da yuklangan bog‘lanishlari bilan qolar, `get_row` esa uni o‘sha
holicha qaytarardi. `get_row` ga `.execution_options(populate_existing=True)`
qo‘shildi.

Tekshirildi (355 — sinov qatori, tuzatishdan keyin):

```
POST teacher_id=2            → 2    | Olimova Sevara…
PUT  {"teacher_id": 5}       → 5    | Xolmatov Farrux…      ← ism darhol to‘g‘ri
PUT  {"teacher_id": null}    → None | None                  ← olib tashlash ishlaydi
PUT  {"credit": 4}           → None | None, credit 4        ← qolgani tegilmaydi
PUT  {"teacher_id":9,"credit":6} → 9 | Ergasheva Sevara…
```

### 7-bosqich — modellar bilan bazaning ajralib qolgani (topildi va tuzatildi)

4- va 5-bosqich bazani migratsiya orqali o‘zgartirgan, lekin **modellarga
yozilmagan** edi. `alembic revision --autogenerate` buni darhol ko‘rsatdi: u
o‘sha yettita indeksni va `uq_roles_name_lower` ni **o‘chirishni** taklif qildi.

Modellar to‘g‘rilandi:

- `index=True` — `UserRole.user_id`, `UserRole.role_id`,
  `RolePermission.role_id`, `RolePermission.permission_id`,
  `Student.user_id`, `Student.group_id`, `Teacher.kafedra_id`
- `Role.name` dan `unique=True` olib tashlandi, o‘rniga:
  `__table_args__ = (Index("uq_roles_name_lower", text("lower(name)"), unique=True),)`
  — `func.lower("name")` yaramaydi, u `lower('name')` degan satr literalini beradi

Shundan keyin `autogenerate` bo‘sh `upgrade()` berdi.

> **Sabab shu yerda qoladi:** migratsiya yozganda modelni ham o‘zgartirish shart.
> Bo‘sh `autogenerate` — buni tutadigan yagona tekshiruv.

### 8-bosqich — `project.drawio`

Bajarildi. Qo‘shildi: **`Teacher`** (`id`, `kafedra_id`, `employee_id`),
**`TeacherAssignment`** (`id`, `teacher_id`, `subject_id`, `group_id`),
**`JobTitle`** (`id`, `name`). `Employee` dagi `position_id` → **`job_title_id`**.

Bog‘lanish chiziqlari chizilmadi — `edge="1"` soni oldingidek 4 ta.

---

## Tekshiruv natijalari

| Nima | Natija |
|---|---|
| `alembic revision --autogenerate` | bo‘sh `upgrade()` ✓ (vaqtinchalik fayl o‘chirildi) |
| `auth` endpointlari (22 ta) | hammasi 200 ✓ |
| `/teacher/ranking/{overall,faculty,kafedra}` | 200 ✓ (yo‘l `/ranking/overall`, `/ranking` emas) |
| `/employee/me` admin uchun | 404 — to‘g‘ri, adminda xodim kartochkasi yo‘q |
| `uv run ruff check app` | 89 → **8** xato; qolgani 8 ta `E501`, hammasi shu ishdan oldin ham bor edi |
| `npx tsc --noEmit` | toza ✓ |
| `npx vitest run` | 202/202 ✓ |
| `npx vite build` | o‘tdi ✓ (chunk hajmi haqidagi ogohlantirish eski) |

**Brauzerda (Playwright, `localhost:3000`):**

- `/reja` → Konchilik Ishi → 1-semestr: o‘qituvchi ismlari join orqali to‘g‘ri
  chiqadi; «Fan qo‘shish» dagi `select` kafedraning 3 ta o‘qituvchisi bilan
  to‘lgan va boshida «Tayinlanmagan» turadi. Sinov qatori o‘qituvchi tanlab
  saqlandi, kartochkada ism to‘g‘ri ko‘rindi, keyin o‘chirildi (352 qator).
  **Bu ro‘yxat ilgari hech qachon to‘lmagan** — `Kafedra.teachers` doim `[]` edi.
- `/foydalanuvchilar` → «Xodimlar»: «Lavozim» ustuni `job_titles` dan keladi,
  «Holati» ustuni yo‘q. «Lavozimlar» tabi 11 ta yozuvni CRUD menyusi bilan
  ko‘rsatadi. «Yangi xodim» formasida «Jinsi» (`Erkak`/`Ayol`) va «Lavozim»
  (`Tanlanmagan` + ma’lumotnoma) `select` lari bor, `status` maydoni yo‘q.

Yo‘l-yo‘lakay bitta kosmetik xato tuzatildi: tanlash ro‘yxatidagi ismlarga
`displayName()` qo‘llanar va u «oʻgʻli»/«qizi» ni ham bosh harf bilan yozardi —
kartochkalardagi ism bilan mos kelmasdi. Endi ism serverdan qanday kelsa, shunday
ko‘rsatiladi.

---

## Muhit haqida — vaqt yo‘qotmaslik uchun

**Backend manbasi konteynerga bind-mount qilinmagan**, obrazga qotirilgan.
Shuning uchun `docker restart nusmt_backend` kod o‘zgarishini **olmaydi**. Kerak:

```bash
docker compose up -d --build backend        # to‘liq, sekin
# yoki bitta fayl uchun:
docker cp backend/app/<yo'l> nusmt_backend:/face/app/<yo'l> && docker restart nusmt_backend
```

Bu bir marta chalg‘itdi: tuzatish yozilgan, lekin test eski kodni sinagan.

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
