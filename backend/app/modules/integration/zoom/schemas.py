from pydantic import BaseModel


class ZoomJoinRequest(BaseModel):
    """Imzo dars bo'yicha so'raladi, uchrashuv raqami bo'yicha emas.

    Aks holda tizimga kirgan istalgan odam istalgan (shu jumladan begona)
    Zoom uchrashuvi uchun imzo olib, uni o'z saytida ishlatishi mumkin edi.
    Server o'zi darsning Zoom havolasini topadi va ruxsatni tekshiradi.
    """

    lesson_id: int


class ZoomJoinResponse(BaseModel):
    signature: str
    sdk_key: str
    meeting_number: str
    passcode: str | None = None
    # Havola SDK ishga tushmagan holat uchun: «Zoom ilovasida ochish».
    join_url: str
    topic: str
