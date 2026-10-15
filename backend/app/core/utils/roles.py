"""Tizim rollari — kodda o'z xatti-harakati bor uchta rol.

Rollar bazada yaratiladi va nomini admin interfeysdan o'zgartira oladi.
Shuning uchun kod rolni NOMIDAN emas, `roles.code` dan taniydi: u faqat
uchta tizim rolida to'ldirilgan va o'zgarmaydi.

* `admin` — hamma tekshiruvni chetlab o'tadi;
* `teacher` — `teachers` profili, kurslar, guruhlar;
* `student` — `students` profili va guruhi.

Interfeysda yaratilgan qolgan rollarning (registrator, psixologik, tutor,
...) kodi bo'sh: ularning xatti-harakati faqat ruxsatlar va `data_scope`
bilan belgilanadi, kodga qo'shib yozish kerak emas.

Ilgari 31 joyda `role.name.lower() == "admin"` turardi, ikkitasida esa
`role.name == "Admin"` (registrga bog'liq). Rol interfeysda qayta
nomlansa, kod jimgina adashardi.
"""

ROLE_ADMIN = "admin"
ROLE_TEACHER = "teacher"
ROLE_STUDENT = "student"

SYSTEM_ROLE_CODES = frozenset({ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT})


def role_keys(user) -> frozenset[str]:
    """Rollar kalitlari: tizim roli — `code`, qolgani — kichik harfli nom.

    To'plam bilan ishlaydigan joylar uchun (`"teacher" in keys and
    "admin" not in keys`). Tizim rollari qayta nomlanganda ham to'g'ri
    tanilishi uchun kod ustun; interfeysda yaratilgan rollarda kod yo'q va
    ular avvalgidek nomidan.
    """
    return frozenset(
        role.code or (role.name or "").strip().lower() for role in (getattr(user, "roles", None) or [])
    )


def user_has_role(user, code: str) -> bool:
    """Foydalanuvchida shu tizim roli bormi.

    `user.roles` faol ko'rinishga toraytirilgan bo'lishi mumkin
    (`apply_active_role`) — tekshiruv ham shunga qarab ishlaydi.
    """
    return any(role.code == code for role in (getattr(user, "roles", None) or []))


def user_is_admin(user) -> bool:
    return user_has_role(user, ROLE_ADMIN)


def user_is_teacher(user) -> bool:
    return user_has_role(user, ROLE_TEACHER)


def user_is_student(user) -> bool:
    return user_has_role(user, ROLE_STUDENT)
