import logging

from core.database.db_helper import db_helper
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole
from app.modules.auth.user.service import auth_service

logger = logging.getLogger(__name__)

# auto_error=False: при отсутствии заголовка возвращаем 401 (а не дефолтный 403),
# чтобы фронтовый интерсептор корректно редиректил на /login.
api_key_header = APIKeyHeader(name="Authorization", auto_error=False)


async def get_current_user_id(token: str | None = Depends(api_key_header)) -> int:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    # Единая валидация: декод + Single Active Session + продление скользящего idle-TTL.
    return await auth_service.validate_session(token)


class PermissionRequired:
    def __init__(self, permission_name: str):
        self.permission_name = permission_name

    async def __call__(
        self,
        user_id: int = Depends(get_current_user_id),
        session: AsyncSession = Depends(db_helper.session_getter),
    ) -> User:
        # Загружаем пользователя с ролями один раз
        user_stmt = select(User).where(User.id == user_id).options(selectinload(User.roles))
        result = await session.execute(user_stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # Проверяем, является ли пользователь админом
        is_admin = any(role.name == "Admin" for role in user.roles)

        if is_admin:
            return user  # Админ имеет доступ ко всему

        # Для не-админов проверяем конкретное разрешение
        # Permissions are created at startup by init_db, no need to create here
        perm_stmt = select(Permission).where(Permission.name == self.permission_name)
        perm_result = await session.execute(perm_stmt)
        perm_obj = perm_result.scalar_one_or_none()

        if not perm_obj:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{self.permission_name}' not found. Restart the app to sync permissions.",
            )

        # 2. Проверяем наличие права у пользователя
        perm_check_stmt = (
            select(Permission.id)
            .join(RolePermission)
            .join(Role)
            .join(UserRole)
            .where(UserRole.user_id == user_id, Permission.name == self.permission_name)
        )
        perm_check_result = await session.execute(perm_check_stmt)
        has_permission = perm_check_result.scalars().first()

        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: user lacks '{self.permission_name}' permission",
            )

        return user


async def user_has_permission(session: AsyncSession, user: User, permission_name: str) -> bool:
    """Проверка права уже загруженного пользователя, без 403.

    `PermissionRequired` годится только как зависимость роута: она бросает
    исключение. Здесь право нужно как ветвление — например, «есть read:student
    → отдаём всех студентов, нет → только свою группу».
    """
    if any(role.name.lower() == "admin" for role in user.roles):
        return True

    stmt = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, Permission.name == permission_name)
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalars().first() is not None


class PermissionRequiredExceptRole(PermissionRequired):
    """`PermissionRequired`, ustiga — bitta rolni to'sish.

    Ruxsatni roldan olib tashlashning o'zi kifoya qilmaydi: ruxsatlar
    Rollar oynasidan qo'lda ham beriladi, seed esa ortiqchasini OLIB
    TASHLAMAYDI (`core/lifespan/defaults.py`). Shuning uchun ba'zi
    chegaralar endpointning o'zida turadi.

    `PermissionRequired` dan meros olingani muhim: ishga tushishda
    ruxsatlar route'lardan aynan shu tur bo'yicha topiladi
    (`core/lifespan/discovery.py`), alohida sinf esa ruxsatni bazadan
    yo'qotib yuborardi.
    """

    #: Shu roldagi foydalanuvchi endpointga kiritilmaydi.
    BLOCKED_ROLE = ""

    #: Rolining nomi shu to'plamda ham bo'lsa, chegara qo'llanmaydi.
    EXEMPT_ROLES = frozenset({"admin"})

    #: 403 javobidagi izoh.
    DENIAL_DETAIL = "Access denied"

    async def __call__(
        self,
        user_id: int = Depends(get_current_user_id),
        session: AsyncSession = Depends(db_helper.session_getter),
    ) -> User:
        user = await super().__call__(user_id=user_id, session=session)

        role_names = {role.name.lower() for role in (user.roles or [])}
        if self.BLOCKED_ROLE in role_names and not (role_names & self.EXEMPT_ROLES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=self.DENIAL_DETAIL,
            )

        return user


class PermissionRequiredExceptTeacher(PermissionRequiredExceptRole):
    """Tashkiliy tuzilma spravochniklari — o'qituvchiga yopiq.

    Fakultet, kafedra, mutaxassislik, o'quv reja — ma'muriyat ma'lumoti:
    ularni EPOS/HEMIS to'ldiradi, platformada esa faqat o'qiladi.
    O'qituvchining kundalik ishida butun universitetning bo'linmalari
    kerak emas — uning guruhlari, kurslari va darslari o'z bo'limlarida.

    Admin va psixolog (`psixologik`) bundan tashqarida: psixologiya
    natijalari fakultet bo'yicha filtrlanadi, shuning uchun unga
    fakultetlar ro'yxati kerak.
    """

    BLOCKED_ROLE = "teacher"
    EXEMPT_ROLES = frozenset({"admin", "psixologik"})
    DENIAL_DETAIL = "Access denied: organization structure is not available for teachers"


class PermissionRequiredExceptStudent(PermissionRequiredExceptRole):
    """Test yaratish — talabaga yopiq.

    Talabaning testdagi ishi `quiz_process:*` ruxsatlari bilan chegaralanadi:
    boshlash, javob yuborish, yakunlash. Testni yig'ish esa o'qituvchi va
    ma'muriyat ishi.

    `create:quiz` talaba roliga hech qachon berilmagan, lekin `read:quiz`
    qo'lda berilib qolgan edi — natijada talabada butun universitetning
    «Testlar» sahifasi «Test yaratish» tugmasi bilan ochilib turardi.
    Grantlar `a4c7e2b91d05` migratsiyasida olib tashlandi, bu chegara esa
    ularning qaytib kelishidan qat'i nazar ishlaydi.
    """

    BLOCKED_ROLE = "student"
    DENIAL_DETAIL = "Access denied: quiz authoring is not available for students"


class DeviceUploadExceptTeacher(PermissionRequiredExceptRole):
    """Kurs materialini qurilmadan yuklash — o'qituvchiga yopiq.

    O'qituvchi darsga, kurs kutubxonasiga va uy vazifasiga faylni faqat
    «Fayllar kutubxonasi»dan tanlaydi. Yangi faylni u avval kutubxonaning
    o'ziga (`/file/upload`) yuklaydi — bu yo'l ochiq qoladi, aks holda
    tanlashga hech narsa bo'lmasdi.

    Admin bundan tashqarida: uning yuklash imkoniyatlari o'zgarmaydi.
    """

    BLOCKED_ROLE = "teacher"
    DENIAL_DETAIL = "O'qituvchi faylni faqat «Fayllar kutubxonasi»dan tanlay oladi"


class FileLibraryExceptStudent(PermissionRequiredExceptRole):
    """«Fayllar kutubxonasi» — talabaga yopiq.

    Talaba uy vazifasiga faylni faqat o'z qurilmasidan yuklaydi
    (`/homework/{id}/upload`). `read:file` talaba roliga berilmagan, lekin
    Rollar oynasidan qo'lda berilishi mumkin — chegara shundan qat'i
    nazar ishlaydi.

    O'qituvchi roli ham bor foydalanuvchi bundan tashqarida: kutubxona
    uning ish quroli.
    """

    BLOCKED_ROLE = "student"
    EXEMPT_ROLES = frozenset({"admin", "teacher"})
    DENIAL_DETAIL = "Talaba faylni faqat o'z qurilmasidan yuklay oladi"
