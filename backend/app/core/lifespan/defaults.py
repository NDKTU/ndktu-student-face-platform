"""Ishga tushishda urug'lantiriladigan rollar va ularning ruxsatlari.

Uch xil rol uch xil qoida bilan ishlaydi, chunki ularning xavfi bir xil emas:

* **Admin** — har ishga tushishda topilgan BARCHA ruxsatga majburan
  sinxronlanadi, aks holda yangi endpoint qo'shilgan kuni tizim o'zini o'z
  ruxsatidan qulflab qo'yardi.

* **teacher / student** — ro'yxatdagi yetishmagan ruxsat qo'shiladi, lekin
  hech narsa OLIB TASHLANMAYDI. Ya'ni admin panelidan berilgan qo'shimcha
  huquq keyingi ishga tushishda yo'qolmaydi. Buning narxi: admin qo'lda
  olib tashlagan ruxsat qaytib keladi — shuning uchun ro'yxat kerakli
  minimum bo'lishi kerak, "ehtimol kerak bo'lar" emas.

* **Boshqa rollar** (department_head, dean, Psixologik, ...) — umuman
  tegilmaydi: ularning tarkibi adminning qarori.

Nega ro'yxat kodda, migratsiyada emas. Ruxsatlar route'lardan aniqlanadi
(``discovery.py``), ya'ni ularning to'plami kod bilan birga o'zgaradi.
Migratsiya esa bir marta bajariladi va keyingi yangi ruxsat rolga yetib
bormaydi — bo'sh bazada ko'tarilgan yangi muhit esa umuman ruxsatsiz
qolardi.
"""

ADMIN_ROLE_NAME = "Admin"

#: O'qituvchi: o'quv jarayonini to'liq boshqaradi, tashkiliy tuzilmani
#: faqat o'qiydi.
#:
#: Tashkiliy tuzilma (guruh, fan, fakultet, kafedra, mutaxassislik, o'quv
#: reja) ataylab faqat o'qish uchun: u EPMOS ko'zgusi va qo'lda tahrir
#: keyingi sinxronizatsiyada jimgina yo'qoladi. Foydalanuvchi va rol
#: boshqaruvi, integratsiya sozlamalari ham berilmaydi.
TEACHER_PERMISSIONS = (
    # Kurs va dars
    "read:course", "create:course", "update:course",
    "read:lesson", "create:lesson", "update:lesson", "delete:lesson",
    "read:resource", "create:resource", "update:resource", "delete:resource",
    # Uy vazifasi va uni baholash
    "read:homework", "create:homework", "update:homework", "delete:homework",
    "read:submission", "update:submission",
    # Test va savollar
    "read:quiz", "create:quiz", "update:quiz", "delete:quiz",
    "read:question", "create:question", "update:question", "delete:question",
    "read:active_quiz", "read:result", "user_answers:read",
    # Davomat
    "read:attendance", "mark:attendance",
    # Fayl kutubxonasi
    "read:file", "create:file", "update:file", "delete:file",
    # Tashkiliy tuzilma — FAQAT o'qish
    "read:group", "read:subject", "read:faculty", "read:kafedra",
    "read:speciality", "read:curriculum", "read:student", "read:teacher",
    "read:teacher_assignment",
    # O'z profili va e'lonlar
    "user:me", "teacher:me",
    "read:announcement", "announcement:feed", "announcement:register",
    # Psixologiya: metodikalar va natijalar
    "read:psychology", "read:psychology_results",
)

#: Talaba: test ishlaydi, uy vazifasi topshiradi, o'z natijasini ko'radi.
#:
#: ``read:file`` ataylab yo'q — u umumiy kutubxonani ochib, boshqa
#: o'qituvchilarning fayllarini ko'rsatardi; kursning o'z kutubxonasi esa
#: ``read:lesson`` bilan ishlaydi.
#:
#: ``read:psychology_results`` ham ataylab yo'q: u so'rovdagi ``user_id``
#: orqali BOSHQA talabalarning natijalarini ham ochadi. Talabaga kerak
#: emas — test topshirilganda javob natijaning o'zini qaytaradi.
STUDENT_PERMISSIONS = (
    # Test ishlash
    "quiz_process:start_quiz", "quiz_process:submit_answer", "quiz_process:end_quiz",
    "read:active_quiz", "read:quiz",
    # O'z natijalari va javoblari
    "read:result", "user_answers:read",
    # Uy vazifasi: ko'rish va topshirish
    "read:homework", "create:submission", "read:submission",
    # Kurs materiallari
    "read:course", "read:lesson", "read:resource",
    # O'z davomati va profili
    "attendance:me", "user:me",
    # Psixologik testlar
    "read:psychology",
    # E'lonlar va tadbirlarga yozilish
    "announcement:feed", "announcement:register",
)

#: Rol nomi -> unga beriladigan ruxsatlar. Nomlar bazadagi ``roles.name``
#: bilan aynan bir xil (kichik harflar bilan) bo'lishi shart.
SEEDED_ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "teacher": TEACHER_PERMISSIONS,
    "student": STUDENT_PERMISSIONS,
}
