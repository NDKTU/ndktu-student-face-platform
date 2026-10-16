import { describe, expect, it } from 'vitest';
import { apiErrorCode, apiErrorMessage } from './apiError';
import { ERROR_CODE_MESSAGES } from './errorCodes';

const axiosError = (detail: unknown) => ({ response: { data: { detail } } });

describe('apiErrorMessage', () => {
    it('`{code, message}` (core/errors.py): kod tarjimasi ustun', () => {
        const code = Object.keys(ERROR_CODE_MESSAGES)[0];
        expect(apiErrorMessage(axiosError({ code, message: 'server matni' }), 'zaxira')).toBe(ERROR_CODE_MESSAGES[code]);
    });

    it('notanish kod — serverning `message` i', () => {
        expect(apiErrorMessage(axiosError({ code: 'yangi_xato', message: 'Server aytdi' }), 'zaxira')).toBe('Server aytdi');
    });

    it('eski shakl — `detail` satr', () => {
        expect(apiErrorMessage(axiosError('Oddiy matn'), 'zaxira')).toBe('Oddiy matn');
    });

    it('Pydantic ro\'yxati — birinchi xabar, «Value error,» prefiksisiz', () => {
        const detail = [{ msg: 'Value error, Noto\'g\'ri sana' }, { msg: 'ikkinchisi' }];
        expect(apiErrorMessage(axiosError(detail), 'zaxira')).toBe("Noto'g'ri sana");
    });

    it('hech narsa yo\'q — zaxira matn; hech qachon «[object Object]» emas', () => {
        expect(apiErrorMessage(new Error('tarmoq'), 'zaxira')).toBe('zaxira');
        expect(apiErrorMessage(axiosError({ boshqa: 1 }), 'zaxira')).toBe('zaxira');
    });
});

describe('apiErrorCode', () => {
    it('faqat kodli obyektdan', () => {
        expect(apiErrorCode(axiosError({ code: 'invalid_pin', message: 'x' }))).toBe('invalid_pin');
        expect(apiErrorCode(axiosError('matn'))).toBeUndefined();
        expect(apiErrorCode(undefined)).toBeUndefined();
    });
});
