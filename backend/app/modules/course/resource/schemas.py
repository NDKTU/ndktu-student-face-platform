from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas import TashkentDatetime

RESOURCE_TYPES = Literal["file", "link", "text", "video", "zoom"]
# «Kutubxona» — kitob va qo'llanmalar, «Fan hujjatlari» — o'quv dastur,
# sillabus kabi rasmiy hujjatlar. Ikkalasi ham kurs darajasidagi fayl.
RESOURCE_CATEGORIES = Literal["library", "document"]


class ResourceCreateRequest(BaseModel):
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    resource_type: RESOURCE_TYPES
    category: RESOURCE_CATEGORIES = "library"
    title: str = Field(min_length=1, max_length=255)
    file_url: Optional[str] = None
    link_url: Optional[str] = None
    text_content: Optional[str] = None
    order_index: int = 0

    @model_validator(mode="after")
    def check_parent_and_content(self):
        if (self.lesson_id is None) == (self.course_id is None):
            raise ValueError("Exactly one of lesson_id or course_id must be set")
        # Fan hujjati — kurs darajasidagi fayl: darsda bunday bo'lim yo'q.
        if self.category == "document" and (self.course_id is None or self.resource_type != "file"):
            raise ValueError("document category is only for course-level file resources")

        # Видео принимается только ссылкой (YouTube): загрузка видеофайлов отключена.
        # Формат проверяется по той же причине, что и у Zoom: из ссылки собирается
        # embed-адрес плеера, и мусор здесь ломал бы страницу урока у студента, а
        # не форму у преподавателя.
        # Zoom — тоже ссылка с проверкой: по ней собирается номер встречи для
        # Meeting SDK.
        field_by_type = {
            "file": self.file_url,
            "link": self.link_url,
            "text": self.text_content,
            "video": self.link_url,
            "zoom": self.link_url,
        }
        if not field_by_type[self.resource_type]:
            raise ValueError(f"{self.resource_type} resource requires the matching content field to be set")
        if self.resource_type == "video":
            from app.core.utils.youtube_link import parse_youtube_link

            parse_youtube_link(self.link_url or "")
        if self.resource_type == "zoom":
            from app.core.utils.zoom_link import parse_zoom_link

            parse_zoom_link(self.link_url or "")
        if self.resource_type == "link":
            # `video` va `zoom` havolasini o'z parserlari tekshiradi, `link` esa
            # ixtiyoriy manzil — shuning uchun hech bo'lmasa sxemasi tekshiriladi.
            # `javascript:` shu yerda to'xtatilmasa, bazaga tushadi va uni faqat
            # React render paytida to'sadi; eksport yoki pochta xabarida esa
            # hech kim to'smaydi.
            from app.core.utils.safe_url import normalize_url

            self.link_url = normalize_url(self.link_url or "")
        return self


class ResourceUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    file_url: Optional[str] = None
    link_url: Optional[str] = None
    text_content: Optional[str] = None
    order_index: Optional[int] = None


class ResourceLessonInfo(BaseModel):
    id: int
    topic: str
    model_config = ConfigDict(from_attributes=True)


class ResourceCourseInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class ResourceResponse(BaseModel):
    id: int
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    resource_type: RESOURCE_TYPES
    category: RESOURCE_CATEGORIES = "library"
    title: str
    file_url: Optional[str] = None
    link_url: Optional[str] = None
    text_content: Optional[str] = None
    order_index: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    lesson: Optional[ResourceLessonInfo] = None
    course: Optional[ResourceCourseInfo] = None

    model_config = ConfigDict(from_attributes=True)


class ResourceListRequest(BaseModel):
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None

    page: int = 1
    limit: int = 50

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class ResourceListResponse(BaseModel):
    total: int
    page: int
    limit: int
    resources: List[ResourceResponse]
