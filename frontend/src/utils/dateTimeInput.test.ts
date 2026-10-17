import { describe, expect, it } from 'vitest';
import { formatLongDate, normalizeTime, pairRange } from './dateTimeInput';

describe('normalizeTime', () => {
    it.each([
        ['930', '09:30'],
        ['0930', '09:30'],
        ['14', '14:00'],
        ['9', '09:00'],
        ['1430', '14:30'],
        ['9:5', '09:05'],
        ['14:30', '14:30'],
        [' 8:00 ', '08:00'],
    ])('%s → %s', (raw, expected) => {
        expect(normalizeTime(raw)).toBe(expected);
    });

    it.each(['', '25', '2460', '12:75', 'abc', '12345'])('noto\'g\'ri: %s', (raw) => {
        expect(normalizeTime(raw)).toBeNull();
    });
});

describe('pairRange', () => {
    const pairs = [
        { pair: 1, start: '08:00', end: '09:20' },
        { pair: 2, start: '09:30', end: '10:50' },
        { pair: 3, start: '11:00', end: '12:20' },
    ];

    it('bitta juftlik', () => expect(pairRange(pairs, '09:30', '10:50')).toEqual([2, 2]));
    it("qo'sh juftlik", () => expect(pairRange(pairs, '09:30', '12:20')).toEqual([2, 3]));
    it('setkadan tashqari vaqt', () => expect(pairRange(pairs, '09:45', '10:50')).toBeNull());
    it('teskari tartib', () => expect(pairRange(pairs, '11:00', '09:20')).toBeNull());
});

describe('formatLongDate', () => {
    it('kun surilmaydi', () => expect(formatLongDate('2026-10-17')).toBe('Shanba, 17-oktabr 2026'));
});
