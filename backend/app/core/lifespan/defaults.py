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

STUDENT_PERMISSIONS = (
    "announcement:feed",
    "announcement:register",
    "attendance:me",
    "create:submission",
    "read:active_quiz",
    "read:course",
    "read:homework",
    "read:lesson",
    "read:psychology",
    "read:resource",
    "read:result",
    "read:submission",
    "user:me",
    "user_answers:read",
)

SEEDED_ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "teacher": TEACHER_PERMISSIONS,
    "student": STUDENT_PERMISSIONS,
}
