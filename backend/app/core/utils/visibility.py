"""Yashirilgan spravochnik yozuvlarini roʻyxatlardan chiqarib tashlash.

Bitta joyda turadi, chunki filtr beshta modulda bir xil qoʻllanadi va nusxa
koʻchirilsa ular vaqt oʻtib bir-biridan ajralib ketardi.

Nozik jihat: filtr adminga ham qoʻllanadi. Aks holda admin yashirgan yozuvini
qayta topa olmaydi va qaytara olmaydi — shuning uchun unga ``include_hidden``
parametri beriladi, boshqa rollarda esa u eʼtiborga olinmaydi.
"""

from app.modules.auth.model import User


def is_admin(user: User | None) -> bool:
    if user is None:
        return False
    return any(role.name.lower() == "admin" for role in (user.roles or []))


def apply_visibility(stmt, model, user: User | None, include_hidden: bool = False):
    """Yashirilganlarni chiqarib tashlaydi.

    ``include_hidden`` faqat adminda ishlaydi: boshqa rol uni yuborsa ham
    yashirilgan yozuvni koʻra olmaydi.
    """
    if include_hidden and is_admin(user):
        return stmt
    return stmt.where(model.is_hidden.is_(False))


async def set_hidden(session, model, row_id: int, is_hidden: bool, user: User, entity: str):
    """Yozuvni yashiradi yoki qaytaradi. Faqat admin.

    ``ensure_editable`` ataylab chaqirilmaydi: yashirish — mahalliy qaror,
    sinxronizatsiya qilinadigan maʼlumot emas. Aks holda EduPlan yoqilgan
    kuni bu funksiya butunlay ishlamay qolardi, chunki barcha spravochnik
    satrlari tashqi manbaga tegishli boʻlib qoladi.
    """
    from fastapi import HTTPException, status

    if not is_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yashirish va qaytarish faqat admin uchun",
        )

    row = await session.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} topilmadi")

    row.is_hidden = is_hidden
    await session.commit()
    await session.refresh(row)
    return row
