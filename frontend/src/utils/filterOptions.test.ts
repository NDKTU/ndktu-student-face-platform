import { describe, expect, it } from 'vitest';
import { withSelected } from './filterOptions';

describe('withSelected', () => {
    const list = [{ value: '1', label: 'A' }];

    it('qidiruvga tushmagan tanlov ro\'yxat boshiga qo\'shiladi', () => {
        expect(withSelected(list, { value: '9', label: 'Z' })).toEqual([{ value: '9', label: 'Z' }, ...list]);
    });

    it('ro\'yxatda bor bo\'lsa — takrorlanmaydi', () => {
        expect(withSelected(list, { value: '1', label: 'A' })).toBe(list);
    });

    it('tanlov yo\'q — ro\'yxat o\'zgarmaydi', () => {
        expect(withSelected(list, null)).toBe(list);
    });
});
