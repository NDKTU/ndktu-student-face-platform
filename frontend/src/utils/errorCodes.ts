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
    face_verification_required: 'Testga kirish uchun avval yuzingizni tasdiqlang',
    face_entry_not_required: 'Bu testga kirishda yuz tekshirilmaydi',
    face_service_unavailable: "Yuz tekshiruvi xizmati javob bermadi. Birozdan keyin qayta urinib ko'ring.",
    attempt_closed_left_page: 'Test yopildi: siz sahifadan chiqdingiz',
    strict_mode_disabled: "Bu testda qat'iy rejim yoqilmagan",
    zoom_session_not_found: "Seans topilmadi",
    zoom_session_not_yours: "Bu seans sizniki emas",
    zoom_not_your_group: "Bu seans sizning guruhingiz uchun emas",
    zoom_session_not_open: "Seans hali boshlanmagan",
    zoom_session_closed: "Seans vaqti tugagan — kirib bo'lmaydi",
    zoom_face_check_disabled: "Bu seansda yuz nazorati o'chirilgan",
    zoom_not_configured: "Zoom integratsiyasi sozlanmagan",
    zoom_link_required: "Zoom havolasini qo'ying — avtomatik yaratish sozlanmagan",
    zoom_not_managed: "Uchrashuv LMS orqali yaratilmagan — uni Zoom ilovasida o'zingiz boshlang",
    zoom_api_error: "Zoom so'rovni bajarmadi. Keyinroq urinib ko'ring yoki administratorga murojaat qiling",
    zoom_account_not_found: "Zoom akkaunti topilmadi",
    zoom_teacher_required: "O'qituvchini tanlang",
    zoom_teacher_not_found: "O'qituvchi topilmadi",
    zoom_teacher_locked: "O'qituvchi faqat o'zi uchun seans yarata oladi",
    zoom_subject_required: "Fanni tanlang",
    zoom_subject_not_teachers: "Bu fan tanlangan o'qituvchiga biriktirilmagan",
    zoom_account_cannot_create: "Bu akkauntda Zoom API sozlanmagan — havolani qo'ying yoki boshqa akkauntni tanlang",
    zoom_account_busy: "Bu akkauntda shu vaqtda boshqa seans bor — bitta litsenziya bir vaqtda bitta uchrashuv",
    zoom_no_free_account: "Bu vaqtda bo'sh Zoom akkaunt yo'q — boshqa vaqtni tanlang",
    zoom_account_required: "Uchrashuv qaysi Zoom akkauntiniki ekanini aniqlab bo'lmadi — akkauntni tanlang",
    zoom_account_env_readonly: "Bu akkaunt serverdagi .env faylidan olinadi — uni o'sha yerda o'zgartiring",
    zoom_account_name_taken: "Bu nomli akkaunt allaqachon bor",
    zoom_account_in_use: "Akkauntga seanslar bog'langan — o'chirish o'rniga uni faolsizlantiring",
    zoom_account_incomplete_api: "Zoom API uchun Account ID, Client ID, Client Secret va host email to'rttasi ham kerak",
    zoom_account_sdk_secret_required: "Meeting SDK Client Secret kerak",
    // Sinxronizatsiyalar (`core/errors.py`): EPMOS, HEMIS talabalar, jadval.
    sync_in_progress: 'Sinxronizatsiya allaqachon ketmoqda — tugashini kuting',
    preview_expired: "Ko'rib chiqish muddati tugagan — preview'ni qaytadan ishga tushiring",
    // Profil: login va parolni almashtirish (`auth/user/repository.py`).
    current_password_wrong: "Joriy parol noto'g'ri",
    username_taken: 'Bu foydalanuvchi nomi allaqachon band',
    nothing_to_update: "Kamida bitta maydon o'zgartirilishi kerak",
};
