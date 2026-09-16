"""YouTube havolasidan video identifikatorini ajratish.

Dars videosi faqat havola bilan qo'shiladi (fayl yuklash o'chirilgan), pleyer
esa ``youtube-nocookie.com/embed/<id>`` ni ochadi. Demak havolada identifikator
bo'lishi shart: bo'lmasa, oyna havolani jimgina qabul qilar, dars sahifasida
esa video o'rniga oddiy matnli havola qolib ketardi — xatoni o'qituvchi
saqlaganda emas, talaba darsga kirganda ko'rardi.

Qabul qilinadigan shakllar:

    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    https://youtu.be/dQw4w9WgXcQ?t=30
    https://www.youtube.com/embed/dQw4w9WgXcQ
    https://www.youtube.com/shorts/dQw4w9WgXcQ
    https://www.youtube.com/live/dQw4w9WgXcQ
    youtube.com/watch?v=dQw4w9WgXcQ             <- sxemasiz nusxa

Frontenddagi ``frontend/src/utils/youtube.ts`` shu qoidani takrorlaydi: bekend
haqiqatni saqlaydi, frontend esa xatoni maydon yonida, so'rov ketmasdan oldin
ko'rsatadi va o'sha identifikator bilan pleyerni yig'adi.
"""

import re
from urllib.parse import parse_qs, urlparse

# YouTube identifikatori — 11 ta belgi. Uni "yalang'och" holda qabul qilmaymiz:
# `not-a-video` ham aynan shu shaklga tushadi va tekshiruvdan o'tib ketardi.
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_PATH_ID_RE = re.compile(r"^/(?:embed|shorts|live|v|e)/([A-Za-z0-9_-]{11})")
_ALLOWED_HOSTS = {"youtube.com", "youtube-nocookie.com", "youtu.be"}


class YouTubeLinkError(ValueError):
    """Havola YouTube videosiga o'xshamaydi."""


def _host_allowed(hostname: str) -> bool:
    host = hostname.lower().removeprefix("www.")
    return host in _ALLOWED_HOSTS or any(host.endswith(f".{allowed}") for allowed in _ALLOWED_HOSTS)


def parse_youtube_link(raw: str) -> str:
    """Havoladan video identifikatorini qaytaradi yoki ``YouTubeLinkError``."""
    value = (raw or "").strip()
    if not value:
        raise YouTubeLinkError("Video havolasi bo'sh")

    parsed = urlparse(value if "//" in value else f"https://{value}")
    if not parsed.hostname or not _host_allowed(parsed.hostname):
        raise YouTubeLinkError(
            "Havola YouTube videosiga o'xshamaydi (youtube.com yoki youtu.be bo'lishi kerak)"
        )

    if parsed.hostname.lower().removeprefix("www.") == "youtu.be":
        candidate = parsed.path.lstrip("/").split("/")[0]
    elif parsed.path.rstrip("/") == "/watch":
        candidate = (parse_qs(parsed.query).get("v") or [""])[0]
    else:
        match = _PATH_ID_RE.match(parsed.path)
        candidate = match.group(1) if match else ""

    if not _VIDEO_ID_RE.match(candidate):
        raise YouTubeLinkError(
            "Havolada video identifikatori topilmadi. YouTube'dagi «Share» tugmasidan "
            "olingan havolani qo'ying (masalan https://www.youtube.com/watch?v=dQw4w9WgXcQ)"
        )
    return candidate
