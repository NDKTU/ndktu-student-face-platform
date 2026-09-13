from pydantic import BaseModel


class JitsiJoinRequest(BaseModel):
    """Xona dars bo'yicha so'raladi, nom bo'yicha emas.

    Zoom'dagi kabi: aks holda tizimga kirgan istalgan odam istalgan xonaga
    kirish ma'lumotini olardi. Server o'zi darsning Jitsi havolasini topadi
    va ruxsatni tekshiradi.
    """

    lesson_id: int


class JitsiJoinResponse(BaseModel):
    # Zoom'dan farqi — imzo yo'q: ochiq Jitsi serverida xonaga qo'shilish
    # uchun kalit talab qilinmaydi.
    room: str
    domain: str
    #: SDK ishga tushmagan holat uchun: «Brauzerda ochish».
    join_url: str
    topic: str
