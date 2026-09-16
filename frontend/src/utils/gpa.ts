/**
 * GPA ni ko'rsatish: nol — «ma'lumot yo'q», baho emas.
 *
 * HEMIS'ning ro'yxat API si `avg_gpa` ni hamma uchun nol qaytaradi (faqat
 * shaxsiy `/account/me` da haqiqiy qiymat bor), shuning uchun
 * `student_sync.py::_is_blank` ham nolni «bo'sh» deb hisoblaydi va uni
 * bazadagi ma'lum qiymat ustiga yozmaydi. Ekranda esa o'sha nol «0.0» bo'lib
 * chiqardi — ya'ni bilmasligimiz eng past baho bo'lib ko'rinardi. Bazada
 * 10031 talabadan 4309 tasida aynan shunday nol turibdi (o'lchandi
 * 2026-09-16).
 *
 * Haqiqiy nol GPA amalda bo'lmaydi: birinchi semestr topshirilmaguncha baho
 * yo'q, topshirilgandan keyin esa u noldan katta.
 */
export const formatGpa = (value?: number | null): string =>
    typeof value === 'number' && value > 0 ? value.toFixed(1) : '—';
