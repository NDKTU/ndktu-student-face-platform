"""Seans nomi: «Fan (tur) — Familiya I.O. (guruhlar)» (`auto_title`), formada ham shunday."""



from app.core.enums import course_type_label
from app.modules.auth.model import Teacher



#: Avtomatik nomda shuncha guruh nomi yoziladi, qolgani «+N».
TITLE_GROUPS_SHOWN = 3


def _readable_name(value: str) -> str:
    """HEMIS/EPOS ismlarni ko'pincha KATTA harf bilan beradi: «G‘ULOMOV BEKZOD» → «G‘ulomov Bekzod».

    `str.title()` yaramaydi: u «G‘Ulomov» qiladi (apostrofdan keyin ham katta harf).
    """
    value = (value or "").strip()
    if not value.isupper():
        return value
    return " ".join(word[:1] + word[1:].lower() for word in value.split())


def teacher_short_name(teacher: Teacher) -> str:
    """«Familiya I.O.» — nomga sig'adigan qisqa shakl."""
    parts = (teacher.first_name, teacher.third_name)
    initials = "".join(f"{part.strip()[0]}." for part in parts if part and part.strip())
    last = _readable_name(teacher.last_name)
    return f"{last} {initials}".strip() if last else _readable_name(teacher.full_name)


def auto_title(
    subject_name: str, teacher: Teacher | None, group_names: list[str], training_type: str | None = None
) -> str:
    """«Fan (amaliyot) — Familiya I.O. (101-23, 102-23 +2)».

    Tur nomda — bitta fanning ma'ruzasi va amaliyoti ro'yxatda (va kalendarda)
    bir-biridan ajralib tursin. Kurs nomida ham tur shu so'z bilan yoziladi.
    """
    title = subject_name.strip()
    label = course_type_label(training_type)
    if label:
        title = f"{title} ({label})"
    if teacher is not None:
        title = f"{title} — {teacher_short_name(teacher)}"
    names = sorted(group_names)
    if names:
        shown = ", ".join(names[:TITLE_GROUPS_SHOWN])
        if len(names) > TITLE_GROUPS_SHOWN:
            shown += f" +{len(names) - TITLE_GROUPS_SHOWN}"
        title = f"{title} ({shown})"
    return title[:255]
