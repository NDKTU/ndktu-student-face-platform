import i18n from '@/i18n';
import { ERROR_CODE_MESSAGES } from '@/utils/errorCodes';

/**
 * Bekend xatosidan ko'rsatish uchun matn oladi.
 *
 * FastAPI uch xil `detail` qaytaradi:
 *   * `{code, message}` — kodli xato (`quiz_process/errors.py`). Tarjima kod
 *     bo'yicha topiladi, topilmasa serverning `message` i ko'rsatiladi;
 *   * satr — kodsiz eski `HTTPException`;
 *   * `[{loc, msg, type}]` — sxema tekshiruvi (422). Ro'yxatni to'g'ridan-
 *     to'g'ri JSX ichiga qo'yish React'ni yiqitadi ("Objects are not valid as
 *     a React child"), ya'ni oddiy forma xatosi o'rniga oq ekran chiqadi.
 */
export function apiErrorMessage(cause: unknown, fallback: string): string {
    const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;

    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        const { code, message } = detail as { code?: string; message?: string };
        // `i18n.t` — React'dan tashqarida: xato ishlov berish hook ichida
        // bo'lmasligi mumkin (masalan, mutatsiyaning `onError` i).
        if (code && ERROR_CODE_MESSAGES[code]) return i18n.t(ERROR_CODE_MESSAGES[code]);
        if (message) return message;
    }

    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        const first = detail.find((item) => typeof (item as { msg?: unknown })?.msg === 'string') as
            | { msg?: string }
            | undefined;
        // Pydantic xabari "Value error, ..." bilan boshlanadi — bu foydalanuvchiga
        // kerak emas, faqat matnning o'zi qoladi.
        if (first?.msg) return first.msg.replace(/^Value error,\s*/, '');
    }
    return fallback;
}
