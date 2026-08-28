/**
 * Sana formati bitta joyda. Brauzer standarti («8/27/2026, 11:49:47 AM»)
 * o'qishga noqulay va til sozlamasiga qarab o'zgarib turadi, shuning uchun
 * hamma joyda «27.08.2026, 11:49» ko'rinishi ishlatiladi.
 */
const pad = (value: number) => String(value).padStart(2, '0');

const parse = (value?: string | Date | null): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** «27.08.2026» */
export const formatDate = (value?: string | Date | null): string => {
    const date = parse(value);
    if (!date) return '—';
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

/** «27.08.2026, 11:49» — soniyalarsiz: ular hech qayerda kerak emas. */
export const formatDateTime = (value?: string | Date | null): string => {
    const date = parse(value);
    if (!date) return '—';
    return `${formatDate(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
