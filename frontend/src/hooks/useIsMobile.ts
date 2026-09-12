import { useEffect, useState } from 'react';

/** `md` (768px) — loyihadagi asosiy chegara: sidebar drawer'i, jadval/kartochka
 *  almashinuvi va `hidden md:table-cell` qoidalari ham shu yerda buriladi. */
const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Ekran telefon kengligidami. CSS bilan hal bo'lmaydigan joylar uchun:
 * diagramma o'qining kengligi, sahifalashda ko'rsatiladigan raqamlar soni
 * kabi — ular JSX'da son sifatida uzatiladi, class bilan boshqarib bo'lmaydi.
 *
 * Ko'rinishni class bilan hal qilish mumkin bo'lsa (`hidden md:block`),
 * shu ma'qul: u render'siz ishlaydi.
 */
export const useIsMobile = (): boolean => {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
    );

    useEffect(() => {
        const mq = window.matchMedia(MOBILE_QUERY);
        const apply = () => setIsMobile(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    return isMobile;
};
