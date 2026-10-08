import { useEffect, useRef } from 'react';
import type { LeaveReason } from '@/services/quizProcessService';

/** Fokus shuncha vaqt qaytmasa — boshqa oyna. Bildirishnoma shtorkasi yoki
 *  fokusning bir lahza miltillashi testni yopmasin; Telegram'ni ochib, savolni
 *  yuborishga esa bu vaqt yetmaydi. */
const BLUR_GRACE_MS = 1000;

/** Oyna kengligi shunchaga qisqarsa — ekran bo'lingan. */
const SPLIT_WIDTH_RATIO = 0.8;

/** Layout viewport kengligi: barmoq bilan kattalashtirish uni o'zgartirmaydi,
 *  `innerWidth` esa ba'zi mobil brauzerlarda o'zgartiradi. */
const layoutWidth = () => document.documentElement.clientWidth || window.innerWidth;

/** Server `strict.LEAVE_REASONS` bilan bir xil — javob kelguncha ko'rsatiladi. */
export const LEAVE_TEXT: Record<LeaveReason, string> = {
    hidden: 'Sahifadan chiqdi',
    pagehide: 'Sahifani yopdi',
    blur: "Boshqa oynaga o'tdi",
    split: "Ekranni bo'ldi",
};

/** Qat'iy testda server urinishni yopgan bo'lsa — sababi, aks holda `null`. */
export const closedReason = (error: unknown): string | null => {
    const detail = (error as { response?: { data?: { detail?: { code?: string; reason?: string } } } })
        ?.response?.data?.detail;
    if (detail?.code !== 'attempt_closed_left_page') return null;
    return detail.reason || LEAVE_TEXT.hidden;
};

interface Options {
    active: boolean;
    onLeave: (reason: LeaveReason) => void;
}

/**
 * Qat'iy test: talaba sahifadan chiqqanini sezadi va `onLeave` ni bir marta chaqiradi.
 *
 * - `visibilitychange` (sahifa yashirildi: boshqa ilova, «Uy», ekran qulfi,
 *   boshqa tab, brauzerni yig'ish) va `pagehide` — darhol;
 * - `blur` (ekran yarmida boshqa ilovaga tegish, suzuvchi oyna, Gemini va
 *   Circle to Search oynasi) — `BLUR_GRACE_MS` dan keyin, fokus qaytmasa;
 * - oyna **kengligi** qisqarishi — ekran bo'lingan. Balandlik ataylab
 *   tekshirilmaydi: matnli javob uchun klaviatura ochilganda balandlik
 *   xuddi shunday kichrayadi va talaba bejiz jazolanardi.
 *
 * Skrinshotni brauzer sezmaydi — bu veb uchun imkonsiz.
 */
export function useStrictQuizGuard({ active, onLeave }: Options) {
    const onLeaveRef = useRef(onLeave);
    useEffect(() => {
        onLeaveRef.current = onLeave;
    }, [onLeave]);

    useEffect(() => {
        if (!active) return;

        let fired = false;
        let blurTimer: ReturnType<typeof setTimeout> | null = null;
        let splitTimer: ReturnType<typeof setTimeout> | null = null;
        let baseWidth = layoutWidth();

        const leave = (reason: LeaveReason) => {
            if (fired) return;
            fired = true;
            onLeaveRef.current(reason);
        };

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') leave('hidden');
        };
        const onPageHide = () => leave('pagehide');

        const onBlur = () => {
            if (blurTimer) clearTimeout(blurTimer);
            blurTimer = setTimeout(() => {
                if (!document.hasFocus()) leave('blur');
            }, BLUR_GRACE_MS);
        };
        const onFocus = () => {
            if (blurTimer) clearTimeout(blurTimer);
            blurTimer = null;
        };

        const onResize = () => {
            if (splitTimer) clearTimeout(splitTimer);
            splitTimer = setTimeout(() => {
                if (layoutWidth() < baseWidth * SPLIT_WIDTH_RATIO) leave('split');
                // Kengayish (masalan, ekran bo'linishidan qaytish) yangi asos bo'lmaydi:
                // asos faqat burilishda yangilanadi.
            }, BLUR_GRACE_MS);
        };
        // Telefonni burish kenglikni o'zgartiradi — bu bo'linish emas.
        const onOrientation = () => {
            if (splitTimer) clearTimeout(splitTimer);
            // Burilishdan keyin o'lcham bir necha kadrda o'rnashadi.
            setTimeout(() => {
                baseWidth = layoutWidth();
            }, 500);
        };

        // Kuzatuv boshlanganda fokus allaqachon yo'q bo'lsa — darhol hisobga olinadi.
        if (document.visibilityState === 'hidden') leave('hidden');
        else if (!document.hasFocus()) onBlur();

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        window.addEventListener('resize', onResize);
        const orientation = typeof screen !== 'undefined' ? screen.orientation : undefined;
        if (orientation) orientation.addEventListener('change', onOrientation);
        else window.addEventListener('orientationchange', onOrientation);

        return () => {
            if (blurTimer) clearTimeout(blurTimer);
            if (splitTimer) clearTimeout(splitTimer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onPageHide);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('resize', onResize);
            if (orientation) orientation.removeEventListener('change', onOrientation);
            else window.removeEventListener('orientationchange', onOrientation);
        };
    }, [active]);
}
