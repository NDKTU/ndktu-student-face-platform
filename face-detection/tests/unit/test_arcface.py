"""MobileFaceNet dvigateli: tekislash va oʻxshashlik.

Bu yerdagi testlarning koʻpi tekislashga tegishli, chunki aynan u jimgina
buziladigan qism. Ishlab chiqish paytida koʻzlar shablonga teskari
bogʻlanib qolgan edi: servis ishlashda davom etardi, vektorlar ham
qaytarilardi — faqat ular odamlarni butunlay ajratmasdi (notoʻgʻri qabul
100%). Kod darajasida hech qanday xato koʻrinmasdi.
"""

import numpy as np
import pytest

from app.services import arcface


class _Point:
    """MediaPipe ``NormalizedKeypoint`` oʻrnini bosadi."""

    def __init__(self, x: float, y: float) -> None:
        self.x = x
        self.y = y


def _frame(width: int = 300, height: int = 300) -> np.ndarray:
    return np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)


def _keypoints(width: int = 300, height: int = 300):
    """Tik turgan yuzning nuqtalari: chap koʻz, oʻng koʻz, burun, ogʻiz.

    Tartib **tasvir** boʻyicha — birinchi nuqta chapda turadi.
    """
    return [
        _Point(0.38, 0.42),  # tasvirning chap yarmidagi koʻz
        _Point(0.62, 0.42),  # oʻng yarmidagi koʻz
        _Point(0.50, 0.55),  # burun
        _Point(0.50, 0.70),  # ogʻiz
    ]


def test_alignment_returns_the_expected_crop_size():
    result = arcface.align(_frame(), _keypoints())
    assert result is not None
    assert result.shape == (arcface.INPUT_SIZE, arcface.INPUT_SIZE, 3)


def test_eyes_land_on_the_template_positions():
    """Asosiy tekshiruv: koʻzlar shablon joyiga tushadimi.

    Almashib ketsa, yuz koʻzguga tushadi va model uni boshqa odam deb
    koʻradi — bu xato faqat shu tekshiruvda bilinadi.
    """
    width = height = 300
    points = _keypoints(width, height)
    source = np.array([[p.x * width, p.y * height] for p in points], dtype=np.float64)
    target = np.array(
        [arcface._TEMPLATE[0], arcface._TEMPLATE[1], arcface._TEMPLATE[2], arcface._TEMPLATE_MOUTH_CENTER],
        dtype=np.float64,
    )

    matrix = arcface._similarity_transform(source, target)
    mapped = (matrix[:, :2] @ source.T).T + matrix[:, 2]

    # Chap koʻz shablonning chap tomonida qolishi kerak (x ~38, ~73 emas).
    assert mapped[0][0] < mapped[1][0], "koʻzlar almashib ketdi"
    assert abs(mapped[0][0] - arcface._TEMPLATE[0][0]) < 6
    assert abs(mapped[1][0] - arcface._TEMPLATE[1][0]) < 6


def test_face_fills_the_crop():
    """Yuz kesikni toʻldirishi kerak, burchakda kichkina boʻlib qolmasligi.

    Ilgari LMEDS toʻrtta nuqtada masshtabni juda kichik qilib yuborardi va
    natijada model asosan qora fonni koʻrardi.
    """
    width = height = 300
    points = _keypoints(width, height)
    source = np.array([[p.x * width, p.y * height] for p in points], dtype=np.float64)
    target = np.array(
        [arcface._TEMPLATE[0], arcface._TEMPLATE[1], arcface._TEMPLATE[2], arcface._TEMPLATE_MOUTH_CENTER],
        dtype=np.float64,
    )
    matrix = arcface._similarity_transform(source, target)
    mapped = (matrix[:, :2] @ source.T).T + matrix[:, 2]

    eye_span = abs(mapped[1][0] - mapped[0][0])
    expected = abs(arcface._TEMPLATE[1][0] - arcface._TEMPLATE[0][0])
    assert eye_span == pytest.approx(expected, abs=4)


def test_rotated_face_is_straightened():
    """Qiyshiq bosh tik holatga keltiriladi.

    Nuqtalar **birga** buriladi: faqat koʻzlarni burib, burun bilan ogʻizni
    joyida qoldirish mumkin boʻlmagan yuzni yasardi va oʻxshashlik
    almashtirishi uni tiklay olmasdi.
    """
    width = height = 300
    angle = np.radians(25)
    cos, sin = np.cos(angle), np.sin(angle)
    center = np.array([0.50, 0.50])

    straight = np.array([[0.38, 0.42], [0.62, 0.42], [0.50, 0.55], [0.50, 0.70]])
    rotation = np.array([[cos, -sin], [sin, cos]])
    tilted = (straight - center) @ rotation.T + center

    source = np.array([[x * width, y * height] for x, y in tilted], dtype=np.float64)
    target = np.array(
        [arcface._TEMPLATE[0], arcface._TEMPLATE[1], arcface._TEMPLATE[2], arcface._TEMPLATE_MOUTH_CENTER],
        dtype=np.float64,
    )
    matrix = arcface._similarity_transform(source, target)
    mapped = (matrix[:, :2] @ source.T).T + matrix[:, 2]

    # Tekislangandan keyin koʻzlar shablondagidek bir sathda boʻladi.
    assert abs(mapped[0][1] - mapped[1][1]) < 2
    assert mapped[0][0] < mapped[1][0]


def test_alignment_needs_four_points():
    assert arcface.align(_frame(), None) is None
    assert arcface.align(_frame(), _keypoints()[:2]) is None


def test_cosine_similarity_bounds():
    vector = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    assert arcface.cosine_similarity(vector, vector) == pytest.approx(1.0)
    assert arcface.cosine_similarity(vector, np.array([0.0, 1.0, 0.0])) == pytest.approx(0.0)
    assert arcface.cosine_similarity(vector, -vector) == pytest.approx(-1.0)


def test_cosine_similarity_survives_zero_vector():
    """Nolga boʻlish oʻrniga 0 qaytadi — yaʼni «mos kelmadi»."""
    assert arcface.cosine_similarity(np.zeros(3), np.ones(3)) == 0.0
