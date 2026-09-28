"""Bildirishnomalar: o'qish va o'qilgan deb belgilash.

Yaratish bu yerda emas, `create_notification` da — uni boshqa modullar
(hozircha ROYD integratsiyasi) chaqiradi.
"""

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import TASHKENT_TZ
from app.modules.notification.model import Notification, NotificationType

from .schemas import NotificationListResponse, NotificationResponse


async def create_notification(
    session: AsyncSession,
    *,
    user_id: int,
    title: str,
    body: str = "",
    type_: str = NotificationType.GENERAL,
    payload: dict | None = None,
) -> Notification:
    """Bildirishnoma yozadi. `commit` chaqiruvchida qoladi.

    Ataylab shunday: bildirishnoma o'zi sabab bo'lgan o'zgarish bilan bitta
    tranzaksiyada yozilishi kerak. Aks holda o'zgarish orqaga qaytganda
    xabar qolib ketardi.
    """
    notification = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        payload=payload,
    )
    session.add(notification)
    return notification


async def unread_count(session: AsyncSession, user_id: int) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
    ).scalar() or 0


async def list_notifications(
    session: AsyncSession,
    *,
    user_id: int,
    page: int = 1,
    limit: int = 20,
    only_unread: bool = False,
) -> NotificationListResponse:
    offset = (page - 1) * limit if page > 1 else 0

    filters = [Notification.user_id == user_id]
    if only_unread:
        filters.append(Notification.is_read.is_(False))

    total = (
        await session.execute(select(func.count()).select_from(Notification).where(*filters))
    ).scalar() or 0

    rows = (
        (
            await session.execute(
                select(Notification)
                .where(*filters)
                .order_by(Notification.id.desc())
                .offset(offset)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    return NotificationListResponse(
        total=total,
        unread=await unread_count(session, user_id),
        page=page,
        limit=limit,
        notifications=[NotificationResponse.model_validate(row) for row in rows],
    )


async def mark_read(session: AsyncSession, *, user_id: int, notification_id: int) -> int:
    """Bittasini o'qilgan deb belgilaydi.

    `user_id` shartda: boshqa odamning bildirishnomasini o'qilgan deb
    belgilab bo'lmaydi, garchi bu zararsiz ko'rinsa ham — u holda kimningdir
    qo'ng'iroqchasi jimgina tozalanardi.
    """
    result = await session.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True, read_at=datetime.now(TASHKENT_TZ).replace(tzinfo=None))
    )
    await session.commit()
    return result.rowcount or 0


async def mark_all_read(session: AsyncSession, *, user_id: int) -> int:
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=datetime.now(TASHKENT_TZ).replace(tzinfo=None))
    )
    await session.commit()
    return result.rowcount or 0
