/**
 * Sana va vaqt maydonlari uchun sof funksiyalar (`DatePicker`, `TimeField`,
 * `PairPicker`). Alohida faylda — komponentlar fayli faqat komponent
 * eksport qilsin (fast refresh) va bularni to'g'ridan-to'g'ri sinash mumkin bo'lsin.
 */
import { MONTHS, WEEKDAYS, parseIsoDate } from '@/components/schedule/scheduleUtils';
import type { PairTime } from '@/services/zoomSessionService';

/** «Shanba, 17-oktabr 2026». Satr mahalliy sana sifatida o'qiladi — kun surilmaydi. */
export const formatLongDate = (iso: string): string => {
    const date = parseIsoDate(iso);
    return `${WEEKDAYS[(date.getDay() + 6) % 7]}, ${date.getDate()}-${MONTHS[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
};

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Qo'lda yozilgan vaqtni «HH:MM» ga keltiradi: «930» → «09:30», «14» → «14:00»,
 * «9:5» → «09:05», «1430» → «14:30». Noto'g'ri bo'lsa — `null`.
 */
export const normalizeTime = (raw: string): string | null => {
    const text = raw.trim();
    if (!text) return null;
    let hours: number;
    let minutes: number;
    if (text.includes(':')) {
        const [h, m = '0'] = text.split(':');
        hours = Number(h);
        minutes = Number(m);
    } else {
        const digits = text.replace(/\D/g, '');
        if (!digits || digits.length > 4) return null;
        if (digits.length <= 2) {
            hours = Number(digits);
            minutes = 0;
        } else {
            hours = Number(digits.slice(0, digits.length - 2));
            minutes = Number(digits.slice(-2));
        }
    }
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59 || hours < 0 || minutes < 0) {
        return null;
    }
    return `${pad(hours)}:${pad(minutes)}`;
};

/** Joriy vaqt qaysi juftlik(lar)ga to'g'ri keladi: [birinchi, oxirgi] yoki `null`. */
export const pairRange = (pairs: PairTime[], start: string, end: string): [number, number] | null => {
    const first = pairs.find((pair) => pair.start === start);
    const last = pairs.find((pair) => pair.end === end);
    return first && last && first.pair <= last.pair ? [first.pair, last.pair] : null;
};

