import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useKeepSessionAlive } from '@/hooks/useKeepSessionAlive';
import { useZoomFaceCheck } from '@/hooks/useZoomFaceCheck';
import { isMobileDevice } from '@/utils/device';
import { logger } from '@/utils/logger';
import { takeZoomRoomTicket } from '@/utils/zoomRoom';

/**
 * Zoom xonasi — Meeting SDK'ning Client View rejimi: to'liq Zoom veb-mijozi
 * (pastda Audio · Video · Participants · Chat · Share · Leave), butun ekran.
 *
 * Nega Component View emas. U sahifa ichidagi kichik blok: video eng ko'pi
 * 1440×810, bizda esa ~250px plitka bo'lib qolardi va ovoz «Join Audio»
 * bosilmaguncha ulanmasdi. Client View — Zoom ilovasiga yaqin ko'rinish,
 * kirishda o'zi «Join Audio by Computer» oynasini ko'rsatadi va Zoom uni
 * telefonlar uchun ham tavsiya qiladi.
 *
 * Nega alohida HTML sahifa (`zoom-room.html`, SPA emas). Client View butun
 * hujjatni egallaydi, o'z stillarini global qo'shadi va chiqishda `leaveUrl`
 * ga to'liq yuklash bilan o'tadi. Teskarisi ham: saytning Tailwind preflight'i
 * (tugma, svg, img qayta o'rnatilishi) Zoom interfeysini buzardi. Shuning
 * uchun bu yerda `index.css` ham, SPA provayderlari ham yo'q — stillar inline.
 *
 * Kirish ruxsati (imzo) seans sahifasida, yuz tekshiruvidan keyin olinadi
 * va `sessionStorage` orqali bir martalik chipta bo'lib keladi
 * (`utils/zoomRoom.ts`). Chipta yo'q — seans sahifasiga qaytariladi.
 */
const ZOOM_SDK_VERSION = '6.2.0';
const ZOOM_CDN = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;
// Rasmiy Client View namunasidagi tartib: avval vendor (global React 18,
// Redux, lodash), keyin SDK. Loyihaning React 19 i modul ichida qoladi.
const ZOOM_SCRIPTS = [
    `${ZOOM_CDN}/lib/vendor/react.min.js`,
    `${ZOOM_CDN}/lib/vendor/react-dom.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`,
    `${ZOOM_CDN}/lib/vendor/lodash.min.js`,
    `${ZOOM_CDN}/zoom-meeting-${ZOOM_SDK_VERSION}.min.js`,
];

/** Zoom SDK: «cross account join error» — SDK ilovasi va uchrashuv egasi turli akkauntda. */
const CROSS_ACCOUNT_JOIN = 4011;

interface ZoomMtgCallbacks {
    success?: (result: unknown) => void;
    error?: (cause: unknown) => void;
}

type ZoomMtgApi = {
    preLoadWasm: () => void;
    prepareWebSDK: () => void;
    init: (options: Record<string, unknown> & ZoomMtgCallbacks) => void;
    join: (options: Record<string, unknown> & ZoomMtgCallbacks) => void;
};

declare global {
    interface Window {
        ZoomMtg?: ZoomMtgApi;
    }
}

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.addEventListener('load', () => resolve());
        script.addEventListener('error', () => reject(new Error(`Yuklanmadi: ${src}`)));
        document.head.appendChild(script);
    });
}

/** SDK xatosi — Zoom inglizcha sabab beradi, uni yo'qotmaymiz. */
function joinErrorMessage(cause: unknown): string {
    const sdk = cause as { errorCode?: number; errorMessage?: string; reason?: string } | null;
    if (sdk?.errorCode === CROSS_ACCOUNT_JOIN) {
        return "Zoom sozlamasida xato: SDK ilovasi uchrashuv egasi bilan bir akkauntda emas. Administratorga murojaat qiling.";
    }
    const reason = (sdk?.errorMessage || sdk?.reason || '').replace(/\.+$/, '');
    return reason ? `Uchrashuvga qo'shilib bo'lmadi: ${reason}.` : "Uchrashuvga qo'shilib bo'lmadi. Qayta urinib ko'ring.";
}

const screen: CSSProperties = {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: '0 16px',
    textAlign: 'center',
    background: '#020617',
    color: '#e2e8f0',
    font: '14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif',
};

const backLink: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#e2e8f0',
    textDecoration: 'none',
};

