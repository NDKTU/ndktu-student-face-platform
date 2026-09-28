from __future__ import annotations

import hashlib
import hmac
import logging
import uuid

from core.database.db_helper import db_helper
from core.dependencies.role_checker import get_current_user_id
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis_client import redis_client
from app.modules.auth.model import Role, Student, UserRole
from app.modules.notification.model import NotificationType
from app.modules.notification.repository import create_notification
from app.modules.organization_structure.model import Faculty, Group

from .client import royd_client
from .schemas import MessageCreateRequest, RequestCreateRequest, ResubmitRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Royd"], prefix="/royd")

SIGNATURE_HEADER = "x-royd-signature"
EVENT_HEADER = "x-royd-event"
DELIVERY_HEADER = "x-royd-delivery"

#: Yetkazilgan hodisalar kaliti. ROYD bir hodisani ikki marta yuborishi
#: mumkin (8 marta qayta urinadi), shuning uchun `X-ROYD-Delivery` bo'yicha
#: takrorlar tashlab yuboriladi. Muddati qayta urinish oynasidan ancha uzun.
_DELIVERY_KEY = "royd:delivery:{}"
_DELIVERY_TTL_SECONDS = 7 * 24 * 3600


# ─────────────────────────── Talaba ma'lumotlari ───────────────────────────


async def _student_payload(session: AsyncSession, user_id: int) -> dict:
    """ROYD'ga yuboriladigan talaba ma'lumotlari.

    Fakultet nomi guruh orqali olinadi, `students.faculty` satridan emas:
    oxirgisi HEMIS'dan kelgan erkin matn va unda nomlar turlicha yoziladi,
    ROYD esa fakultetni **nomi bo'yicha** topadi va mos registratorga
    biriktiradi. Nom mos kelmasa, ROYD 409 qaytaradi va hech narsa
    saqlanmaydi (`docs/INTEGRATION.md` §6).
    """
    row = (
        await session.execute(
            select(
                Student.student_id_number,
                Student.full_name,
                Student.image_path,
                Group.name,
                Faculty.name,
            )
            .join(Group, Group.id == Student.group_id, isouter=True)
            .join(Faculty, Faculty.id == Group.faculty_id, isouter=True)
            .where(Student.user_id == user_id)
        )
    ).first()

    if row is None or not row[0]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ariza faqat talaba nomidan yuboriladi",
        )

    hemis_id, full_name, image_path, group_name, faculty_name = row
    if not faculty_name or not group_name:
        # ROYD uchun ikkalasi ham majburiy. Bo'sh yuborsak 422 qaytardi va
        # talaba tushunarsiz xatoni ko'rardi.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profilingizda fakultet yoki guruh ko'rsatilmagan. Administratorga murojaat qiling.",
        )

    payload = {
        "student_hemis_id": hemis_id,
        "full_name": full_name or hemis_id,
        "faculty": faculty_name,
        "group": group_name,
    }
    # Rasm ixtiyoriy va faqat http(s) bo'lishi kerak. Bizdagi qiymat
    # nisbiy yo'l bo'lishi mumkin (`/uploads/...`) — bunday havolani ROYD
    # xodimlari ocha olmaydi, shuning uchun yuborilmaydi.
    if image_path and image_path.startswith(("http://", "https://")):
        payload["image"] = image_path[:500]
    return payload


async def _is_admin(session: AsyncSession, user_id: int) -> bool:
    return (
        await session.execute(
            select(Role.id)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id, func.lower(Role.name) == "admin")
        )
    ).first() is not None


async def _hemis_filter(session: AsyncSession, user_id: int) -> dict:
    """Ro'yxatni kim ko'radi.

    Talaba — faqat o'zining arizalarini (`student_hemis_id` bo'yicha
    filtr). Ma'muriyat — integratsiya yaratgan barchasini, filtrsiz: ROYD
    baribir faqat bizning mijoz yaratgan murojaatlarni qaytaradi.
    """
    hemis_id = (
        await session.execute(
            select(Student.student_id_number).where(Student.user_id == user_id)
        )
    ).scalar_one_or_none()
    if hemis_id:
        return {"student_hemis_id": hemis_id}
    if await _is_admin(session, user_id):
        return {}
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Arizalarni ko'rish uchun talaba profili yoki ma'muriyat huquqi kerak",
    )


# ─────────────────────────────── Talaba ────────────────────────────────


