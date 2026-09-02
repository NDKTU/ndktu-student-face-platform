"""Yuz tanish chegarasini oʻlchash stendi.

Nima uchun kerak. Chegara — modelning yagona sozlanadigan qismi va u
xavfsizlik bilan qulaylik oʻrtasida turadi. Boʻsh chegara begona odamni
imtihonga kiritadi va proctoring maʼnosini yoʻqotadi; qattiq chegara haqiqiy
talabani imtihon oʻrtasida «boshqa odam» deb belgilaydi. Ikkala xato ham
jimgina sodir boʻladi va kod testlarida umuman koʻrinmaydi.

Model almashtirilganda chegarani «koʻchirib qoʻyish» mumkin emas: dlib
128 oʻlchamli vektorda evklid masofa bilan ishlaydi (0.5), ArcFace oilasi esa
512 oʻlchamli vektorda kosinus oʻxshashlik bilan. Sonlar taqqoslanmaydi.

Shuning uchun bu skript modeldan qatʼi nazar bir xil ish qiladi: juftliklar
yigʻadi, ikkala metrika boʻyicha masofani hisoblaydi va chegaralar boʻyicha
xato darajasini chiqaradi. Uni model almashtirishdan **oldin** va **keyin**
yugurtirib, natijalarni solishtirish kerak.

Ishlatish::

    # 1. Talabalar rasmi havolalarini fayl qilib olish (bekend mashinasida):
    #    psql -tAc "select image_path from students
    #               where image_path like 'http%' order by random() limit 300" > urls.txt
    #
    # 2. Stendni yugurtirish (face-detection konteynerida):
    #    python scripts/calibrate_threshold.py --urls-file urls.txt

Muhim cheklov. Bizda har talabaning **bitta** rasmi bor, yaʼni «bir odamning
ikki xil surati» degan haqiqiy juftlik yoʻq. Shuning uchun ikkinchi surat
sunʼiy yasaladi: studiya rasmiga veb-kameraning odatdagi buzilishlari
qoʻshiladi — qayta siqish, yorugʻlik surilishi, ozgina xiralik va burilish.
Bu haqiqiy juftlikning oʻrnini toʻliq bosmaydi, lekin aynan bizning
holatimizni modellashtiradi: etalon studiya rasmi, tekshirilayotgani esa
veb-kamera kadri. Raqamlarni shu cheklov bilan oʻqish kerak.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import itertools
import random
import sys
from pathlib import Path

import cv2
import httpx
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.video_service import get_detector  # noqa: E402

#: HEMIS bizning xizmatimiz emas — bir vaqtda koʻp soʻrov yubormaymiz.
DOWNLOAD_CONCURRENCY = 4
DOWNLOAD_TIMEOUT = 20.0


# --------------------------------------------------------------------- #
#  Rasmlarni olish
# --------------------------------------------------------------------- #
async def _fetch(client: httpx.AsyncClient, url: str, cache_dir: Path) -> Path | None:
    name = hashlib.sha256(url.encode()).hexdigest()[:16] + ".jpg"
    path = cache_dir / name
    if path.exists():
        return path
    try:
        response = await client.get(url, timeout=DOWNLOAD_TIMEOUT)
        response.raise_for_status()
    except Exception as cause:  # noqa: BLE001
        print(f"  oʻtkazildi ({cause}): {url}", file=sys.stderr)
        return None
    path.write_bytes(response.content)
    return path


async def download_all(urls: list[str], cache_dir: Path) -> list[Path]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(DOWNLOAD_CONCURRENCY)

    async with httpx.AsyncClient(follow_redirects=True) as client:
        async def one(url: str):
            async with semaphore:
                return await _fetch(client, url, cache_dir)

        results = await asyncio.gather(*(one(u) for u in urls))

    return [p for p in results if p is not None]


# --------------------------------------------------------------------- #
#  Veb-kamera kadrini taqlid qilish
# --------------------------------------------------------------------- #
def simulate_webcam(image: np.ndarray, rng: random.Random) -> np.ndarray:
    """Studiya rasmiga veb-kameraning odatdagi buzilishlarini qoʻshadi.

    Har bir bosqich haqiqiy sababdan kelib chiqadi: talaba kamerasi
    past aniqlikda, xona yorugʻligi boshqacha, boshi ozgina qiyshiq,
    va kadr JPEG bilan siqilib yuboriladi (brauzer ``toDataURL`` 0.8).
    """
    height, width = image.shape[:2]

    # Burilish: bosh hech qachon ideal tik turmaydi.
    angle = rng.uniform(-6, 6)
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    out = cv2.warpAffine(image, matrix, (width, height), borderMode=cv2.BORDER_REPLICATE)

    # Aniqlikning tushishi va qayta koʻtarilishi.
    scale = rng.uniform(0.45, 0.75)
    small = cv2.resize(out, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    out = cv2.resize(small, (width, height), interpolation=cv2.INTER_LINEAR)

    # Yorugʻlik va kontrast.
    alpha = rng.uniform(0.80, 1.20)
    beta = rng.uniform(-28, 28)
    out = cv2.convertScaleAbs(out, alpha=alpha, beta=beta)

    # Ozgina xiralik — fokus va harakat.
    if rng.random() < 0.6:
        out = cv2.GaussianBlur(out, (3, 3), rng.uniform(0.4, 1.1))

    # Brauzer kadrni JPEG qilib yuboradi.
    quality = rng.randint(55, 85)
    ok, buffer = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return cv2.imdecode(buffer, cv2.IMREAD_COLOR) if ok else out


# --------------------------------------------------------------------- #
#  Metrikalar
# --------------------------------------------------------------------- #
def euclidean(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(np.asarray(a) - np.asarray(b)))


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    denominator = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / denominator) if denominator else 0.0


def sweep(same: list[float], different: list[float], *, higher_is_match: bool) -> list[tuple]:
    """Chegaralar boʻyicha ikki xil xatoni hisoblaydi.

    ``notoʻgʻri rad`` — haqiqiy talaba «boshqa odam» deb belgilandi.
    ``notoʻgʻri qabul`` — begona odam «oʻsha talaba» deb oʻtkazildi.
    """
    values = sorted(set(np.round(np.concatenate([same, different]), 3)))
    if len(values) > 60:
        step = len(values) // 60
        values = values[::step]

    rows = []
    for threshold in values:
        if higher_is_match:
            rejected = sum(1 for v in same if v < threshold)
            accepted = sum(1 for v in different if v >= threshold)
        else:
            rejected = sum(1 for v in same if v > threshold)
            accepted = sum(1 for v in different if v <= threshold)
        rows.append((
            float(threshold),
            100.0 * rejected / max(1, len(same)),
            100.0 * accepted / max(1, len(different)),
        ))
    return rows


def report(name: str, rows: list[tuple]) -> None:
    print(f"\n  {name}")
    print(f"  {'chegara':>9}  {'notoʻgʻri rad':>14}  {'notoʻgʻri qabul':>16}")
    print("  " + "-" * 45)

    # Teng-xato nuqtasi: ikki xato bir-biriga eng yaqin joy. Amaliy tanlov
    # undan chetga suriladi, lekin muvozanat shu yerda koʻrinadi.
    best = min(rows, key=lambda r: abs(r[1] - r[2]))
    for threshold, frr, far in rows:
        mark = "  <- teng-xato" if (threshold, frr, far) == best else ""
        print(f"  {threshold:9.3f}  {frr:13.1f}%  {far:15.1f}%{mark}")


# --------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--urls-file", required=True, type=Path, help="Har qatorda bitta rasm havolasi")
    parser.add_argument("--sample", type=int, default=300, help="Nechta rasm olinsin")
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/face_calib"), help="Yuklangan rasmlar joyi")
    parser.add_argument("--pairs", type=int, default=3000, help="Nechta «turli odam» juftligi")
    parser.add_argument("--seed", type=int, default=20260902)
    args = parser.parse_args()

    rng = random.Random(args.seed)

    urls = [u.strip() for u in args.urls_file.read_text().splitlines() if u.strip().startswith("http")]
    rng.shuffle(urls)
    urls = urls[: args.sample]
    print(f"Havolalar: {len(urls)} ta")

    paths = asyncio.run(download_all(urls, args.cache_dir))
    print(f"Yuklandi : {len(paths)} ta")

    detector = get_detector()

    # Har rasm uchun ikkita vektor: asl va veb-kameraga oʻxshatilgan.
    originals: list[np.ndarray] = []
    captured: list[np.ndarray] = []
    skipped = 0

    for path in paths:
        image = cv2.imread(str(path))
        if image is None:
            skipped += 1
            continue
        reference = detector.get_face_encoding(image)
        probe = detector.get_face_encoding(simulate_webcam(image, rng))
        if reference is None or probe is None:
            # Etalon rasmda yuz topilmasa, u talaba umuman tekshirilmaydi —
            # bu ham oʻz-oʻzidan bilib qoʻyishga arziydigan raqam.
            skipped += 1
            continue
        originals.append(np.asarray(reference))
        captured.append(np.asarray(probe))

    print(f"Yuz topildi: {len(originals)} ta  (oʻtkazildi: {skipped})")
    if len(originals) < 20:
        print("Maʼlumot juda kam — natija ishonchsiz.", file=sys.stderr)
        return 1

    # Bir odam: asl surat va uning veb-kamera koʻrinishi.
    same_euclid = [euclidean(o, c) for o, c in zip(originals, captured)]
    same_cosine = [cosine_similarity(o, c) for o, c in zip(originals, captured)]

    # Turli odamlar: bittasining etaloni va boshqasining kadri.
    indexes = list(range(len(originals)))
    combos = list(itertools.permutations(indexes, 2))
    rng.shuffle(combos)
    combos = combos[: args.pairs]
    different_euclid = [euclidean(originals[i], captured[j]) for i, j in combos]
    different_cosine = [cosine_similarity(originals[i], captured[j]) for i, j in combos]

    print(f"\nJuftliklar: bir odam {len(same_euclid)} ta, turli odam {len(different_euclid)} ta")
    print(f"Vektor oʻlchami: {len(originals[0])}")

    report("EVKLID MASOFA  (kichik = mos keladi)", sweep(same_euclid, different_euclid, higher_is_match=False))
    report("KOSINUS OʻXSHASHLIK  (katta = mos keladi)", sweep(same_cosine, different_cosine, higher_is_match=True))

    print(
        "\nEslatma: «bir odam» juftliklari sunʼiy — bitta suratdan yasalgan.\n"
        "Haqiqiy veb-kamera kadri bundan koʻra koʻproq farq qiladi, yaʼni\n"
        "haqiqiy «notoʻgʻri rad» darajasi shu yerdagidan yuqori boʻladi."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
