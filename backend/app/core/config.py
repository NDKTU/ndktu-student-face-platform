from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

# Project Directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class ServerConfig(BaseModel):
    app_path: str
    host: str
    port: int
    reload: bool = True


class JwtConfig(BaseModel):
    access_token_secret: str
    refresh_token_secret: str
    # Абсолютный потолок жизни токена (по подписи exp). Реальный таймаут сессии
    # теперь определяется скользящим idle-TTL в Redis (session_idle_minutes).
    access_token_expires_minutes: int
    refresh_token_expires_days: int
    # Idle-окно скользящей Redis-сессии: TTL ключа user:session:{user_id}
    # продлевается при каждом аутентифицированном запросе.
    session_idle_minutes: int = 30
    algorithm: str


class DatabaseConfig(BaseModel):
    url: PostgresDsn
    test_url: PostgresDsn | None = None
    echo: bool = False
    echo_pool: bool = False
    pool_size: int = 50
    max_overflow: int = 10

    naming_convention: dict[str, str] = {
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }


class FileUrl(BaseModel):
    http: str
    upload_dir: str


class HemisConfig(BaseModel):
    # Студенческий портал.
    login_url: str
    me_url: str

    # Сотруднический портал — отдельный хост с тем же протоколом. Пока не
    # заполнен, вход преподавателей через Hemis просто не предлагается, и
    # поведение установки не меняется.
    employee_login_url: str = ""
    employee_me_url: str = ""

    @property
    def employee_login_enabled(self) -> bool:
        return bool(self.employee_login_url and self.employee_me_url)


class EduPlanConfig(BaseModel):
    """Доступ к EduPlan (EPOS) — источнику справочников оргструктуры.

    Интеграция строго read-only: ни один вызов не пишет в EduPlan. По умолчанию
    выключена, чтобы установка без выданного сервисного аккаунта поднималась
    как раньше.
    """

    enabled: bool = False
    base_url: str = "https://edu.plan.nsumt.uz/rest"
    username: str = ""
    password: str = ""
    # Все защищённые эндпоинты EduPlan принимают X-Active-Role: у них
    # мультиролевая модель с переключением активной роли.
    active_role: str = ""
    timeout: float = 30.0
    # Размер страницы при обходе списков. 200 — компромисс между числом
    # запросов и весом одного ответа.
    page_size: int = 200

    # Ночной прогон внутри приложения. Час — местный, по Ташкенту.
    # Включать только если синхронизация НЕ поставлена в системный cron:
    # два планировщика одновременно не нужны (блокировка их разведёт, но
    # второй будет просто впустую будить приложение).
    schedule_enabled: bool = False
    schedule_hour: int = 3

    @property
    def is_configured(self) -> bool:
        return bool(self.enabled and self.base_url and self.username and self.password)


class FaceServiceConfig(BaseModel):
    url: str = "http://face-detection:8000"
    internal_token: str = ""


class RedisConfig(BaseModel):
    host: str
    port: int
    prefix: str

    @property
    def url(self) -> str:
        """Собирает URL для подключения к Redis"""
        return f"redis://{self.host}:{self.port}/0"


class CorsConfig(BaseModel):
    origins: list[str] = []


class ZoomConfig(BaseModel):
    """Zoom Meeting SDK (General App).

    Bu kalitlar bilan bekend faqat imzo (signature) yasaydi — sir brauzerga
    hech qachon chiqmaydi. Bo'sh bo'lsa, integratsiya o'chiq hisoblanadi va
    dars sahifasi Zoom bloki bo'lmasdan ishlayveradi.
    """

    client_id: str = ""
    client_secret: str = ""
    # Imzo amal qilish muddati. Zoom 48 soatgacha ruxsat beradi; bizga
    # qo'shilish uchun qisqa muddat yetarli.
    signature_ttl_seconds: int = 60 * 60 * 2

    @property
    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret)


class AdminConfig(BaseModel):
    """Bootstrap admin account, created once by init_db on first boot.

    Optional and unset by default so existing databases (which already have
    an admin account created before this existed) aren't forced to set these
    — init_db just skips admin-user creation with a warning if either is empty.
    """

    username: str | None = None
    password: str | None = None


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        env_nested_delimiter="__",
        env_prefix="APP_CONFIG__",
        extra="ignore",
    )

    server: ServerConfig
    database: DatabaseConfig
    jwt: JwtConfig
    hemis: HemisConfig
    eduplan: EduPlanConfig = EduPlanConfig()
    face_service: FaceServiceConfig = FaceServiceConfig()
    file_url: FileUrl
    redis: RedisConfig
    cors: CorsConfig = CorsConfig()
    admin: AdminConfig = AdminConfig()
    zoom: ZoomConfig = ZoomConfig()

    # Add derived absolute paths
    @property
    def logs_dir(self) -> Path:
        return BASE_DIR / "logs"

    @property
    def absolute_upload_dir(self) -> Path:
        return BASE_DIR / self.file_url.upload_dir

    @property
    def question_upload_dir(self) -> Path:
        return self.absolute_upload_dir / "question"

    @property
    def profile_upload_dir(self) -> Path:
        return self.absolute_upload_dir / "profile"

    @property
    def evidence_dir(self) -> Path:
        return self.absolute_upload_dir / "cheating_evidence"

    @property
    def course_resource_upload_dir(self) -> Path:
        return self.absolute_upload_dir / "course_resources"

    @property
    def homework_submission_upload_dir(self) -> Path:
        return self.absolute_upload_dir / "homework_submissions"


settings = AppConfig()
