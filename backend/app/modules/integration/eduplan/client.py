"""HTTP-клиент EduPlan (EPOS).

Строго read-only: класс не содержит ни одного метода, выполняющего POST/PUT/
PATCH/DELETE к прикладным ресурсам EduPlan. Единственный POST — логин.

EduPlan использует два несовместимых стиля пагинации, и обход списков это
скрывает: часть эндпоинтов работает через ``skip``/``limit`` и отдаёт голый
массив либо объект с ``items``, часть — через ``page``/``size`` и всегда отдаёт
``{items, total}``.
"""

import logging
from types import TracebackType
from typing import Any

import httpx
from core.config import EduPlanConfig, settings
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class EduPlanError(HTTPException):
    """Ошибка обращения к EduPlan, пригодная для отдачи наружу."""

    def __init__(self, detail: str, status_code: int = status.HTTP_502_BAD_GATEWAY):
        super().__init__(status_code=status_code, detail=detail)


class EduPlanClient:
    """Клиент одного прогона синхронизации.

    Токен живёт в памяти экземпляра: прогон короткий, и одного логина на него
    достаточно. Отдельно кэшировать токен в Redis смысла нет — это добавило бы
    состояние, которое нужно инвалидировать.
    """

    def __init__(self, cfg: EduPlanConfig | None = None) -> None:
        # cfg приходит из credentials.effective_config(): строка, введённая
        # администратором, либо переменные окружения. Без аргумента — окружение,
        # чтобы старые вызовы и скрипты продолжали работать.
        cfg = cfg or settings.eduplan
        if not cfg.is_configured:
            raise EduPlanError(
                "EduPlan integratsiyasi sozlanmagan: sinxronizatsiya sahifasida "
                "login va parolni kiriting yoki APP_CONFIG__EDUPLAN__* ni to‘ldiring",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        self._cfg = cfg
        self._base_url = cfg.base_url.rstrip("/")
        self._token: str | None = None
        self._client = httpx.AsyncClient(timeout=cfg.timeout)

    async def __aenter__(self) -> "EduPlanClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------ #
    #  Транспорт
    # ------------------------------------------------------------------ #
    async def _login(self) -> str:
        """OAuth2 password flow. Тело — form-urlencoded, не JSON."""
        try:
            resp = await self._client.post(
                f"{self._base_url}/api/v1/auth/access-token",
                data={
                    "grant_type": "password",
                    "username": self._cfg.username,
                    "password": self._cfg.password,
                },
                headers={"Accept": "application/json"},
            )
        except httpx.RequestError as e:
            raise EduPlanError(
                f"EduPlan bilan bog‘lanib bo‘lmadi: {e}",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if resp.status_code != 200:
            raise EduPlanError(
                f"EduPlan servis akkaunti login yoki parolini qabul qilmadi (HTTP {resp.status_code})",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        token = resp.json().get("access_token")
        if not token:
            raise EduPlanError("EduPlan login javobida access_token yo‘q")

        logger.info("EduPlan: сервисный аккаунт %s аутентифицирован", self._cfg.username)
        return token

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json", "Authorization": f"Bearer {self._token}"}
        if self._cfg.active_role:
            headers["X-Active-Role"] = self._cfg.active_role
        return headers

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if self._token is None:
            self._token = await self._login()

        url = f"{self._base_url}{path}"
        clean_params = {k: v for k, v in (params or {}).items() if v is not None}

        for attempt in (1, 2):
            try:
                resp = await self._client.get(url, params=clean_params, headers=self._headers())
            except httpx.RequestError as e:
                raise EduPlanError(
                    f"EduPlan {path} so‘rovida javob bermadi: {e}",
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            # Токен мог протухнуть в середине долгого прогона — один
            # перелогин и повтор, дальше уже ошибка доступа.
            if resp.status_code == 401 and attempt == 1:
                logger.info("EduPlan: токен отклонён на %s, повторный вход", path)
                self._token = await self._login()
                continue

            if resp.status_code == 403:
                raise EduPlanError(
                    f"Сервисному аккаунту EduPlan не хватает прав на {path}. Проверьте роль и значение X-Active-Role.",
                    status_code=status.HTTP_403_FORBIDDEN,
                )

            if resp.status_code != 200:
                raise EduPlanError(f"EduPlan {path} uchun HTTP {resp.status_code} qaytardi")

            return resp.json()

        raise EduPlanError(f"EduPlan {path} so‘rovini qayta kirishdan keyin ham ruxsat bermadi")

    # ------------------------------------------------------------------ #
    #  Обход пагинации
    # ------------------------------------------------------------------ #
    @staticmethod
    def _extract_items(payload: Any) -> list[dict]:
        """Разворачивает и голый массив, и объект вида {items, total}."""
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("items") or []
        return []

    async def _paginate(
        self,
        path: str,
        style: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict]:
        """Собирает весь список постранично.

        ``style`` — ``"skip"`` (skip/limit) либо ``"page"`` (page/size).
        Признак конца один на оба стиля: страница вернулась короче размера
        страницы. На ``total`` не опираемся — он есть не у всех ответов.
        """
        size = self._cfg.page_size
        collected: list[dict] = []
        cursor = 0 if style == "skip" else 1

        while True:
            page_params = dict(params or {})
            if style == "skip":
                page_params.update({"skip": cursor, "limit": size})
            else:
                page_params.update({"page": cursor, "size": size})

            items = self._extract_items(await self._get(path, page_params))
            collected.extend(items)

            if len(items) < size:
                break
            cursor = cursor + size if style == "skip" else cursor + 1

            # Страховка от эндпоинта, игнорирующего пагинацию: без неё цикл
            # вечно докладывал бы одну и ту же страницу.
            if len(collected) > 100_000:
                logger.warning("EduPlan: обход %s прерван на %d записях", path, len(collected))
                break

        return collected

    # ------------------------------------------------------------------ #
    #  Справочники
    # ------------------------------------------------------------------ #
    async def faculties(self) -> list[dict]:
        return await self._paginate("/api/v1/faculties/", "skip")

    async def departments(self) -> list[dict]:
        """В терминах EduPlan department — это наша кафедра."""
        return await self._paginate("/api/v1/departments/", "skip")

    async def specialities(self) -> list[dict]:
        return await self._paginate("/api/v1/specialities/", "page")

    async def groups(self) -> list[dict]:
        return await self._paginate("/api/v1/groups/", "page")

    async def subjects(self) -> list[dict]:
        return await self._paginate("/api/v1/subjects/", "page")

    async def staff(self) -> list[dict]:
        """Сотрудники вместе с их учётной записью EduPlan.

        Взято именно /staff/, а не /teachers/: только здесь есть username и
        hemis_id рядом с профилем преподавателя, а без username локального
        пользователя не завести.
        """
        return await self._paginate("/api/v1/staff/", "skip")

    async def academic_years(self) -> list[dict]:
        return await self._paginate("/api/v1/academic-years/", "skip")

    async def streams(self) -> list[dict]:
        return await self._paginate("/api/v1/streams/", "page")

    async def workloads(self, academic_year_id: int | None = None) -> list[dict]:
        return await self._paginate(
            "/api/v1/workloads/",
            "page",
            {"academic_year_id": academic_year_id},
        )
