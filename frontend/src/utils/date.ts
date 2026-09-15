/**
 * Sana formati bitta joyda. Brauzer standarti («8/27/2026, 11:49:47 AM»)
 * o'qishga noqulay va til sozlamasiga qarab o'zgarib turadi, shuning uchun
 * hamma joyda «27.08.2026, 11:49» ko'rinishi ishlatiladi.
 *
 * `toLocale*` ni argumentsiz chaqirish ayniqsa xavfli: natijani brauzer tili
 * belgilaydi, ya'ni bitta jadvalni ikki xodim ikki xil ko'radi (`3/4/2026`
 * amerikacha 4-mart, ruscha 3-aprel). Shu sababli `toLocaleDateString`,
 * `toLocaleString` va `toLocaleTimeString` ESLint bilan shu fayldan tashqarida
 * taqiqlangan — yangi joy kerak bo'lsa shu yerga funksiya qo'shiladi.
 *
 * Format `uz` va `ru` da bir xil o'qilgani uchun i18n ga bog'lanmaydi.
 */
const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Faqat-sana satri: `lesson.date` kabi maydonlar bekenddan `2026-09-12`
 * ko'rinishida keladi (`datetime.date`, vaqt mintaqasisiz).
 */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Faqat-sana satrini `Date` ga bermaslik kerak: spetsifikatsiya bo'yicha u
 * UTC yarim tuni deb o'qiladi, `getDate()` esa mahalliy vaqtni qaytaradi —
 * manfiy siljishli mintaqada (UTC−5) kun bir kunga orqaga surilardi.
 * Shuning uchun bunday satrning qismlari shunchaki joyida almashtiriladi.
 */
const dateOnlyParts = (value?: string | Date | null): [string, string, string] | null => {
    if (typeof value !== 'string') return null;
    const match = DATE_ONLY_RE.exec(value.trim());
    return match ? [match[3], match[2], match[1]] : null;
};

const parse = (value?: string | Date | null): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** «27.08.2026». Qiymat yo'q yoki noto'g'ri bo'lsa — «—». */
export const formatDate = (value?: string | Date | null): string => {
    const parts = dateOnlyParts(value);
    if (parts) return parts.join('.');
    const date = parse(value);
    if (!date) return '—';
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

/** «27.08» — jadval ustuni tor bo'lgan joylar uchun (davomat jurnali). */
export const formatDayMonth = (value?: string | Date | null): string => {
    const parts = dateOnlyParts(value);
    if (parts) return `${parts[0]}.${parts[1]}`;
    const date = parse(value);
    if (!date) return '—';
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
};

/** «11:49» — soat kerak bo'lgan, sana esa kontekstdan ma'lum joylar uchun. */
export const formatTime = (value?: string | Date | null): string => {
    const date = parse(value);
    if (!date) return '—';
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * «27.08.2026, 11:49» — soniyalarsiz: ular hech qayerda kerak emas.
 *
 * Faqat-sana satri berilsa soat qo'shilmaydi: `2026-09-12` uchun «, 00:00»
 * yozish mavjud bo'lmagan aniqlikni ko'rsatgan bo'lardi.
 */
export const formatDateTime = (value?: string | Date | null): string => {
    if (dateOnlyParts(value)) return formatDate(value);
    const date = parse(value);
    if (!date) return '—';
    return `${formatDate(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
