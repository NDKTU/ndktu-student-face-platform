"""Ishga tushishda tiklanadigan rol-ruxsat bog'lanishlari.

teacher va student ro'yxatlari 2026-09-13 kuni ishlayotgan mahalliy bazadagi
bog'lanishlardan olindi. Faqat shu boshlang'ich ruxsatlarning yetishmagani
qo'shiladi; mavjud bog'lanishlar qayta yozilmaydi va qo'shimcha ruxsatlar
olib tashlanmaydi. Boshlang'ich ruxsat qo'lda olib tashlansa, keyingi ishga
tushishda tiklanadi.

Admin uchun bazadagi barcha ruxsatlar, jumladan route'lardan yangi topilgan
ruxsatlar ham, yetishmasa qo'shiladi. Boshqa rollarga tegilmaydi.
"""

ADMIN_ROLE_NAME = "Admin"

# Kurs ruxsatlari ataylab yo'q: `read:course` ni `e2a4f8c15d97`
# migratsiyasi beradi, `create:course` va `update:course` esa
# `e7b3a1c92d68` da olib tashlangan — kursni ma'muriyat tuzadi. Bu ro'yxat
# yetishmaganini har ishga tushishda qaytaradi, shuning uchun ularni bu
# yerga qo'shish o'sha qarorni bekor qiladi.
#
# Shu sabab bilan tashkiliy tuzilma ham yo'q: `read:faculty`,
# `read:kafedra`, `read:speciality` va `read:curriculum` `b9d6f2a41c73` da
# o'qituvchidan olib tashlangan.
TEACHER_PERMISSIONS = (
    "announcement:feed",
    "announcement:register",
    "create:file",
    "create:homework",
    "create:lesson",
    "create:question",
    "create:quiz",
    "create:resource",
    "delete:file",
    "delete:homework",
    "delete:lesson",
    "delete:question",
    "delete:quiz",
    "delete:resource",
    # Elementar test. Oʻqituvchi fanni KOʻRADI, lekin uni tuzmaydi,
    # nomini oʻzgartirmaydi va oʻchirmaydi — fan maʼmuriyat qoʻlida
    # qoladi. Uning ishi fan ichida: savollar banki va testlar.
    #
    # Shuning uchun savollar ruxsati fan ruxsatidan AJRATILGAN
    # (`create/read/update/delete:general_test_question`). Ilgari ikkalasi
    # bitta `update:general_test_subject` ostida edi, yaʼni savol
    # yuklashga ruxsat berish fanni tahrirlashga ham ruxsat berardi.
    #
    # Egalik repozitoriyda tekshiriladi (`general_test/repository.py`):
    # admin boʻlmagan foydalanuvchi faqat oʻzi biriktirilgan yoki oʻzi
    # yaratgan fanlarni koʻradi.
    #
    # `delete:general_test_result` ataylab yoʻq: bu boshqa odamlarning
    # urinishlari va ularni qaytarib boʻlmaydi — oʻchirish ma'muriyatda
    # qoladi.
    "create:general_test",
    "create:general_test_question",
    "delete:general_test",
    "delete:general_test_question",
    "general_test:take",
    "read:general_test",
    "read:general_test_question",
    "read:general_test_result",
    "read:general_test_subject",
    "update:general_test",
    "update:general_test_question",
    "mark:attendance",
    "read:active_quiz",
    "read:announcement",
    "read:attendance",
    "read:file",
    "read:group",
    "read:homework",
    "read:lesson",
    "read:question",
    "read:quiz",
    "read:resource",
    "read:result",
    "read:subject",
    "read:submission",
    "teacher:me",
    "update:file",
    "update:homework",
    "update:lesson",
    "update:question",
    "update:quiz",
    "update:resource",
    "update:submission",
    "user:me",
    "user_answers:read",
)

# Test yig'ish ruxsatlari ataylab yo'q: `read:quiz` va yozuv ruxsatlari
# `a4c7e2b91d05` migratsiyasida `student` rolidan olib tashlangan —
# talaba testni faqat ishlaydi. Bu ro'yxat yetishmaganini har ishga
# tushishda qaytaradi, shuning uchun ularni bu yerga qo'shish o'sha
# qarorni bekor qiladi.
STUDENT_PERMISSIONS = (
    "announcement:feed",
    "announcement:register",
    "attendance:me",
    "create:submission",
    "general_test:take",
    "read:active_quiz",
    "read:course",
    "read:homework",
    "read:lesson",
    "read:psychology",
    # Oʻz psixologik natijalari. Bekend talabaga faqat oʻzinikini
    # beradi: `user_id` parametri bilan ham boshqasinikini soʻray
    # olmaydi (`psychology/router.py::list_results`), sahifa esa
    # «Psixologik natijalarim» koʻrinishida ochiladi. Ruxsatsiz esa
    # menyu punkti ham, sahifa ham yopiq edi — yaʼni talaba oʻzi
    # topshirgan testning natijasini koʻra olmasdi.
    "read:psychology_results",
    "read:resource",
    "read:result",
    "read:submission",
    # Bosh sahifa (`/students/me/dashboard`).
    "student:me",
    # Test ishlash — talabaning asosiy amali. Uchtasi ham shart:
    # `read:active_quiz` faqat ro'yxatni ko'rsatadi, ishlash uchun
    # `/quiz_process/start_quiz`, `/submit_answer` va `/end_quiz` kerak
    # (oxirgisi `upload_cheating_evidence` ni ham qo'riqlaydi).
    #
    # Bular `c8a3f0d2e517` migratsiyasida berilgan edi, lekin u yangi bazada
    # ishlamaydi: o'sha payt `student` roli hali yaratilmagan bo'ladi (rol
    # birinchi HEMIS loginida yoki shu yerda paydo bo'ladi), shuning uchun
    # migratsiya jimgina bo'sh o'tadi. Toza bazada ko'tarilgan muhitda
    # talabalar test topshira olmay qolgani shundan. Bu yerda esa har ishga
    # tushishda tiklanadi.
    "quiz_process:start_quiz",
    "quiz_process:submit_answer",
    "quiz_process:end_quiz",
    "user:me",
    "user_answers:read",
)

SEEDED_ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "teacher": TEACHER_PERMISSIONS,
    "student": STUDENT_PERMISSIONS,
}
