"""Клиент административного API HEMIS (`/rest/v1/data/student-list`).

Отличается от студенческого входа тем, что ходит по долгоживущему токену, а
не по логину и паролю конкретного человека, и отдаёт весь справочник
постранично.

Только чтение: ни один вызов ничего в HEMIS не пишет.
"""

import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

#: Максимум, который принимает HEMIS (`limit - [1, ..., 200]`).
PAGE_SIZE = 200

#: 9626 активных студентов — это 49 страниц (замер 08.09.2026, весь обход
#: занимает около 50 секунд). Ограничитель на случай, если сервер начнёт
#: отдавать бесконечную пагинацию: лучше оборвать с ошибкой, чем крутиться
#: часами.
MAX_PAGES = 200


class HemisDataError(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_502_BAD_GATEWAY):
        super().__init__(status_code=status_code, detail=detail)


def _unwrap(payload: dict) -> tuple[list[dict], dict]:
    """Разбирает конверт HEMIS.

    В документации `data` и `pagination` показаны списками, а сервер отдаёт
    объекты. Принимаем обе формы: расхождение спецификации с реальностью здесь
    уже есть, и падать из-за него на первом же ответе не хочется.
    """
    if not payload.get("success", False):
        raise HemisDataError(f"HEMIS xato qaytardi: {payload.get('error') or payload.get('code')}")

    data = payload.get("data")
    block: Any = data[0] if isinstance(data, list) and data else data
    if not isinstance(block, dict):
        raise HemisDataError("HEMIS javobida ma'lumot bloki yo'q")

    items = block.get("items") or []
    pagination = block.get("pagination")
    if isinstance(pagination, list):
        pagination = pagination[0] if pagination else {}
    return items, (pagination or {})


class HemisDataClient:
    def __init__(self, data_url: str, token: str, timeout: float = 60.0):
        if not data_url or not token:
            raise HemisDataError(
                "HEMIS tokeni sozlanmagan — /admin/hemis-sync sahifasida kiriting",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        self._url = data_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        self._timeout = timeout

    async def _get(
        self,
        client: httpx.AsyncClient,
        page: int,
        limit: int,
        updated_at_from: int | None = None,
    ) -> tuple[list[dict], dict]:
        params: dict[str, int] = {"page": page, "limit": limit}
        if updated_at_from:
            # Инкрементальный прогон: HEMIS отдаёт только изменившихся с этого
            # момента. 49 страниц каждую ночь ради десятка правок не нужны.
            params["updated_at_from"] = updated_at_from
        try:
            resp = await client.get(
                self._url,
                params=params,
                headers=self._headers,
            )
        except httpx.RequestError as error:
            raise HemisDataError(
                f"HEMIS bilan bog'lanib bo'lmadi: {error}",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if resp.status_code == 401:
            # Токен протухает — это штатная ситуация, и админ должен увидеть
            # именно её, а не общий «сервис недоступен».
            raise HemisDataError(
                "HEMIS tokeni qabul qilinmadi (401) — muddati tugagan bo'lishi mumkin, yangisini kiriting",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        if resp.status_code != 200:
            raise HemisDataError(f"HEMIS HTTP {resp.status_code} qaytardi")

        return _unwrap(resp.json())

    async def probe(self) -> dict:
        """Проверка токена: одна запись, чтобы узнать общее число студентов."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            _, pagination = await self._get(client, page=1, limit=1)
        return {
            "total": int(pagination.get("totalCount") or 0),
            "page_size": int(pagination.get("pageSize") or 0),
        }

    async def fetch_all(
        self, limit: int = PAGE_SIZE, updated_at_from: int | None = None
    ) -> list[dict]:
        """Все активные студенты. Фильтр статуса не передаём: по умолчанию
        HEMIS отдаёт код 11 — «O'qimoqda», а это ровно то, что нужно.

        `updated_at_from` сужает выдачу до изменившихся — для ночных прогонов.
        """
        collected: list[dict] = []
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            items, pagination = await self._get(
                client, page=1, limit=limit, updated_at_from=updated_at_from
            )
            collected.extend(items)

            page_count = int(pagination.get("pageCount") or 1)
            if page_count > MAX_PAGES:
                raise HemisDataError(
                    f"HEMIS {page_count} sahifa qaytardi — bu kutilganidan ko'p, prognoz to'xtatildi"
                )

            for page in range(2, page_count + 1):
                items, _ = await self._get(
                    client, page=page, limit=limit, updated_at_from=updated_at_from
                )
                if not items:
                    break
                collected.extend(items)

        logger.info("HEMIS: %s ta talaba olindi", len(collected))
        return collected
