import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * `useState` kabi, lekin qiymat URL'ning so'rov qismida yashaydi.
 *
 * Nega kerak. Filtrlar faqat komponent holatida turganda uch narsa yo'qoladi:
 * sahifani yangilash filtrni tozalaydi, brauzerning «Orqaga» tugmasi undan
 * oldingi holatga qaytarmaydi, va tanlangan kesimni hamkasbga havola qilib
 * yuborib bo'lmaydi. Ro'yxatlar 10 mingdan ortiq qatorli bo'lgani uchun bu
 * uchalasi ham kunlik ishda seziladi.
 *
 * Boshlang'ich qiymat URL'ga yozilmaydi — manzil ortiqcha `?role=all` bilan
 * to'lib ketmasligi uchun.
 */
/**
 * Bitta hodisada yozilgan oxirgi parametrlar.
 *
 * `setSearchParams` React holat yangilagichi emas — u darhol `navigate()`
 * chaqiradi, lekin o'ziga berilgan `prev` hodisa boshidagi eski qiymat
 * bo'lib qoladi. Shuning uchun bir hodisada ikki filtr yangilansa
 * («rolni tanla» + «sahifani 1 ga qaytar»), ikkinchisi birinchisini
 * o'chirib yuborardi.
 *
 * Kesh mikrotaskda tozalanadi: bitta hodisadagi barcha chaqiruvlar undan
 * oldin bajariladi, keyingi hodisa esa yangi `prev` dan boshlanadi.
 * Modul darajasida, chunki URL bitta.
 */
let pending: URLSearchParams | null = null;

export const useUrlState = <T extends string>(
    key: string,
    initial: T,
): [T, (value: T | ((prev: T) => T)) => void] => {
    const [searchParams, setSearchParams] = useSearchParams();
    const value = (searchParams.get(key) as T | null) ?? initial;

    const setValue = useCallback(
        // `useState` kabi yangilovchi funksiyani ham qabul qiladi, aks holda
        // `setX(prev => ...)` shaklidagi mavjud chaqiruvlarni qayta yozishga
        // to'g'ri kelardi.
        (update: T | ((prev: T) => T)) => {
            setSearchParams(
                (prev) => {
                    const params = new URLSearchParams(pending ?? prev);
                    const current = (params.get(key) as T | null) ?? initial;
                    const next = typeof update === 'function' ? (update as (p: T) => T)(current) : update;
                    if (next === initial) params.delete(key);
                    else params.set(key, next);
                    pending = params;
                    queueMicrotask(() => { pending = null; });
                    return params;
                },
                // Filtrni almashtirish tarixga yangi yozuv qo'shmaydi: aks
                // holda «Orqaga» har bir bosishni birma-bir qaytarib,
                // ro'yxatdan chiqish uchun o'nlab marta bosishga majbur
                // qilardi. Almashtirish esa sahifani ulashish imkonini
                // saqlaydi.
                { replace: true },
            );
        },
        [key, initial, setSearchParams],
    );

    return [value, setValue];
};

/** Raqamli qiymatlar uchun (sahifa raqami va h.k.). */
export const useUrlNumberState = (
    key: string,
    initial: number,
): [number, (value: number) => void] => {
    const [raw, setRaw] = useUrlState(key, String(initial));
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : initial;
    const setValue = useCallback((next: number) => setRaw(String(next)), [setRaw]);
    return [value, setValue];
};

/**
 * Ixtiyoriy raqamli filtr (`undefined` — «tanlanmagan»).
 *
 * Alohida kerak, chunki `useUrlState` satr bilan ishlaydi, filtrlar esa
 * bekendga son yoki `undefined` bo'lib ketadi: `'all'` degan sun'iy qiymatni
 * har bir chaqiruv joyida o'girib o'tirmaslik uchun.
 */
export const useUrlOptionalNumberState = (
    key: string,
): [number | undefined, (value: number | undefined) => void] => {
    const [raw, setRaw] = useUrlState<string>(key, '');
    const parsed = Number(raw);
    const value = raw && Number.isFinite(parsed) ? parsed : undefined;
    const setValue = useCallback(
        (next: number | undefined) => setRaw(next === undefined ? '' : String(next)),
        [setRaw],
    );
    return [value, setValue];
};

/** Ixtiyoriy mantiqiy filtr: `undefined` — «hammasi». */
export const useUrlOptionalBoolState = (
    key: string,
): [boolean | undefined, (value: boolean | undefined) => void] => {
    const [raw, setRaw] = useUrlState<string>(key, '');
    const value = raw === '' ? undefined : raw === 'true';
    const setValue = useCallback(
        (next: boolean | undefined) => setRaw(next === undefined ? '' : String(next)),
        [setRaw],
    );
    return [value, setValue];
};
