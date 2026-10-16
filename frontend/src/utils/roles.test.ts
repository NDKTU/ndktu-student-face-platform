import { describe, expect, it } from 'vitest';
import { roleKey } from './roles';

describe('roleKey', () => {
    it('tizim roli — `code`, nomi o\'zgartirilgan bo\'lsa ham', () => {
        expect(roleKey({ name: "O'qituvchi", code: 'teacher' })).toBe('teacher');
        expect(roleKey({ name: 'Bosh administrator', code: 'admin' })).toBe('admin');
    });

    it('interfeysda yaratilgan rol — kichik harfli nom', () => {
        expect(roleKey({ name: ' Psixologik ', code: null })).toBe('psixologik');
        expect(roleKey({ name: 'Tutor' })).toBe('tutor');
    });
});
