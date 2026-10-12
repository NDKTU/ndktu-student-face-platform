import { useEffect } from 'react';
import api from '@/services/api';

/**
 * «Band» rejim: test yoki jonli dars ketayotganda sessiya bo'sh turish
 * sababli yopilmasin.
 *
 * Nega kerak. `useIdleTimeout` 15 daqiqa sichqoncha/klaviaturaga tegilmasa
 * chiqarib yuboradi — umumiy kompyuterlardagi himoya. Lekin test paytida
 * talaba savolni o'qiydi yoki qog'ozda ishlaydi, Zoom'da esa ma'ruzani
 * tinglaydi: harakat yo'q, lekin u ishlayapti. Ilgari shunday talaba
 * testdan (va Zoom uchrashuvidan) chiqib ketardi.
 *
 * Hisoblagich: bir vaqtda bir nechta komponent «band» deyishi mumkin, hammasi
 * bo'shatmaguncha avtochiqish to'xtaydi. Ko'chirishga qarshi himoya bunga
 * aloqador emas — u alohida (`useStrictQuizGuard`).
 */
let holds = 0;

export const isSessionHeld = () => holds > 0;

/** Server sessiyasi (`session_idle_minutes`, 30 daq) ham eskirmasin — undan tez-tez. */
const PING_INTERVAL_MS = 5 * 60 * 1000;

export function useKeepSessionAlive(active: boolean) {
    useEffect(() => {
        if (!active) return;
        holds += 1;
        // Har bir autentifikatsiyali so'rov server sessiyasini uzaytiradi.
        // Heartbeat bo'lmagan joylar uchun (qat'iy bo'lmagan test, yuz
        // nazoratisiz Zoom) — o'zimiz so'raymiz. Xato bo'lsa — interceptor
        // o'zi hal qiladi (401 — login sahifasi).
        const ping = window.setInterval(() => {
            api.get('/user/me').catch(() => undefined);
        }, PING_INTERVAL_MS);
        return () => {
            holds = Math.max(0, holds - 1);
            window.clearInterval(ping);
        };
    }, [active]);
}
