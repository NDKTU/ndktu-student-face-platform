"""Jonlilik (MiniFASNet): kesik geometriyasi va model yoʻqligidagi xulq.

Kesik — jim buziladigan qism: model 80x80 da, yuz ramkasidan aniq 2.7 va
4.0 barobar kengroq kesikda oʻrgatilgan. Boshqacha kesik xato bermaydi, faqat
ehtimollarni siljitadi va tirik talabani «rasm» deb rad eta boshlaydi.
"""

import numpy as np

from app.services import liveness


def _frame(width: int = 640, height: int = 480) -> np.ndarray:
    return np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)


def test_crop_is_model_sized():
    face = liveness.crop_face(_frame(), 270, 190, 100, 100, scale=2.7)
    assert face.shape == (liveness.INPUT_SIZE, liveness.INPUT_SIZE, 3)


def test_crop_takes_scaled_region_around_face():
    # Har bir piksel oʻz koordinatasini saqlaydi — kesik qayerdan olinganini
    # natijadan oʻqish mumkin.
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:, :, 0] = np.arange(640, dtype=np.uint32)[np.newaxis, :] % 256
    face = liveness.crop_face(frame, 300, 200, 40, 40, scale=2.7)
    # Markaz (320) atrofida 40*2.7=108 px: chap chet ~266, oʻng chet ~374.
    left, right = int(face[40, 0, 0]), int(face[40, -1, 0])
    assert abs(left - 266 % 256) <= 3
    assert abs(right - (374 % 256)) <= 3


def test_crop_shrinks_scale_at_frame_edge():
    # Yuz deyarli butun kadr: 4.0 barobar kengaytma kadrga sigʻmaydi — asl
    # loyihadagi kabi masshtab kadr ichida qolguncha kichrayadi, xato yoʻq.
    face = liveness.crop_face(_frame(), 50, 20, 540, 440, scale=4.0)
    assert face.shape == (liveness.INPUT_SIZE, liveness.INPUT_SIZE, 3)


def test_crop_rejects_empty_box():
    assert liveness.crop_face(_frame(), 10, 10, 0, 40, scale=2.7) is None


def test_missing_model_files_disable_liveness(tmp_path):
    # Model fayllari yoʻq (lokal ishlab chiqish) — baholanmaydi, lekin yuz
    # tekshiruvi toʻxtamasligi uchun xato ham tashlanmaydi.
    model = liveness.LivenessModel([(str(tmp_path / "absent.onnx"), 2.7)])
    assert model.score(_frame(), 270, 190, 100, 100) is None
    # Ikkinchi murojaat ham jim — fayl tizimiga har safar qaramaydi.
    assert model.score(_frame(), 270, 190, 100, 100) is None


def test_softmax_rows_sum_to_one():
    probabilities = liveness._softmax(np.array([[2.0, 5.0, -1.0]]))
    assert np.isclose(probabilities.sum(), 1.0)
    assert int(np.argmax(probabilities)) == liveness.REAL_CLASS
