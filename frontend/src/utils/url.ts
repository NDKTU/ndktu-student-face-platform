/**
 * Tashqi havolani tekshirish va normallashtirish.
 *
 * Bekenddagi `announcement/schemas.py::_normalize_link` bilan bir xil qoida.
 * Ikki joyda takrorlanishining sababi: bekend haqiqatni saqlaydi, frontend esa
 * xatoni maydon yonida, so'rov ketmasidan oldin ko'rsatadi.
 */

/** `null` — havola yaroqsiz. Bo'sh satr uchun `undefined` (havola yo'q). */
export const normalizeExternalUrl = (raw: string): string | null | undefined => {
    const value = raw.trim();
    if (!value) return undefined;

    // Sxemasi yo'q manzil rad etilmaydi: odamlar `epmos.nsumt.uz/...` deb
    // ko'chirib qo'yishadi, buni xato deb qaytarish bekorga to'siq bo'lardi.
    // `//nsumt.uz/x` — sxemasiz nusxa ko'chirishning odatiy shakli.
    const candidate = /^[a-z][a-z\d+\-.]*:/i.test(value)
        ? value
        : value.startsWith('//')
          ? `https:${value}`
          : `https://${value}`;

    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        return null;
    }

    // `javascript:` va `data:` ataylab rad etiladi — e'lonni o'qituvchi
    // yozadi, havola esa boshqa talabalarning brauzerida ochiladi.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // Domensiz manzil havola emas: `not-a-url` `https://not-a-url` bo'lib
    // o'tib ketardi va brauzer uni ichki yo'l deb ochardi.
    if (!parsed.hostname.includes('.')) return null;

    return candidate;
};

/** Forma uchun xato matni — bekenddagi xabar bilan bir xil ma'noda. */
export const EXTERNAL_LINK_ERROR =
    "Havola http:// yoki https:// bilan boshlanishi va to'g'ri domenga ega bo'lishi kerak "
    + '(masalan https://epmos.nsumt.uz)';