export default function ZoomRoom() {
    const sessionId = Number(new URLSearchParams(window.location.search).get('session'));
    const [error, setError] = useState('');
    const startedRef = useRef(false);
    const faceCheck = useZoomFaceCheck(sessionId);
    const lessonUrl = `${window.location.origin}/zoom/${sessionId}`;
    // Ma'ruzani tinglayotgan talaba sichqonchaga tegmaydi — avtochiqish uni
    // darsdan chiqarib yubormasin.
    useKeepSessionAlive(!error);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        const ticket = Number.isFinite(sessionId) && sessionId > 0 ? takeZoomRoomTicket(sessionId) : null;
        if (!ticket) {
            // Yangilangan sahifa yoki eski havola: kirish ruxsati yana yuz
            // tekshiruvi orqali olinadi.
            window.location.replace(lessonUrl);
            return;
        }
        const { payload } = ticket;

        const fail = (cause: unknown) => {
            logger.error('Zoom room join failed', cause);
            // Zoom qatlami butun ekranni qoplaydi — xato ko'rinsin.
            document.getElementById('zmmtg-root')?.style.setProperty('display', 'none');
            setError(joinErrorMessage(cause));
        };

        (async () => {
            try {
                for (const src of ZOOM_SCRIPTS) await loadScript(src);
                const zoom = window.ZoomMtg;
                if (!zoom) throw new Error('Zoom SDK topilmadi');
                zoom.preLoadWasm();
                zoom.prepareWebSDK();
                const root = document.getElementById('zmmtg-root');
                if (root) root.style.display = 'block';
                zoom.init({
                    // Chiqish (Leave/End) — seans sahifasiga, to'liq yuklash bilan.
                    leaveUrl: lessonUrl,
                    patchJsMedia: true,
                    // Yopilgan tab — uchrashuvdan ham chiqish, «arvoh» ishtirokchi qolmasin.
                    leaveOnPageUnload: true,
                    // Oldindan ko'rish ekranisiz: yuz tekshiruvidan keyin darhol darsga.
                    disablePreview: true,
                    // O'qituvchi ekranda katta — Zoom ilovasidagi kabi.
                    defaultView: 'speaker',
                    enableMobileUI: isMobileDevice(),
                    // Xatoni o'zimiz ko'rsatamiz (o'zbekcha, «Dars sahifasiga qaytish»
                    // bilan). Zoom'ning oynasi bizning ekranni yopib qo'yardi.
                    isShowJoiningErrorDialog: false,
                    success: () => {
                        zoom.join({
                            // `sdkKey` Client View'da 4.0 dan beri kerak emas — u imzoning ichida.
                            signature: payload.signature,
                            meetingNumber: payload.meeting_number,
                            passWord: payload.passcode ?? '',
                            userName: payload.user_name || 'Talaba',
                            // O'qituvchi host (`role: 1` + ZAK); talaba registrant tokeni bilan.
                            ...(payload.zak ? { zak: payload.zak } : {}),
                            ...(payload.registrant_token ? { tk: payload.registrant_token } : {}),
                            // Webhook hodisasida ishtirokchini LMS foydalanuvchisiga bog'laydi.
                            customerKey: payload.customer_key,
                            success: () => {
                                if (ticket.faceCheck) faceCheck.startRandomChecks();
                            },
                            error: fail,
                        });
                    },
                    error: fail,
                });
            } catch (cause) {
                fail(cause);
            }
        })();
    }, [sessionId, lessonUrl, faceCheck]);

    // Zoom ildizi (`#zmmtg-root`) butun ekranni qoplaydi; bu yerdagisi —
    // u chizilguncha yuklanish va xato ekrani.
    return (
        <div style={screen}>
            {error ? (
                <>
                    <p role="alert" style={{ maxWidth: 448, margin: 0 }}>{error}</p>
                    <a href={lessonUrl} style={backLink}>
                        <ArrowLeft size={16} /> Dars sahifasiga qaytish
                    </a>
                </>
            ) : (
                <>
                    <Loader2 size={24} style={{ animation: 'zoom-room-spin 1s linear infinite' }} />
                    <style>{'@keyframes zoom-room-spin { to { transform: rotate(360deg); } }'}</style>
                    <p style={{ margin: 0, color: '#cbd5e1' }}>Zoom yuklanmoqda...</p>
                </>
            )}
        </div>
    );
}
