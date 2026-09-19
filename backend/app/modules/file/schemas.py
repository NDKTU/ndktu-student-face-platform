from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

USAGE_ENTITY = Literal["resource", "homework", "submission", "question"]


class FileUsageInfo(BaseModel):
    """Fayl qayerda ishlatilyapti. Oʻchirishdan oldin foydalanuvchi shuni koʻradi."""

    model_config = ConfigDict(from_attributes=True)

    entity_type: USAGE_ENTITY
    entity_id: int
    # Ekranda koʻrsatish uchun: "3-dars", "Algoritmlar kursi". Topilmasa None.
    label: Optional[str] = None


class FileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_name: str
    url: str
    size_bytes: int
    mime_type: Optional[str] = None
    folder_id: Optional[int] = None
    owner_user_id: Optional[int] = None
    usage_count: int = 0


class FileDetailResponse(FileResponse):
    usages: List[FileUsageInfo] = Field(default_factory=list)


class FileUploadResponse(FileResponse):
    """Yuklash javobi: qolgan maydonlar odatdagidek, ustiga bitta bayroq.

    ``deduplicated`` — ayni baytlar shu foydalanuvchida allaqachon boʻlgani
    uchun yangi yozuv yaratilmadi, mavjudi qaytarildi. Faqat yuklashda
    maʼnoga ega, shuning uchun umumiy ``FileResponse`` ga qoʻshilmadi:
    roʻyxat va biriktirish javoblarida bu savol umuman turmaydi.
    """

    deduplicated: bool = False


class FileListRequest(BaseModel):
    folder_id: Optional[int] = None
    # Papkasi yoʻq fayllarni koʻrsatish uchun: folder_id=None "hammasi" degani.
    root_only: bool = False
    # Boshqa odamning papkasida turgan, lekin bu foydalanuvchiga koʻrinadigan
    # fayllar (masalan, hamkasbi yuklagan savol rasmi). Bu papkalar
    # foydalanuvchining papkalar roʻyxatida yoʻq — papka boʻyicha
    # navigatsiyada ular aks holda hech qayerda chiqmasdi.
    shared_only: bool = False
    search: Optional[str] = None
    kind: Optional[Literal["image", "document"]] = None
    page: int = Field(default=1, ge=1)
    size: int = Field(default=40, ge=1, le=200)


class FileListResponse(BaseModel):
    items: List[FileResponse]
    total: int
    page: int
    size: int


class CourseFileResponse(FileResponse):
    # Kurs darajasidagi (darssiz) materiallar — "Kitob qoʻshish" orqali
    # qoʻshilganlar. Faylni kurs kutubxonasidan olib tashlash shularni oʻchiradi.
    course_resource_ids: List[int] = Field(default_factory=list)
    # Shu kursning darsi yoki uy vazifasida ham ishlatiladimi. Unda fayl
    # kutubxonadan olib tashlanganidan keyin ham roʻyxatda qoladi.
    used_in_lessons: bool = False


class CourseFileListResponse(BaseModel):
    items: List[CourseFileResponse]
    total: int
    page: int
    size: int


class FileUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    folder_id: Optional[int] = None
    # folder_id=None "oʻzgarmasin" degani ham, "ildizga koʻchir" degani ham
    # boʻlishi mumkin — ikkovini ajratish uchun alohida bayroq.
    move_to_root: bool = False


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: Optional[int] = None


class FolderUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    parent_id: Optional[int] = None


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    parent_id: Optional[int] = None
    file_count: int = 0
    #: Birinchi yuklashda avtomatik ochilgan shaxsiy papka. Interfeys uni
    #: roʻyxat boshida va oʻz belgisi bilan koʻrsatadi.
    is_personal: bool = False


class FolderListResponse(BaseModel):
    items: List[FolderResponse]


class FileAttachRequest(BaseModel):
    entity_type: USAGE_ENTITY
    entity_id: int