@router.get("/catalog")
async def get_catalog(
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    """Xizmatlar katalogi — ROYD'dan olinadi, bizda saqlanmaydi.

    Katalog o'sha yerda tahrirlanadi; nusxa saqlasak, yangi xizmat bizda
    ko'rinmay qolardi yoki o'chirilgani tanlanaverardi.
    """
    await _hemis_filter(session, user_id)
    return await royd_client.request("GET", "/categories")


@router.get("/requests")
async def list_requests(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: str | None = Query(None, alias="status"),
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    params: dict = {"limit": limit, "offset": offset}
    params.update(await _hemis_filter(session, user_id))
    if status_filter:
        params["status"] = status_filter
    return await royd_client.request("GET", "/requests", params=params)


@router.get("/requests/{request_id}")
async def get_request(
    request_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    await _hemis_filter(session, user_id)
    return await royd_client.request("GET", f"/requests/{request_id}")


@router.post(
    "/requests",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_request(
    data: RequestCreateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    """Ariza yuboradi.

    `Idempotency-Key` har doim yuboriladi (ROYD talabi). Mijoz o'z kalitini
    bersa, u ishlatiladi — shunda tarmoq uzilgach qayta yuborish nusxa
    yaratmaydi va ROYD avval yaratilgan murojaatni qaytaradi.
    """
    payload = await _student_payload(session, user_id)
    payload.update(data.model_dump(exclude_none=True))
    return await royd_client.request(
        "POST",
        "/requests",
        json=payload,
        idempotency_key=idempotency_key or str(uuid.uuid4()),
    )


@router.post("/requests/{request_id}/messages", status_code=status.HTTP_201_CREATED)
async def add_message(
    request_id: int,
    data: MessageCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    # Ichki (xodimlar uchun) eslatma yozish imkoni yo'q: bu yo'l talaba
    # nomidan ishlaydi va ROYD ham buni ruxsat bermaydi.
    await _student_payload(session, user_id)
    return await royd_client.request(
        "POST", f"/requests/{request_id}/messages", json={"content": data.content}
    )


@router.post("/requests/{request_id}/resubmit")
async def resubmit_request(
    request_id: int,
    data: ResubmitRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    """Qaytarilgan arizani to'ldirib qayta yuboradi.

    `returned` holatida SLA to'xtatilgan va ish talabada: usiz murojaat
    muddatsiz turib qolardi.
    """
    await _student_payload(session, user_id)
    return await royd_client.request(
        "POST", f"/requests/{request_id}/resubmit", json={"comment": data.comment}
    )


@router.post("/requests/{request_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_file(
    request_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    """Faylni ROYD'ga uzatadi.

    Bizning fayl kutubxonasiga yozilmaydi: fayl murojaatga tegishli, murojaat
    esa ROYD'da. Maydon nomi ROYD talab qilgandek `upload` (bizdagi `file`
    emas) — `docs/INTEGRATION.md` §6.
    """
    await _student_payload(session, user_id)
    content = await file.read()
    return await royd_client.request(
        "POST",
        f"/requests/{request_id}/files",
        files={"upload": (file.filename, content, file.content_type or "application/octet-stream")},
    )


# ─────────────────────────────── Webhook ───────────────────────────────


def _verify_signature(body: bytes, signature: str | None) -> None:
    """Imzo — tananing XOM baytlari bo'yicha HMAC-SHA256.

    Vaqt imzoga kirmaydi (ROYD shunday imzolaydi), shuning uchun takrorni
    imzo emas, `X-ROYD-Delivery` to'xtatadi.
    """
    secret = settings.royd.webhook_secret
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook sozlanmagan"
        )
    if not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imzo ko'rsatilmagan")

    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Imzo mos kelmadi")


def _title(event: str, data: dict) -> tuple[str, str]:
    """Bildirishnoma matni.

    Holat nomini ROYD o'zi o'zbekcha beradi (`status_label`) — biz uni
    takrorlab tarjima qilmaymiz, aks holda ikki joyda ikki xil nom paydo
    bo'lardi.
    """
    tracking = data.get("tracking_no") or ""
    label = data.get("status_label") or data.get("status") or ""
    if event == "request.status_changed":
        return f"Ariza {tracking}: {label}", data.get("comment") or ""
    if event == "request.message_created":
        message = data.get("message") or {}
        sender = message.get("sender_name") or "Xodim"
        return f"Ariza {tracking}: yangi xabar", f"{sender}: {message.get('content') or ''}"
    if event == "request.file_added":
        attached = (data.get("file") or {}).get("file_name") or ""
        return f"Ariza {tracking}: fayl qo'shildi", attached
    if event == "request.created":
        return f"Ariza {tracking} qabul qilindi", data.get("title") or ""
    return f"Ariza {tracking}", label


@router.post("/webhook", status_code=status.HTTP_202_ACCEPTED)
async def receive_webhook(
    request: Request,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    """ROYD hodisalarini qabul qiladi.

    Autentifikatsiya imzo bilan, token bilan emas: chaqiruvchi ROYD serveri,
    foydalanuvchi emas. Shuning uchun bu yo'lda `get_current_user_id` yo'q.
    """
    body = await request.body()
    _verify_signature(body, request.headers.get(SIGNATURE_HEADER))

    try:
        envelope = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON noto'g'ri") from exc

    delivery_id = request.headers.get(DELIVERY_HEADER) or envelope.get("id")
    event = request.headers.get(EVENT_HEADER) or envelope.get("event") or ""
    data = envelope.get("data") or {}

    # Takror yetkazish — normal holat: ROYD 2xx olmaguncha 8 marta urinadi.
    if delivery_id:
        first_time = await redis_client.set(
            _DELIVERY_KEY.format(delivery_id), "1", ex=_DELIVERY_TTL_SECONDS, nx=True
        )
        if not first_time:
            return {"accepted": True, "duplicate": True}

    hemis_id = (data.get("student_hemis_id") or "").strip()
    if not hemis_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="student_hemis_id yo'q"
        )

    user_id = (
        await session.execute(
            select(Student.user_id).where(Student.student_id_number == hemis_id)
        )
    ).scalar_one_or_none()
    if user_id is None:
        # 4xx emas, 202: bizda yo'q talaba bo'lishi normal holat. Xato
        # qaytarsak, ROYD hodisani 8 marta qayta yuborishga urinardi.
        logger.info("ROYD webhook: talaba %s bizda topilmadi, o'tkazib yuborildi", hemis_id)
        return {"accepted": False, "reason": "student_not_found"}

    # `request.created` ni bildirishnoma qilmaymiz: arizani talabaning o'zi
    # yuborgan va natijani ekranda ko'rgan.
    if event == "request.created":
        return {"accepted": True, "skipped": "own_action"}

    title, text = _title(event, data)
    await create_notification(
        session,
        user_id=user_id,
        type_=NotificationType.REQUEST_STATUS,
        title=title,
        body=text,
        payload={
            "tracking_no": data.get("tracking_no"),
            "request_id": data.get("request_id"),
            "status": data.get("status"),
            "event": event,
        },
    )
    await session.commit()
    return {"accepted": True}
