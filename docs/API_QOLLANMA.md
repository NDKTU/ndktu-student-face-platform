# NDKTU Platformasi — API qo‘llanmasi

> Versiya: API 1.0.0 · Hujjat sanasi: 2026-08-21 · Endpointlar soni: **159** · Manba: backend OpenAPI spetsifikatsiyasi (avtomatik yig‘ilgan, qo‘lda izohlangan)


## Mundarija

1. [Platforma nima va API nima uchun kerak](#1-platforma-nima-va-api-nima-uchun-kerak)
2. [Arxitektura va manzillar](#2-arxitektura-va-manzillar)
3. [Autentifikatsiya: kirish, token, sessiya](#3-autentifikatsiya-kirish-token-sessiya)
4. [Rollar va ruxsatlar modeli](#4-rollar-va-ruxsatlar-modeli)
5. [Umumiy qoidalar: sahifalash, filtrlar, xatoliklar](#5-umumiy-qoidalar)
6. [Asosiy jarayonlar (qadam-baqadam misollar)](#6-asosiy-jarayonlar)
7. [To‘liq ma’lumotnoma — barcha endpointlar](#7-toliq-malumotnoma)
8. [Yuz orqali nazorat (face-detection) servisi](#8-yuz-orqali-nazorat-servisi)
9. [Tez-tez so‘raladigan savollar](#9-tez-tez-soraladigan-savollar)

---

## 1. Platforma nima va API nima uchun kerak

**NDKTU Platformasi** — Navoiy davlat konchilik va texnologiyalar universiteti uchun yagona ta’lim tizimi: onlayn testlar (yuz orqali nazorat bilan), natijalar tahlili, psixologik metodikalar, darslar va topshiriqlar (LMS), hamda universitet tuzilmasini boshqarish.

**API (backend)** — bu platformaning “yuragi”. Siz brauzerda ko‘radigan sayt (frontend) o‘zi hech narsani saqlamaydi: har bir tugma bosilganda u API’ga so‘rov yuboradi, API esa bazani o‘qiydi/yozadi va javob qaytaradi. API nima uchun alohida hujjatlashtiriladi:

- **Boshqa tizimlar bilan bog‘lanish** — HEMIS, EduPlan, kelajakda mobil ilova yoki boshqa universitet tizimi shu API orqali ishlaydi.
- **Xavfsizlik** — har bir so‘rov kim va nimaga ruxsati borligi tekshiriladi; bu qoidalar shu hujjatda.
- **Mustaqil tekshirish** — Swagger orqali istalgan endpointni frontend’siz sinab ko‘rish mumkin.
- **Sotish va joriy etish** — boshqa universitetga platformani o‘rnatganda integratorga aynan shu hujjat kerak bo‘ladi.

Backend **FastAPI** (Python) da yozilgan, ma’lumotlar **PostgreSQL** da, sessiyalar va kesh **Redis** da.

---

## 2. Arxitektura va manzillar

| Komponent | Vazifasi | Manzil (prod) | Manzil (lokal) |
|---|---|---|---|
| Frontend (React) | Foydalanuvchi interfeysi | `https://lms.nsumt.uz/` | `http://localhost:3100/` |
| **Backend API** | Barcha biznes-mantiq | `https://lms.nsumt.uz/api/...` | `http://localhost:8000/api/...` |
| Swagger UI | Interaktiv hujjat, so‘rovlarni sinash | `https://lms.nsumt.uz/docs` | `http://localhost:8000/docs` |
| ReDoc | O‘qish uchun qulay hujjat | `https://lms.nsumt.uz/redoc` | `http://localhost:8000/redoc` |
| OpenAPI JSON | Mashina o‘qiydigan spetsifikatsiya | `https://lms.nsumt.uz/openapi.json` | `http://localhost:8000/openapi.json` |
| Yuklangan fayllar | Savol rasmlari, dalillar, materiallar | `https://lms.nsumt.uz/uploads/...` | `http://localhost:8000/uploads/...` |
| Face-detection | Kamera orqali nazorat (WebSocket) | `wss://lms.nsumt.uz/v1/video/stream` | `ws://localhost:8001/v1/video/stream` |

Barcha biznes-endpointlar **`/api`** prefiksi ostida. Javoblar — JSON, sanalar — Toshkent vaqti (ISO 8601).

---

## 3. Autentifikatsiya: kirish, token, sessiya

### 3.1. Ikki xil kirish

| Kim | Endpoint | Nima yuboriladi | Qayerdan tekshiriladi |
|---|---|---|---|
| Xodim (admin, o‘qituvchi, psixolog) | `POST /api/user/login` | `username`, `password` | Lokal baza |
| Talaba | `POST /api/hemis/login` | `login` (talaba ID), `password` | HEMIS portali; akkaunt avtomatik yaratiladi |

Xodim HEMIS paroli bilan kirsa ham `hemis/login` ishlatiladi: talaba portali rad etgach, xodimlar portali so‘raladi; lekin xodim **oldindan EduPlan orqali bazada bo‘lishi** shart — yangi akkaunt yaratilmaydi.

### 3.2. Token qanday ishlatiladi

Muvaffaqiyatli kirishda javob:

```json
{ "access_token": "eyJhbGciOi...", "token_type": "bearer" }
```

Keyingi har bir so‘rovga sarlavha qo‘shiladi:

```
Authorization: Bearer eyJhbGciOi...
```

### 3.3. Sessiya qoidalari — bilish muhim

- **Bitta faol sessiya.** Tokenda noyob `jti` bor, u Redis’da `user:session:{user_id}` ostida saqlanadi. Boshqa qurilmadan kirilsa — eski sessiya **darhol** yopiladi (401, frontend `?reason=session` bilan login sahifasiga qaytaradi).
- **Harakatsizlik muddati — 30 daqiqa** (`session_idle_minutes`). Har bir so‘rov muddatni yangilaydi. 30 daqiqa hech narsa qilinmasa — sessiya tugaydi. Frontend 15 daqiqada o‘zi chiqarib yuboradi.
- **Refresh token yo‘q.** Muddat tugasa — qayta kirish.
- `POST /api/user/logout` va parol o‘zgartirish sessiyani darhol bekor qiladi.
- `users.is_active = false` bo‘lgan akkaunt hech qaysi yo‘l bilan kira olmaydi.

### 3.4. Misol — curl

```bash
# 1. Kirish
TOKEN=$(curl -s -X POST https://lms.nsumt.uz/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"***"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 2. O‘zim haqimda
curl -s https://lms.nsumt.uz/api/user/me -H "Authorization: Bearer $TOKEN"

# 3. Fakultetlar ro‘yxati
curl -s "https://lms.nsumt.uz/api/faculty/?page=1&limit=20" -H "Authorization: Bearer $TOKEN"
```

---

## 4. Rollar va ruxsatlar modeli

Tizimda **RBAC** (rolga asoslangan kirish): foydalanuvchi → rollar → ruxsatlar. Har bir endpoint kodda `PermissionRequired("amal:resurs")` bilan himoyalangan. Ruxsat bo‘lmasa — **403**.

Ruxsat nomlari qoidasi: `create:` / `read:` / `update:` / `delete:` + resurs nomi. Maxsus ruxsatlar: `user:me` (o‘z profili), `employee:me`, `quiz_process:*` (test topshirish), `hemis_admin_preview` / `hemis_admin_sync`, `read:eduplan` / `sync:eduplan`, `user_answers:read`.

| Rol | Odatda nima qiladi | Kirishdan keyin qayerga tushadi |
|---|---|---|
| `admin` | Hamma narsa: tuzilma, foydalanuvchilar, integratsiyalar | Boshqaruv paneli |
| `teacher` | Savollar banki, testlar, natijalar, o‘z guruhlari | Savollar |
| `student` | Test topshirish, psixologik testlar, profil | Talaba kabineti |
| `psixologik` | Metodikalar tuzish, natijalarni ko‘rish | Psixologiya |
| `tutor` | Hozircha frontendda ishlatilmaydi | — |

Rollar va ruxsatlar **dinamik**: admin yangi rol yaratib, unga istalgan ruxsatlar to‘plamini biriktira oladi (`/api/role/`, `/api/role/assign_permission`). Frontend menyusi ham foydalanuvchining `read:*` ruxsatlaridan avtomatik quriladi.

### Barcha ruxsatlar ro‘yxati

`create:psychology`, `create:question`, `create:quiz`, `create:submission`, `create:user`, `delete:assignment`, `delete:course`, `delete:department`, `delete:employee`, `delete:faculty`, `delete:group`, `delete:kafedra`, `delete:lesson`, `delete:permission`, `delete:psychology`, `delete:psychology_results`, `delete:question`, `delete:quiz`, `delete:resource`, `delete:result`, `delete:role`, `delete:speciality`, `delete:student`, `delete:subject`, `delete:teacher`, `delete:user`, `employee:me`, `hemis_admin_sync`, `quiz_process:end_quiz`, `quiz_process:start_quiz`, `quiz_process:submit_answer`, `read:active_quiz`, `read:assignment`, `read:course`, `read:department`, `read:eduplan`, `read:employee`, `read:faculty`, `read:group`, `read:kafedra`, `read:lesson`, `read:permission`, `read:psychology`, `read:psychology_results`, `read:question`, `read:quiz`, `read:resource`, `read:result`, `read:role`, `read:speciality`, `read:student`, `read:subject`, `read:submission`, `read:teacher`, `read:user`, `sync:eduplan`, `update:assignment`, `update:course`, `update:department`, `update:employee`, `update:faculty`, `update:group`, `update:kafedra`, `update:lesson`, `update:lesson_result`, `update:permission`, `update:psychology`, `update:quiz`, `update:resource`, `update:role`, `update:speciality`, `update:student`, `update:subject`, `update:submission`, `update:teacher`, `update:user`, `user:me`, `user_answers:read`


---

## 5. Umumiy qoidalar

### 5.1. Sahifalash va filtrlar
Ro‘yxat endpointlari `page` (1 dan) va `limit` parametrlarini qabul qiladi; javobda elementlar massivi va `total` bo‘ladi. Qo‘shimcha filtrlar (masalan, `faculty_id`, `search`, `name`) jadvallarda ko‘rsatilgan.

### 5.2. O‘chirish va `force`
Ko‘p `DELETE` endpointlarida `force` parametri bor. `force=false` (standart) — bog‘liq yozuvlar bo‘lsa xatolik qaytadi; `force=true` — bog‘liq yozuvlar bilan birga o‘chiriladi. Muhim obyektlar uchun oldin `.../delete-info` chaqiring — u nimalar o‘chishini ko‘rsatadi.

### 5.3. EduPlan’dan kelgan yozuvlar
`external_source = "eduplan"` bo‘lgan fakultet/kafedra/guruh/fan/xodim **tahrirlanmaydi va o‘chirilmaydi** — **409 Conflict**. Ularni EduPlan’da o‘zgartiring, keyingi sinxronizatsiyada keladi. Javoblarda `external_id`, `external_source`, `synced_at`, `is_active` maydonlari bor.

### 5.4. Fayl yuklash
Rasm yuklovchi endpointlar faqat haqiqiy rasm fayllarini qabul qiladi (MIME va tarkib tekshiriladi). Javobda `/uploads/...` bilan boshlanuvchi manzil — uni to‘liq URL qilib ishlatish mumkin.

### 5.5. Xatolik kodlari

| Kod | Ma’nosi | Nima qilish kerak |
|---|---|---|
| 400 | Noto‘g‘ri so‘rov (masalan, noto‘g‘ri PIN) | `detail` maydonini o‘qing |
| 401 | Token yo‘q / muddati o‘tgan / sessiya boshqa joyda ochilgan | Qayta kirish |
| 403 | Ruxsat yetarli emas | Rolga kerakli ruxsatni biriktiring |
| 404 | Yozuv topilmadi | ID’ni tekshiring |
| 409 | Ziddiyat: EduPlan yozuvi, takroriy nom, bog‘liq yozuvlar | `detail` da sabab; `force` yoki EduPlan |
| 422 | Validatsiya: majburiy maydon yo‘q, tur noto‘g‘ri | `detail` da aynan qaysi maydon |
| 429 | Juda ko‘p urinish (login, ba’zi yaratish endpointlari) | Biroz kuting |

Xatolik javobi doim `{"detail": "..."}` ko‘rinishida.

---

## 6. Asosiy jarayonlar

### 6.1. Talaba test topshiradi (eng muhim jarayon)

```
1. GET  /api/quiz/active                      → faol testlar ro‘yxati
2. POST /api/quiz_process/start_quiz          {quiz_id, pin}
      ← { result_id, questions[...], remaining_seconds, proctoring_mode, submitted_answers[...] }
3. POST /api/quiz_process/submit_answer       {result_id, question_id, answer_index}   ← har javobda
4. POST /api/quiz_process/end_quiz            {quiz_id, result_id, cheating_detected, reason?, cheating_image_url?}
      ← { total_questions, correct_answers, wrong_answers, grade, cheating_detected }
```

Nima uchun shunday:
- **Variantlar pozitsiya bo‘yicha** yuboriladi (`answer_index` 0–3), matni emas — har talabaga variantlar aralashtirilgan, server o‘zi qaysi tartibni ko‘rsatganini biladi.
- **Har javob darhol saqlanadi** — sahifa yangilansa yoki internet uzilsa, `start_quiz` qayta chaqiriladi va `submitted_answers` bilan avvalgi javoblar tiklanadi.
- **Vaqtni server hisoblaydi** (`remaining_seconds`) — sahifani yangilash qo‘shimcha vaqt bermaydi.
- Proktoring rejimi `face` bo‘lsa, frontend parallel ravishda kamerani face-detection servisiga ulaydi (8-bo‘lim); qoidabuzarlik aniqlansa test avtomatik `end_quiz` bilan yakunlanadi.

### 6.2. O‘qituvchi savol va test yaratadi

```
1. GET  /api/teacher/assigned_subjects/by-user/{user_id}   → qaysi fanlar biriktirilgan
2. POST /api/question/upload_image  (rasm kerak bo‘lsa)    ← /uploads/questions/<uuid>.png
3. POST /api/question/              {text(HTML), option_a..d, correct_option, subject_id}
   yoki POST /api/question/upload_excel?subject_id=..      (Excel’dan ommaviy)
4. GET  /api/quiz/available-questions?lecturer_id=&subject_id=  → savol yetarlimi?
5. POST /api/quiz/                  {title, subject_id, group_id, lecturer_id, question_number, duration, proctoring_mode}
      ← test PIN bilan; faollashtirish — PUT /api/quiz/{id} {is_active:true}
6. GET  /api/result/?quiz_id=...    → natijalar;  GET /api/user_answers/?result_id=... → savolma-savol
```

Testni qayta o‘tkazish (2-urinish) — `POST /api/quiz/{id}/repeat`: yangi PIN, eski natijalar saqlanadi.

### 6.3. Admin talabalarni HEMIS’dan import qiladi

```
1. POST /api/hemis/preview   {admin HEMIS login/parol, filtrlar}   → ro‘yxat, hech narsa yozilmaydi
2. POST /api/hemis/sync      {xuddi shu}                            → bazaga yoziladi
```

### 6.4. Admin tuzilmani EduPlan’dan sinxronlaydi

```
1. GET  /api/integration/eduplan/status    → yoqilganmi, ulanish bormi
2. POST /api/integration/eduplan/preview   → takliflar: create / link / update / unchanged / conflict / deactivate  (+ run_id, 1 soat)
3. POST /api/integration/eduplan/apply     {run_id, decisions[...]}  → konfliktlar uchun admin qarori bilan qo‘llash
4. POST /api/integration/eduplan/workloads → o‘qituvchi yuklamalari → biriktirishlar
```

Muhim: guruh nomlari ikki tizimda bir xil yozilishi kerak (`33A-25 KEM` ≠ `33 a-25 kem` deb qaralmasligi uchun nomlarni tekislash talab qilinadi), aks holda takliflarning ko‘pi `create` bo‘lib, takrorlar paydo bo‘ladi.

### 6.5. Psixologik test

```
Psixolog:  POST /api/psychology/method/  {name, description, instruction{scoring...}}  → POST /api/psychology/question/ (turi bo‘yicha content/options)
Talaba:    GET  /api/psychology/method/  → POST /api/psychology/test/{method_id}/submit {answers:{id:qiymat}}
Psixolog:  GET  /api/psychology/test/results/?method_id=&faculty_id=&group_id=
```

---

## 7. To‘liq ma’lumotnoma

Belgilar: `*` — majburiy maydon/parametr. «Ruxsat» — endpointni chaqirish uchun zarur ruxsat (`ochiq` — tokensiz ishlaydi).


### 7.1. Foydalanuvchilar va kirish (`User`)

Tizimdagi har bir akkaunt. Xodimlar login/parol bilan, talabalar HEMIS orqali kiradi. Bir akkaunt — **bitta faol sessiya**: boshqa qurilmadan kirilsa, avvalgisi yopiladi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/user/login` | `ochiq` | Xodim (admin/o‘qituvchi/psixolog) uchun tizimga kirish — login va parol bilan. Javobda `access_token` qaytadi. | — | `username`*: string, `password`*: string |
| `GET` | `/api/user/me` | `employee:me` | Joriy foydalanuvchi profili: rollar, ruxsatlar, talaba/xodim ma’lumotlari. Frontend har yuklanishda chaqiradi. | — | — |
| `POST` | `/api/user/logout` | `user:me` | Sessiyani yopish — Redis’dagi sessiya o‘chiriladi, token darhol yaroqsiz bo‘ladi. | — | — |
| `PUT` | `/api/user/me/credentials` | `user:me` | O‘z login/parolini o‘zgartirish (joriy parol talab qilinadi). Keyin qayta kirish kerak. | — | `current_password`*: string, `new_username`: string, `new_password`: string |
| `POST` | `/api/user/` | `create:quiz` | Yangi foydalanuvchi yaratish. | — | `username`*: string, `password`*: string, `roles`*: object[] |
| `GET` | `/api/user/` | `user_answers:read` | Foydalanuvchilar ro‘yxati (sahifalab, filtrlar bilan). | `page`, `limit`, `username` | — |
| `GET` | `/api/user/{user_id}` | `read:user` | Foydalanuvchi ma’lumotini olish. | `user_id`* | — |
| `PUT` | `/api/user/{user_id}` | `update:user` | Foydalanuvchini tahrirlash. | `user_id`* | `username`: string, `password`: string |
| `DELETE` | `/api/user/{user_id}` | `delete:user` | Foydalanuvchini o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `user_id`*, `force` | — |
| `POST` | `/api/user/assign_role` | `create:user` | Foydalanuvchiga rol biriktirish. | — | `user_id`*: integer, `role_ids`*: integer[] |

### 7.2. Rollar (`Role`)

Rol — ruxsatlar to‘plami. Asosiy rollar: `admin`, `teacher`, `student`, `psixologik`, `tutor`. Rolni foydalanuvchiga `assign_role` bilan biriktirasiz.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/role/` | `create:quiz` | Yangi rol yaratish. | — | `name`*: string |
| `GET` | `/api/role/` | `user_answers:read` | Rollar ro‘yxati (sahifalab, filtrlar bilan). | `page`, `limit`, `name` | — |
| `GET` | `/api/role/{role_id}` | `read:role` | Rol ma’lumotini olish. | `role_id`* | — |
| `PUT` | `/api/role/{role_id}` | `update:role` | Rolni tahrirlash. | `role_id`* | `name`*: string |
| `DELETE` | `/api/role/{role_id}` | `delete:role` | Rolni o‘chirish. | `role_id`* | — |
| `POST` | `/api/role/assign_permission` | `update:role` | Rolga ruxsat biriktirish. | — | `role_id`*: integer, `permission_ids`*: integer[] |

### 7.3. Ruxsatlar (`Permission`)

Ruxsat `amal:resurs` ko‘rinishida (`read:quiz`, `create:question`). Har bir endpoint aynan bitta ruxsatni talab qiladi — jadvallarda ko‘rsatilgan.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/permission/` | `create:quiz` | Yangi ruxsat yaratish. | — | `name`*: string |
| `GET` | `/api/permission/` | `user_answers:read` | Ruxsatlar ro‘yxati (sahifalab, filtrlar bilan). | `page`, `limit`, `name` | — |
| `GET` | `/api/permission/{permission_id}` | `read:permission` | Ruxsat ma’lumotini olish. | `permission_id`* | — |
| `PUT` | `/api/permission/{permission_id}` | `update:permission` | Ruxsatni tahrirlash. | `permission_id`* | `name`*: string |
| `DELETE` | `/api/permission/{permission_id}` | `delete:permission` | Ruxsatni o‘chirish. | `permission_id`* | — |

### 7.4. Talabalar (`Students`)

Talabalar HEMIS’dan keladi (import yoki birinchi kirishda). Qo‘lda yaratilmaydi — shuning uchun bu yerda `POST` yo‘q.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `GET` | `/api/students/with-users` | `read:student` | Talabalar ro‘yxati ularning foydalanuvchi akkauntlari bilan birga. | `page`, `limit`, `search`, `user_id`, `group_id` | — |
| `GET` | `/api/students/` | `user_answers:read` | Talabalar ro‘yxati (sahifalab, filtrlar bilan). | `page`, `limit`, `search`, `user_id`, `group_id` | — |
| `GET` | `/api/students/{student_id}` | `read:student` | Talaba ma’lumotini olish. | `student_id`* | — |
| `PUT` | `/api/students/{student_id}` | `update:student` | Talabani tahrirlash. | `student_id`* | `first_name`: string, `last_name`: string, `third_name`: string, `full_name`: string, `student_id_number`: string, `image_path`: string, `birth_date`: string, `phone`: string, `gender`: string, `university`: string, `specialty`: string, `student_status`: string, `education_form`: string, `education_type`: string, `payment_form`: string, `education_lang`: string, `faculty`: string, `level`: string, `semester`: string, `address`: string, `avg_gpa`: number, `user_id`: integer, `group_id`: integer |
| `DELETE` | `/api/students/{student_id}` | `delete:student` | Talabani o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `student_id`*, `force` | — |

### 7.5. O‘qituvchilar (`Teacher`)

O‘qituvchi — xodimning (`employee`) o‘qitish roli. Fan va guruhlar biriktiriladi, shular asosida savollar banki, testlar va reyting ishlaydi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/teacher/` | `create:quiz` | Yangi o‘qituvchi yaratish. | — | `employee_id`*: integer, `kafedra_id`*: integer |
| `GET` | `/api/teacher/` | `user_answers:read` | O‘qituvchilar ro‘yxati (sahifalab, filtrlar bilan). | `full_name`, `kafedra_id`, `page`, `limit` | — |
| `GET` | `/api/teacher/{teacher_id}` | `read:teacher` | O‘qituvchi ma’lumotini olish. | `teacher_id`* | — |
| `PUT` | `/api/teacher/{teacher_id}` | `update:teacher` | O‘qituvchini tahrirlash. | `teacher_id`* | `kafedra_id`*: integer |
| `DELETE` | `/api/teacher/{teacher_id}` | `delete:teacher` | O‘qituvchini o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `teacher_id`*, `force` | — |
| `POST` | `/api/teacher/assign_groups` | `update:teacher` | O‘qituvchiga guruhlarni biriktirish. | — | `user_id`*: integer, `group_ids`*: integer[] |
| `POST` | `/api/teacher/assign_subjects` | `update:teacher` | O‘qituvchiga fanlarni biriktirish. | — | `teacher_id`*: integer, `subject_ids`*: integer[] |
| `GET` | `/api/teacher/assigned_subjects/by-user/{user_id}` | `user:me` | Foydalanuvchi (o‘qituvchi) ga biriktirilgan fanlar — savollar banki va testlar shu ro‘yxatdan ishlaydi. | `user_id`* | — |
| `GET` | `/api/teacher/assigned_groups/by-user/{user_id}` | `user:me` | O‘qituvchiga biriktirilgan guruhlar. | `user_id`* | — |
| `GET` | `/api/teacher/ranking/overall` | `read:teacher` | O‘qituvchilar reytingi (Bayes vaznli baho — past talabali o‘qituvchi bitta yuqori baho bilan yuqoriga chiqib ketmaydi). Filtrlar: fakultet, kafedra, guruh. | `faculty_id`, `kafedra_id`, `group_id`, `search`, `page`, `limit` | — |
| `GET` | `/api/teacher/ranking/faculty` | `read:teacher` | Fakultetlar reytingi — o‘rtacha natija bo‘yicha. | `page`, `limit` | — |
| `GET` | `/api/teacher/ranking/kafedra` | `read:teacher` | Kafedralar reytingi — o‘rtacha natija bo‘yicha. | `page`, `limit` | — |

### 7.6. O‘qituvchi biriktirishlari (`TeacherAssignment`)

O‘qituvchi – fan – guruh uchligi. EduPlan yuklamalaridan avtomatik yaratilishi ham mumkin.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/teacher-assignment/` | `create:quiz` | Yangi topshiriq yaratish. | — | `teacher_id`*: integer, `subject_id`*: integer, `group_id`*: integer |
| `GET` | `/api/teacher-assignment/` | `user_answers:read` | Topshiriqlar ro‘yxati (sahifalab, filtrlar bilan). | `teacher_id`, `subject_id`, `group_id`, `page`, `limit` | — |
| `DELETE` | `/api/teacher-assignment/{assignment_id}` | `delete:assignment` | Topshiriqni o‘chirish. | `assignment_id`* | — |

### 7.7. Xodimlar (`Employee`)

Universitet xodimlari (HEMIS `hemis_id` bilan). EduPlan’dan ko‘zgulanadi; HEMIS orqali kirish faqat mavjud xodim uchun ishlaydi — akkaunt avtomatik yaratilmaydi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/employee/` | `create:quiz` | Yangi xodim yaratish. | — | `username`*: string, `password`*: string, `first_name`*: string, `last_name`*: string, `third_name`*: string, `phone_number`: string, `image_url`: string, `department_id`: integer, `roles`: object[] |
| `GET` | `/api/employee/` | `user_answers:read` | Xodimlar ro‘yxati (sahifalab, filtrlar bilan). | `full_name`, `page`, `limit` | — |
| `POST` | `/api/employee/upload_image` | `create:question` | Xodim rasmini yuklash (faqat rasm fayllari, turi tekshiriladi). | — | (form-data) `file`*: fayl |
| `GET` | `/api/employee/me` | `employee:me` | O‘z xodim profilini olish. | — | — |
| `PUT` | `/api/employee/me` | `employee:me` | O‘z xodim profilini tahrirlash. | — | `first_name`*: string, `last_name`*: string, `third_name`*: string, `phone_number`: string, `image_url`: string, `department_id`: integer |
| `GET` | `/api/employee/{employee_id}` | `read:employee` | Xodim ma’lumotini olish. | `employee_id`* | — |
| `PUT` | `/api/employee/{employee_id}` | `update:employee` | Xodimni tahrirlash. | `employee_id`* | `first_name`*: string, `last_name`*: string, `third_name`*: string, `phone_number`: string, `image_url`: string, `department_id`: integer |
| `DELETE` | `/api/employee/{employee_id}` | `delete:employee` | Xodimni o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `employee_id`*, `force` | — |

### 7.8. HEMIS integratsiyasi (`Hemis`)

Talabalar manbai. `login` — talaba kirishi; `preview`/`sync` — admin uchun talabalarni ommaviy import qilish (avval ko‘rib chiqish, keyin yozish).

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/hemis/login` | `ochiq` | Talaba uchun kirish — HEMIS login/paroli bilan. Talaba birinchi marta kirganda akkaunt avtomatik yaratiladi. Xodim HEMIS’i ham shu yerdan (talaba portali rad etsa). | — | `login`*: string, `password`*: string, `faculty_id`: integer, `group_id`: integer |
| `POST` | `/api/hemis/preview` | `sync:eduplan` | HEMIS’dan talabalar ro‘yxatini **ko‘rib chiqish** (hech narsa yozilmaydi) — import oldidan. | — | `login`*: string, `password`*: string, `faculty_id`: integer, `group_id`: integer |
| `POST` | `/api/hemis/sync` | `hemis_admin_sync` | HEMIS’dan talabalarni bazaga import qilish (preview tasdiqlangandan keyin). | — | `login`*: string, `password`*: string, `faculty_id`: integer, `group_id`: integer |

### 7.9. Fakultetlar (`Faculty`)

Tashkiliy tuzilmaning yuqori pog‘onasi. EduPlan’dan kelgan yozuvlar **faqat o‘qish uchun** (tahrirlash 409 qaytaradi).

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/faculty/` | `create:quiz` | Yangi fakultet yaratish. | — | `name`*: string |
| `GET` | `/api/faculty/` | `user_answers:read` | Fakultetlar ro‘yxati (sahifalab, filtrlar bilan). | `name`, `page`, `limit` | — |
| `GET` | `/api/faculty/stats` | `read:faculty` | Har bir fakultet bo‘yicha kafedralar, yo‘nalishlar, guruhlar va talabalar soni — fakultet kartochkalari uchun. | — | — |
| `GET` | `/api/faculty/{faculty_id}` | `read:faculty` | Fakultet ma’lumotini olish. | `faculty_id`* | — |
| `PUT` | `/api/faculty/{faculty_id}` | `update:faculty` | Fakultetni tahrirlash. | `faculty_id`* | `name`*: string |
| `DELETE` | `/api/faculty/{faculty_id}` | `delete:faculty` | Fakultetni o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `faculty_id`*, `force` | — |

### 7.10. Kafedralar (`Kafedra`)

Fakultet ichidagi kafedralar. Diqqat: EduPlan’da bu `department` deb ataladi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/kafedra/` | `create:quiz` | Yangi kafedra yaratish. | — | `name`*: string, `faculty_id`*: integer |
| `GET` | `/api/kafedra/` | `user_answers:read` | Kafedralar ro‘yxati (sahifalab, filtrlar bilan). | `name`, `faculty_id`, `page`, `limit` | — |
| `GET` | `/api/kafedra/{kafedra_id}` | `read:kafedra` | Kafedra ma’lumotini olish. | `kafedra_id`* | — |
| `PUT` | `/api/kafedra/{kafedra_id}` | `update:kafedra` | Kafedrani tahrirlash. | `kafedra_id`* | `name`*: string, `faculty_id`*: integer |
| `DELETE` | `/api/kafedra/{kafedra_id}` | `delete:kafedra` | Kafedrani o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `kafedra_id`*, `force` | — |

### 7.11. Guruhlar (`Group`)

Talabalar guruhlari. O‘chirishdan oldin `delete-info` bilan bog‘liq yozuvlarni tekshiring — natijalar guruhga bog‘langan.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/group/` | `create:quiz` | Yangi guruh yaratish. | — | `name`*: string, `faculty_id`*: integer |
| `GET` | `/api/group/` | `user_answers:read` | Guruhlar ro‘yxati (sahifalab, filtrlar bilan). | `name`, `faculty_id`, `teacher_id`, `page`, `limit` | — |
| `GET` | `/api/group/{group_id}` | `read:group` | Guruh ma’lumotini olish. | `group_id`* | — |
| `PUT` | `/api/group/{group_id}` | `update:group` | Guruhni tahrirlash. | `group_id`* | `name`*: string, `faculty_id`*: integer |
| `DELETE` | `/api/group/{group_id}` | `delete:group` | Guruhni o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `group_id`*, `force` | — |
| `GET` | `/api/group/{group_id}/students` | `read:student` | Guruh talabalari (qidiruv va sahifalash bilan). | `group_id`*, `page`, `limit`, `search` | — |
| `GET` | `/api/group/{group_id}/delete-info` | `read:group` | Guruhni o‘chirishdan oldin nimalar bog‘liqligini ko‘rsatadi (talabalar, testlar, natijalar). | `group_id`* | — |

### 7.12. Mutaxassisliklar (`Speciality`)

Ta’lim yo‘nalishlari (kafedra va fakultetga bog‘langan).

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/speciality/` | `create:quiz` | Yangi mutaxassislik yaratish. | — | `name`*: string, `kafedra_id`*: integer, `education_type`: Bakalavr/Magistr |
| `GET` | `/api/speciality/` | `user_answers:read` | Mutaxassisliklar ro‘yxati (sahifalab, filtrlar bilan). | `name`, `kafedra_id`, `faculty_id`, `page`, `limit` | — |
| `GET` | `/api/speciality/{speciality_id}` | `read:speciality` | Mutaxassislik ma’lumotini olish. | `speciality_id`* | — |
| `PUT` | `/api/speciality/{speciality_id}` | `update:speciality` | Mutaxassislikni tahrirlash. | `speciality_id`* | `name`: string, `kafedra_id`: integer, `education_type`: Bakalavr/Magistr/null |
| `DELETE` | `/api/speciality/{speciality_id}` | `delete:speciality` | Mutaxassislikni o‘chirish. Guruhlari bo‘lsa 409 (`requires_confirmation`) qaytadi — `force=true` bilan takrorlanadi, guruhlar o‘chmaydi, faqat mutaxassislikdan uziladi. | `speciality_id`*, `force` | — |

### 7.13. Bo‘limlar (`Department`)

Ma’muriy bo‘limlar. EduPlan’da bu `section` deb ataladi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/department/` | `create:quiz` | Yangi bo‘lim yaratish. | — | `name`*: string |
| `GET` | `/api/department/` | `user_answers:read` | Bo‘limlar ro‘yxati (sahifalab, filtrlar bilan). | `name`, `page`, `limit` | — |
| `GET` | `/api/department/{department_id}` | `read:department` | Bo‘lim ma’lumotini olish. | `department_id`* | — |
| `PUT` | `/api/department/{department_id}` | `update:department` | Bo‘limni tahrirlash. | `department_id`* | `name`*: string |
| `DELETE` | `/api/department/{department_id}` | `delete:department` | Bo‘limni o‘chirish. | `department_id`* | — |

### 7.14. Fanlar (`Subject`)

O‘quv fanlari. Savollar, testlar va kurslar fanga bog‘lanadi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/subject/` | `create:quiz` | Yangi fan yaratish. | — | `name`*: string |
| `GET` | `/api/subject/` | `user_answers:read` | Fanlar ro‘yxati (sahifalab, filtrlar bilan). | `name`, `page`, `teacher_id`, `limit` | — |
| `GET` | `/api/subject/{subject_id}` | `read:subject` | Fan ma’lumotini olish. | `subject_id`* | — |
| `PUT` | `/api/subject/{subject_id}` | `update:subject` | Fanni tahrirlash. | `subject_id`* | `name`*: string |
| `DELETE` | `/api/subject/{subject_id}` | `delete:subject` | Fanni o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `subject_id`*, `force` | — |

### 7.15. Savollar banki (`Question`)

Har bir savol — HTML matn (rasm bilan bo‘lishi mumkin), 4 variant va to‘g‘ri javob. Savollar **ma’ruzachiga** tegishli; test yaratilganda uning bankidan yig‘iladi. Versiyalanadi: tahrirlansa eski natijalar buzilmaydi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `GET` | `/api/question/download_excel` | `read:question` | Savollarni Excel faylga yuklab olish (fan / muallif / matn bo‘yicha filtr). | `subject_id`, `user_id`, `text` | — |
| `POST` | `/api/question/` | `create:psychology` | Yangi savol yaratish. | — | `subject_id`*: integer, `user_id`*: integer, `text`*: string, `option_a`*: string, `option_b`*: string, `option_c`*: string, `option_d`*: string, `correct_option`: a/b/c/d |
| `GET` | `/api/question/` | `user_answers:read` | Savollar ro‘yxati (sahifalab, filtrlar bilan). | `text`, `subject_id`, `user_id`, `page`, `limit` | — |
| `GET` | `/api/question/{question_id}` | `read:psychology` | Savol ma’lumotini olish. | `question_id`* | — |
| `PUT` | `/api/question/{question_id}` | `update:psychology` | Savolni tahrirlash. | `question_id`* | `subject_id`*: integer, `user_id`*: integer, `text`*: string, `option_a`*: string, `option_b`*: string, `option_c`*: string, `option_d`*: string, `correct_option`: a/b/c/d |
| `DELETE` | `/api/question/{question_id}` | `delete:psychology` | Savolni o‘chirish. | `question_id`* | — |
| `DELETE` | `/api/question/bulk/subject-user` | `delete:question` | Bitta fan va bitta muallifga tegishli **barcha** savollarni ommaviy o‘chirish. Ehtiyot bo‘ling. | — | `subject_id`*: integer, `user_id`*: integer |
| `POST` | `/api/question/upload_image` | `create:question` | Savol matni uchun rasm yuklash — `/uploads/questions/<uuid>.png` manzili qaytadi, uni savol HTML’iga qo‘yasiz. | — | (form-data) `file`*: fayl |
| `POST` | `/api/question/upload_excel` | `create:question` | Savollarni Excel fayldan ommaviy import qilish (fan ko‘rsatiladi). | `subject_id`* | (form-data) `file`*: fayl |

### 7.16. Testlar (`Quiz`)

Test = fan + guruh + ma’ruzachi + savollar soni + davomiylik + PIN + proktoring rejimi (`standard` / `face`). Faollashtirilgan test talabalar ro‘yxatida ko‘rinadi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/quiz/` | `create:quiz` | Yangi test yaratish. | — | `title`*: string, `question_number`*: integer, `duration`*: integer, `pin`*: string, `lecturer_id`: integer, `user_id`: integer, `group_id`: integer, `subject_id`: integer, `is_active`: boolean, `proctoring_mode`: face/standard |
| `GET` | `/api/quiz/` | `user_answers:read` | Testlar ro‘yxati (sahifalab, filtrlar bilan). | `title`, `user_id`, `created_by_user_id`, `group_id`, `subject_id`, `is_active`, `proctoring_mode`, `page`, `limit`, `sort_dir` | — |
| `GET` | `/api/quiz/available-questions` | `create:quiz` | Tanlangan ma’ruzachi va fan bo‘yicha nechta savol mavjudligi — test yaratishda savollar yetarlimi, tekshirish uchun. | `lecturer_id`*, `subject_id`* | — |
| `GET` | `/api/quiz/active` | `read:active_quiz` | Hozir faol testlar — talaba shu ro‘yxatdan testni tanlaydi. | `title`, `user_id`, `created_by_user_id`, `group_id`, `subject_id`, `is_active`, `proctoring_mode`, `page`, `limit`, `sort_dir` | — |
| `GET` | `/api/quiz/{quiz_id}` | `read:quiz` | Test ma’lumotini olish. | `quiz_id`* | — |
| `PUT` | `/api/quiz/{quiz_id}` | `update:quiz` | Testni tahrirlash. | `quiz_id`* | `title`*: string, `question_number`*: integer, `duration`*: integer, `pin`*: string, `lecturer_id`: integer, `user_id`: integer, `group_id`: integer, `subject_id`: integer, `is_active`: boolean, `proctoring_mode`: face/standard |
| `DELETE` | `/api/quiz/{quiz_id}` | `delete:quiz` | Testni o‘chirish (`force=true` — bog‘liq yozuvlar bilan birga). | `quiz_id`*, `force` | — |
| `GET` | `/api/quiz/{quiz_id}/delete-info` | `read:quiz` | Testni o‘chirishdan oldin bog‘liq natijalar sonini ko‘rsatadi. | `quiz_id`* | — |
| `POST` | `/api/quiz/{quiz_id}/repeat` | `create:quiz` | Testni qayta yaratish (2-urinish): yangi PIN bilan nusxa, eski natijalar saqlanadi. | `quiz_id`* | — |
| `POST` | `/api/quiz/upload` | `create:quiz` | Test uchun rasm yuklash. | — | (form-data) `file`*: fayl |

### 7.17. Test topshirish jarayoni (`Quiz Process`)

Talaba tomonidan ishlatiladigan 4 ta endpoint. Tartib: `start_quiz` → har javobga `submit_answer` → `end_quiz`. Vaqt serverda hisoblanadi, urinish uzilsa davom ettiriladi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/quiz_process/start_quiz` | `quiz_process:start_quiz` | Talaba testni boshlaydi: `quiz_id` + `pin`. Javobda savollar (har talabaga variantlar tartibi aralashtirilgan), `result_id`, `remaining_seconds`, uzilgan urinish bo‘lsa — avval berilgan javoblar. Vaqtni **server** hisoblaydi. | — | `quiz_id`*: integer, `pin`*: string |
| `POST` | `/api/quiz_process/submit_answer` | `quiz_process:submit_answer` | Bitta savolga javob: `result_id`, `question_id`, `answer_index` (variant **pozitsiyasi**, matni emas). Har bosishda darhol yuboriladi va baholanadi — sahifa yangilansa javoblar yo‘qolmaydi. | — | `result_id`*: integer, `question_id`*: integer, `answer_index`: integer, `answer`: string |
| `POST` | `/api/quiz_process/end_quiz` | `quiz_process:end_quiz` | Testni yakunlash — natija hisoblanadi. Proktoring qoidabuzarlik aniqlagan bo‘lsa `cheating_detected`, sabab va dalil rasmi manzili yuboriladi. | — | `quiz_id`*: integer, `result_id`*: integer, `cheating_detected`: boolean, `reason`: string, `cheating_image_url`: string |
| `POST` | `/api/quiz_process/upload_cheating_evidence` | `quiz_process:end_quiz` | Kameradan olingan dalil rasmini (boshqa shaxs / ikki yuz) saqlash — manzili `end_quiz` ga beriladi. | — | `quiz_id`*: integer, `user_id`: integer, `image_data`*: string |

### 7.18. Natijalar (`Result`)

Har bir urinish natijasi: to‘g‘ri/noto‘g‘ri soni, baho (2–5), proktoring belgilari. Filtrlar: talaba, test, fan, guruh, baho.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `GET` | `/api/result/{result_id}` | `read:result` | Natija ma’lumotini olish. | `result_id`* | — |
| `DELETE` | `/api/result/{result_id}` | `delete:result` | Natijani o‘chirish. | `result_id`* | — |
| `GET` | `/api/result/` | `user_answers:read` | Natijalar ro‘yxati (sahifalab, filtrlar bilan). `faculty_id` — talabaning fakulteti (natija guruhi bo‘yicha), `kafedra_id` — testni yaratgan o‘qituvchining kafedrasi. | `user_id`, `quiz_id`, `subject_id`, `group_id`, `faculty_id`, `kafedra_id`, `grade`, `username`, `page`, `limit`, `sort_dir` | — |

### 7.19. Talaba javoblari (`User Answers`)

Natijani savolma-savol tahlil qilish.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `GET` | `/api/user_answers/` | `user_answers:read` | Talabaning har bir savolga bergan javoblari — natijani tahlil qilish uchun (`result_id` bo‘yicha). | `page`, `limit`, `user_id`, `quiz_id`, `question_id`, `result_id` | — |

### 7.20. Psixologik testlar (`Psychology`)

Psixolog (`psixologik` roli) metodikalar tuzadi (savollar JSONB, turlari: `text`, `true_false`, `scale`, `image_stimulus`, `image_choice`, `multi_choice`), talaba topshiradi, ball avtomatik hisoblanadi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/psychology/method/` | `create:psychology` | Yangi metodika yaratish. | — | `name`*: string, `description`*: string, `instruction`: object |
| `GET` | `/api/psychology/method/` | `read:psychology` | Metodikalar ro‘yxati (sahifalab, filtrlar bilan). | `page`, `limit` | — |
| `GET` | `/api/psychology/method/{method_id}` | `read:psychology` | Metodika ma’lumotini olish. | `method_id`* | — |
| `PUT` | `/api/psychology/method/{method_id}` | `update:psychology` | Metodikani tahrirlash. | `method_id`* | `name`: string, `description`: string, `instruction`: object |
| `DELETE` | `/api/psychology/method/{method_id}` | `delete:psychology` | Metodikani o‘chirish. | `method_id`* | — |
| `POST` | `/api/psychology/question/` | `create:psychology` | Yangi savol yaratish. | — | `method_id`*: integer, `question_type`*: text/true_false/scale/image_stimulus/image_choice/multi_choice, `content`*: object, `options`: object[], `order`: integer, `category`: string |
| `GET` | `/api/psychology/question/{question_id}` | `read:psychology` | Savol ma’lumotini olish. | `question_id`* | — |
| `PUT` | `/api/psychology/question/{question_id}` | `update:psychology` | Savolni tahrirlash. | `question_id`* | `question_type`: text/true_false/scale/image_stimulus/image_choice/multi_choice, `content`: object, `options`: object[], `order`: integer, `category`: string |
| `DELETE` | `/api/psychology/question/{question_id}` | `delete:psychology` | Savolni o‘chirish. | `question_id`* | — |
| `POST` | `/api/psychology/test/{method_id}/submit` | `read:psychology` | Talaba psixologik testni topshiradi — javoblar `{savol_id: qiymat}` ko‘rinishida; `multi_choice` uchun qiymat — massiv. Ball metodika `instruction.scoring` qoidasi bo‘yicha (sum yoki category) hisoblanadi. | `method_id`* | `answers`*: object[] |
| `GET` | `/api/psychology/test/results/` | `read:psychology_results` | Psixologik test natijalari (metodika, talaba, fakultet, guruh bo‘yicha filtr). | `method_id`, `user_id`, `faculty_id`, `group_id`, `page`, `limit` | — |
| `DELETE` | `/api/psychology/test/results/{result_id}` | `delete:psychology_results` | Natijani o‘chirish. | `result_id`* | — |
| `GET` | `/api/psychology/test/results/{result_id}` | `read:psychology_results` | Natija ma’lumotini olish. | `result_id`* | — |

### 7.21. Kurslar (LMS) (`Course`)

O‘qituvchining kursi: fan + guruhlar + semestr. Darslar, topshiriqlar va materiallar kursga bog‘lanadi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/course/` | `create:quiz` | Yangi kurs yaratish. | — | `name`*: string, `subject_id`*: integer, `teacher_id`*: integer, `description`: string, `semester_number`: integer, `group_ids`: integer[], `faculty_id`: integer, `kafedra_id`: integer, `speciality_id`: integer |
| `GET` | `/api/course/` | `user_answers:read` | Kurslar ro‘yxati (sahifalab, filtrlar bilan). | `teacher_id`, `subject_id`, `group_id`, `semester_number`, `faculty_id`, `kafedra_id`, `speciality_id`, `page`, `limit` | — |
| `GET` | `/api/course/{course_id}` | `read:course` | Kurs ma’lumotini olish. | `course_id`* | — |
| `PUT` | `/api/course/{course_id}` | `update:course` | Kursni tahrirlash. | `course_id`* | `name`: string, `subject_id`: integer, `teacher_id`: integer, `description`: string, `semester_number`: integer, `group_ids`: integer[], `faculty_id`: integer, `kafedra_id`: integer, `speciality_id`: integer |
| `DELETE` | `/api/course/{course_id}` | `delete:course` | Kursni o‘chirish. | `course_id`* | — |

### 7.22. Darslar (`Lesson`)

Dars (mavzu, sana, guruh) va u bo‘yicha davomat/baholar.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/lesson/` | `create:quiz` | Yangi dars yaratish. `group_id` berilmasa kursning guruhi olinadi (kursda bir nechta guruh bo‘lsa majburiy), `date` berilmasa bugungi sana (Toshkent) qo‘yiladi. | — | `subject_teacher_id`: integer, `group_id`: integer, `course_id`*: integer, `topic_id`: integer, `lesson_type`: lecture/seminar/independent/lab, `duration_minutes`: integer, `topic`*: string, `date`: string, `description`: string |
| `GET` | `/api/lesson/` | `user_answers:read` | Darslar ro‘yxati (sahifalab, filtrlar bilan). | `subject_teacher_id`, `group_id`, `course_id`, `date_from`, `date_to`, `page`, `limit` | — |
| `GET` | `/api/lesson/{lesson_id}` | `read:lesson` | Dars ma’lumotini olish. | `lesson_id`* | — |
| `PUT` | `/api/lesson/{lesson_id}` | `update:lesson` | Darsni tahrirlash. | `lesson_id`* | `subject_teacher_id`: integer, `group_id`: integer, `course_id`: integer, `lesson_type`: lecture/seminar/independent/lab, `topic`: string, `date`: string, `description`: string |
| `DELETE` | `/api/lesson/{lesson_id}` | `delete:lesson` | Darsni o‘chirish. | `lesson_id`* | — |
| `GET` | `/api/lesson/{lesson_id}/results` | `read:lesson` | Dars bo‘yicha davomat/baholar ro‘yxati. | `lesson_id`* | — |
| `PUT` | `/api/lesson/{lesson_id}/results` | `update:lesson_result` | Dars bo‘yicha davomat va baholarni bir yo‘la saqlash (upsert). | `lesson_id`* | `items`*: object[] |

### 7.23. Topshiriqlar (`Assignment`)

Uy vazifalari: o‘qituvchi beradi, talaba topshiradi, o‘qituvchi baholaydi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/assignment/` | `create:quiz` | Yangi topshiriq yaratish. | — | `course_id`*: integer, `lesson_id`: integer, `title`*: string, `description`: string, `deadline`*: string, `max_grade`: integer, `allow_file`: boolean, `allow_text`: boolean, `allowed_file_types`: string[] |
| `GET` | `/api/assignment/` | `user_answers:read` | Topshiriqlar ro‘yxati (sahifalab, filtrlar bilan). | `course_id`, `lesson_id`, `page`, `limit` | — |
| `GET` | `/api/assignment/{assignment_id}` | `read:assignment` | Topshiriq ma’lumotini olish. | `assignment_id`* | — |
| `PUT` | `/api/assignment/{assignment_id}` | `update:assignment` | Topshiriqni tahrirlash. | `assignment_id`* | `lesson_id`: integer, `title`: string, `description`: string, `deadline`: string, `max_grade`: integer, `allow_file`: boolean, `allow_text`: boolean, `allowed_file_types`: string[] |
| `DELETE` | `/api/assignment/{assignment_id}` | `delete:assignment` | Topshiriqni o‘chirish. | `assignment_id`* | — |
| `POST` | `/api/assignment/{assignment_id}/submit` | `create:submission` | Talaba topshiriqni topshiradi. | `assignment_id`* | `submitted_text`: string, `submitted_files`: object[] |
| `GET` | `/api/assignment/{assignment_id}/my-submission` | `read:submission` | Talaba o‘zining topshirgan ishini ko‘radi. | `assignment_id`* | — |
| `GET` | `/api/assignment/{assignment_id}/submissions` | `read:submission` | O‘qituvchi uchun: topshiriq bo‘yicha barcha topshirilgan ishlar. | `assignment_id`* | — |
| `PUT` | `/api/assignment/{assignment_id}/submission/{user_id}/grade` | `update:submission` | Topshirilgan ishga baho qo‘yish. | `assignment_id`*, `user_id`* | `grade`*: integer, `feedback`: string |

### 7.24. Dars materiallari (`Resource`)

Fayllar va havolalar — darsga yoki kursga biriktiriladi.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/resource/` | `create:quiz` | Yangi resurs yaratish. `video` uchun `link_url` (YouTube) majburiy — video fayl qabul qilinmaydi. | — | `lesson_id`: integer, `course_id`: integer, `resource_type`*: file/link/text/video, `title`*: string, `file_url`: string, `link_url`: string, `text_content`: string, `order_index`: integer |
| `GET` | `/api/resource/` | `user_answers:read` | Resurslar ro‘yxati (sahifalab, filtrlar bilan). | `lesson_id`, `course_id`, `page`, `limit` | — |
| `POST` | `/api/resource/upload` | `create:quiz` | Dars materiali faylini yuklash: rasm (5MB) va hujjat/arxiv (20MB). Video fayllar qabul qilinmaydi. | — | (form-data) `file`*: fayl |
| `GET` | `/api/resource/{resource_id}` | `read:resource` | Resurs ma’lumotini olish. | `resource_id`* | — |
| `PUT` | `/api/resource/{resource_id}` | `update:resource` | Resursni tahrirlash. | `resource_id`* | `title`: string, `file_url`: string, `link_url`: string, `text_content`: string, `order_index`: integer |
| `DELETE` | `/api/resource/{resource_id}` | `delete:resource` | Resursni o‘chirish. | `resource_id`* | — |

### 7.25. EduPlan (EPOS) sinxronizatsiyasi (`EduPlan`)

Tashkiliy tuzilma manbai. **Faqat o‘qish**, EduPlan’ga hech narsa yozilmaydi. Ikki bosqich: `preview` (takliflar) → `apply` (qo‘llash). Hech narsa o‘chirilmaydi. Sozlamalarda `APP_CONFIG__EDUPLAN__*` yoqilgan bo‘lishi kerak.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `GET` | `/api/integration/eduplan/status` | `read:eduplan` | EduPlan (EPOS) integratsiyasi holati: yoqilganmi, ulanish bormi, o‘quv yili. | — | — |
| `POST` | `/api/integration/eduplan/preview` | `sync:eduplan` | EduPlan’dan tuzilmani o‘qib, **takliflar** ro‘yxatini qaytaradi (create / link / update / conflict / deactivate) — hech narsa yozilmaydi. Takliflar 1 soat `run_id` ostida saqlanadi. | — | — |
| `POST` | `/api/integration/eduplan/apply` | `sync:eduplan` | Preview takliflarini bitta tranzaksiyada qo‘llash. `conflict` (bir nom — bir nechta lokal yozuv) faqat admin qarori bilan. Hech narsa o‘chirilmaydi — yo‘qolganlar `is_active=false`. | — | `run_id`*: string, `decisions`: object[], `apply_deactivations`: boolean |
| `POST` | `/api/integration/eduplan/workloads` | `sync:eduplan` | EduPlan yuklamalaridan o‘qituvchi–fan–guruh biriktirishlarini yaratish. | `academic_year_id` | — |
| `POST` | `/api/integration/eduplan/run` | `sync:eduplan` | To‘liq avtomatik sinxronizatsiya (cron uchun): aniq takliflar qo‘llanadi, konfliktlar adminga qoldiriladi. Redis qulfi parallel ishga tushishdan saqlaydi. | — | — |

### 7.26. Loglar (`Logs`)

Frontend xatoliklarini yig‘ish.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `POST` | `/api/logs/client` | `ochiq` | Frontend xatoliklarini serverga yuborish (monitoring uchun). | — | `entries`*: object[] |

### 7.27. Tizim (`Tizim`)

Xizmat endpointlari.

| Metod | Manzil | Ruxsat | Nima qiladi | Parametrlar | Body maydonlari |
|---|---|---|---|---|---|
| `GET` | `/health` | `ochiq` | Servis tirikligini tekshirish — deploy va monitoring shu manzilni so‘raydi. | — | — |


---

## 8. Yuz orqali nazorat servisi

Alohida mikroservis (`face-detection/`, port 8001). Test `proctoring_mode = "face"` bo‘lsa, frontend kamera kadrlarini WebSocket orqali yuboradi.

- **Ulanish:** `wss://lms.nsumt.uz/v1/video/stream?token=<face_ws_token>` — token `start_quiz` javobida keladi (`face_ws_token`), brauzer WS’ga sarlavha qo‘ya olmagani uchun query’da.
- **Mijoz yuboradi:** har kadr — base64 kodlangan JPEG (matn xabari).
- **Server qaytaradi (JSON):** `has_two_faces` (kadrda 2+ yuz), `face_count`, `is_different_person` (test boshidagi shaxs bilan 5 soniyada bir solishtiriladi — boshqa odam o‘tirsa `true`), xato bo‘lsa `error`.
- Frontend `is_different_person` yoki `has_two_faces` ketma-ket tasdiqlansa dalil rasmini `POST /api/quiz_process/upload_cheating_evidence` ga saqlaydi va testni `end_quiz` (`cheating_detected: true`) bilan yakunlaydi. Natijada baho 2 va sabab ko‘rsatiladi.
- Servis Swagger’i prod’da **o‘chirilgan** (ichki servis); backend unga `APP_CONFIG__FACE_SERVICE__URL` orqali murojaat qiladi.

---

## 9. Tez-tez so‘raladigan savollar

**Token necha vaqt yashaydi?** — Harakatsizlikda 30 daqiqa; faol ishlatilganda JWT `exp` (absolyut chegara) gacha.

**Nega bir vaqtda ikki qurilmadan kira olmayman?** — Xavfsizlik: test paytida akkauntni bo‘lishish oldini oladi. Ikkinchi kirish birinchisini yopadi.

**Nega EduPlan’dan kelgan kafedrani tahrirlay olmayman (409)?** — U ko‘zgu yozuv; keyingi sinxronizatsiya o‘zgarishni qaytarib yuborardi. EduPlan’da o‘zgartiring.

**Savolni tahrirlasam eski natijalar buziladimi?** — Yo‘q: savollar versiyalanadi (`version`, `is_latest`, `original_question_id`), natija o‘sha paytdagi versiyaga bog‘langan.

**Testni o‘chirsam natijalar-chi?** — `delete-info` ko‘rsatadi; `force=true` bo‘lmasa bog‘liq natijalar bor test o‘chmaydi.

**API’ni frontend’siz qanday sinayman?** — `https://lms.nsumt.uz/docs` → «Authorize» tugmasi → `Bearer <token>` → istalgan endpoint «Try it out».

**Xatoliklar qayerda ko‘rinadi?** — Backend loglari (`backend_logs` tomi, Grafana/Loki), frontend xatoliklari `POST /api/logs/client` orqali shu yerga tushadi.
