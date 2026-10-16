import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDateTimeSeconds, formatDayMonth, formatTime } from './date';

// Vaqt mintaqasidan qat'i nazar bir xil bo'lishi uchun mahalliy `Date`.
const local = new Date(2026, 7, 27, 9, 5, 7); // 27.08.2026 09:05:07

describe('formatDate', () => {
    it('«dd.mm.yyyy» — brauzer tiliga bog\'liq emas', () => {
        expect(formatDate(local)).toBe('27.08.2026');
    });

    it('faqat-sana satri joyida almashtiriladi — kun surilmaydi', () => {
        // `new Date('2026-09-12')` UTC yarim tuni; manfiy mintaqada 11-sana
        // bo'lib qolardi. Satr qismlari to'g'ridan-to'g'ri olinadi.
        expect(formatDate('2026-09-12')).toBe('12.09.2026');
    });

    it('bo\'sh yoki noto\'g\'ri qiymat — «—»', () => {
        expect(formatDate(null)).toBe('—');
        expect(formatDate(undefined)).toBe('—');
        expect(formatDate('emas-sana')).toBe('—');
    });
});

describe('formatDateTime', () => {
    it('soniyalarsiz «dd.mm.yyyy, hh:mm»', () => {
        expect(formatDateTime(local)).toBe('27.08.2026, 09:05');
    });

    it('faqat-sana satriga soat qo\'shilmaydi', () => {
        expect(formatDateTime('2026-09-12')).toBe('12.09.2026');
    });
});

describe('qisqa shakllar', () => {
    it('kun.oy, soat:daqiqa, soniyalar bilan', () => {
        expect(formatDayMonth(local)).toBe('27.08');
        expect(formatDayMonth('2026-09-12')).toBe('12.09');
        expect(formatTime(local)).toBe('09:05');
        expect(formatDateTimeSeconds(local)).toBe('27.08.2026, 09:05:07');
    });
});
