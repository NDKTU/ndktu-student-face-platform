/**
 * Server xato kodlarining tarjimasi.
 *
 * Bekend javobda kod ham, matn ham beradi:
 *
 *     {"detail": {"code": "invalid_pin", "message": "PIN kod noto'g'ri"}}
 *
 * Matnni to'g'ridan-to'g'ri ko'rsatish tilni serverga bog'lab qo'yadi: server
 * foydalanuvchining tilini bilmaydi, shuning uchun ruscha interfeysdagi odam
 * o'zbekcha xabar ko'rardi. Kod esa barqaror — tarjima shu bo'yicha topiladi.
 *
 * Qiymatlar — o'zbekcha satrlar, chunki loyihada «tabiiy kalit» usuli:
 * kalitning o'zi o'zbekcha tarjima, `ru.json` esa uni ruschaga almashtiradi
 * (`i18n/index.ts` ga qarang). Shuning uchun bu yerda kod → o'zbekcha satr,
 * keyin `t()`.
 *
 * Ro'yxatda yo'q kod xato emas: chaqiruvchi serverdagi `message` ni
 * ko'rsatadi. Ya'ni yangi xato qo'shilganda frontend eskirsa ham, odam
 * bo'sh joy emas, mazmunli matn ko'radi.
 *
 * Manba: `backend/app/modules/quiz/quiz_process/errors.py`.
 */
export const ERROR_CODE_MESSAGES: Record<string, string> = {
    quiz_not_found: 'Test topilmadi',
    quiz_not_active: 'Test faol emas',
    invalid_pin: "PIN kod noto'g'ri",
    quiz_not_for_your_group: "Bu test sizning guruhingiz uchun mo'ljallanmagan",
    quiz_has_no_questions: "Bu testda savollar yo'q. Iltimos administratorga murojaat qiling.",
    student_photo_missing: 'Sizning suratingiz topilmadi. Profilingizga surat yuklang.',
    attempt_expired: 'Urinish vaqti tugagan',
    attempt_expired_ask_teacher: "Urinish vaqti tugagan. Yangi urinish uchun o'qituvchiga murojaat qiling.",
    attempt_not_found: 'Urinish topilmadi',
    not_your_attempt: 'Bu sizning urinishingiz emas',
    attempt_already_finished: 'Bu urinish allaqachon yakunlangan',
    question_not_in_attempt: 'Bu savol sizning urinishingizga kirmaydi',
    question_not_found: 'Savol topilmadi',
    invalid_option_index: "Variant raqami noto'g'ri",
};
