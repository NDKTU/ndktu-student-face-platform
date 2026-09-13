from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict

from app.core.schemas import TashkentDatetime

CHECK_STAGES = Literal["join", "random"]
CHECK_STATUSES = Literal[
    "ok",
    "no_face",
    "multiple_faces",
    "different_person",
    "no_reference",
    "no_camera",
    # Sahifa fonda qolgan (talaba boshqa tabga o'tgan). Kadr olinsa ham
    # ishonchsiz: brauzer fon tabidagi taymerlarni sekinlashtiradi va kamera
    # qora kadr berishi mumkin. Talabani ayblamaydi.
    "page_hidden",
]


class FaceCheckRequest(BaseModel):
    # Kadr — base64 JPEG. Tekshiruvni server bajaradi: natijaga mijoz emas,
    # faqat servis qaror qiladi.
    image_base64: Optional[str] = None
    stage: CHECK_STAGES = "random"
    # Kamera ochilmagan/ruxsat berilmagan holat: kadrsiz keladi.
    camera_unavailable: bool = False
    # Sahifa tekshiruv paytida ko'rinmayotgan edi (`document.visibilityState`).
    # Mijoz aytadi, lekin bu «ishonch» masalasi emas: yolg'on aytish talabaga
    # foyda bermaydi — natija baribir «tekshirilmadi» bo'lib qoladi.
    page_hidden: bool = False


class FaceCheckResponse(BaseModel):
    id: int
    status: CHECK_STATUSES
    # Talabaga ko'rsatiladigan qisqa izoh.
    message: str


class FaceCheckItem(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    stage: CHECK_STAGES
    status: CHECK_STATUSES
    has_image: bool
    created_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class AbsencePeriod(BaseModel):
    """Yuz ko'rinmagan bir davr.

    `end` `None` bo'lsa — talaba oxirigacha qaytmagan.
    """

    start: TashkentDatetime
    end: Optional[TashkentDatetime] = None
    # Davomiyligi sekundda. Ochiq davr uchun oxirgi tekshiruvgacha hisoblanadi.
    duration_seconds: int
    # Davrga kirgan kadrlar soni va ulardagi statuslar — o'qituvchi sababni
    # ko'rishi uchun («boshqa odam» va «yuz yo'q» bir xil emas).
    checks: int
    statuses: List[str]
    # Shu davrda saqlangan suratlarning tekshiruv id'lari. Surat har bir
    # kadrdan emas, davr boshidan bir-ikkitasi olinadi — dalil uchun shu
    # yetarli, qolgani diskni to'ldirardi.
    image_check_ids: List[int] = []


class FaceCheckStudentSummary(BaseModel):
    user_id: int
    user_name: Optional[str] = None
    total: int
    passed: int
    failed: int
    # Kuzatuv oynasi: talabaning birinchi va oxirgi tekshiruvi. Dars sanasi
    # emas — bizni qiziqtirgani «shu talaba qancha vaqt kuzatuvda bo'ldi».
    first_check: Optional[TashkentDatetime] = None
    last_check: Optional[TashkentDatetime] = None
    # Kuzatuv oynasining umumiy uzunligi.
    tracked_seconds: int = 0
    # Shundan necha sekund yuz ko'rinmagan.
    absent_seconds: int = 0
    periods: List[AbsencePeriod] = []
    # Oxirgi davr yopilmagan: yuz qaytmadi.
    ended_absent: bool = False
    # Tekshiruvlar oxirigacha davom etdimi. `False` — talaba brauzerni
    # yopgan yoki Zoom ilovasiga o'tgan bo'lishi mumkin.
    left_early: bool = False

    model_config = ConfigDict(from_attributes=True)


class FaceCheckReportResponse(BaseModel):
    lesson_id: int
    students: List[FaceCheckStudentSummary]
