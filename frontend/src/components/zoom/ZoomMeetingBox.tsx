import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, ScanFace, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { zoomSessionService } from '@/services/zoomSessionService';
import { useZoomFaceCheck } from '@/hooks/useZoomFaceCheck';
import { apiErrorMessage } from '@/utils/apiError';
import type { FaceCheckResult } from '@/services/zoomSessionService';
import { isMobileDevice } from '@/utils/device';
import { logger } from '@/utils/logger';
import { saveZoomRoomTicket } from '@/utils/zoomRoom';

/**
 * Seans sahifasidagi «darsga kirish» bloki: tugma → yuz tekshiruvi → server
 * imzosi → Zoom xonasi (`zoom-room.html`, Client View, butun ekran).
 *
 * Uchrashuvning o'zi bu yerda ochilmaydi. Ilgari bu yerda Component View
 * turardi — sahifa ichidagi kichik Zoom bloki: video ~250px plitka bo'lib
 * qolar, ovoz «Join Audio» bosilmaguncha ulanmas edi.
 */
const ZOOM_SDK_VERSION = '6.2.0';
const ZOOM_CDN = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;

/**
 * Xona ochilishi bilan kerak bo'ladigan og'ir fayllar. Sahifa ochilishi
 * bilan brauzer keshiga oldindan olinadi — talaba tugmaga qarab turgan va
 * yuz tekshiruvidan o'tayotgan paytda. Xona to'liq yuklash bilan ochiladi,
 * shuning uchun `<link rel="prefetch">` — keyingi navigatsiya uchun aynan shu.
 */
const ZOOM_PREFETCH = [
    `${ZOOM_CDN}/lib/vendor/react.min.js`,
    `${ZOOM_CDN}/lib/vendor/react-dom.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`,
    `${ZOOM_CDN}/lib/vendor/lodash.min.js`,
    `${ZOOM_CDN}/zoom-meeting-${ZOOM_SDK_VERSION}.min.js`,
    `${ZOOM_CDN}/lib/av/js_media.min.js`,
];

let prefetched = false;

function prefetchZoom() {
    if (prefetched) return;
    prefetched = true;
    for (const href of ZOOM_PREFETCH) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
    }
}

interface Props {
    sessionId: number;
    /** Darsni olib boruvchi: uchrashuvni host sifatida boshlaydi. */
    host?: boolean;
    /** Kirishdan oldin yuz tekshiruvi (server talab qiladi) va dars davomida tasodifiy. */
    faceCheckEnabled?: boolean;
    /**
     * Zaxira yo'l — Zoom ilovasi (faqat telefonda, LMS yaratgan uchrashuvda).
     * Ilovada tasodifiy yuz tekshiruvi yo'q: sahifa fonda «uxlaydi».
     */
    appFallback?: boolean;
}

// Shaxs tasdiqlanmaguncha imzo berilmaydi — buni server hal qiladi
// (`zoom_session/repository.py::join`). Urinishlar cheklanmaydi: yomon yorug'lik
// talabaning aybi emas. Ilgari uch urinishdan keyin talaba baribir kirardi.
export const ZoomMeetingBox = ({ sessionId, host = false, faceCheckEnabled = false, appFallback = false }: Props) => {
    const [state, setState] = useState<'idle' | 'verifying' | 'joining'>('idle');
    const [error, setError] = useState('');
    const [faceResult, setFaceResult] = useState<FaceCheckResult | null>(null);
    const [attempts, setAttempts] = useState(0);
    const faceCheck = useZoomFaceCheck(sessionId);
    const mobile = useMemo(isMobileDevice, []);
    const showAppFallback = appFallback && mobile && !host;

    useEffect(() => {
        prefetchZoom();
    }, []);

    /** Kirishdan oldingi tekshiruv. `true` — server tasdiqladi, imzo olish mumkin. */
    const verifyBeforeJoin = async (): Promise<boolean> => {
        setState('verifying');
        setError('');
        setAttempts((n) => n + 1);
        try {
            const result = await faceCheck.runCheck('join');
            setFaceResult(result);
            return Boolean(result?.admitted);
        } catch (cause) {
            // Guruh, vaqt, HEMIS surati yoki xizmat — sababni aytamiz.
            setFaceResult(null);
            setError(apiErrorMessage(cause, "Shaxsni tekshirib bo'lmadi. Qayta urinib ko'ring."));
            return false;
        } finally {
            // Kamera bu yerda kerak emas — xonada tekshiruv o'zi qayta ochadi.
            faceCheck.stop();
        }
    };

    /** `app` — Zoom ilovasiga (zaxira yo'l), aks holda — brauzerdagi xonaga. */
    const join = async (app = false) => {
        if (faceCheckEnabled && !(await verifyBeforeJoin())) {
            setState('idle');
            return;
        }
        setState('joining');
        setError('');
        try {
            const payload = await zoomSessionService.join(sessionId, { app });
            if (app && payload.app_join_url) {
                setState('idle');
                window.location.href = payload.app_join_url;
                return;
            }
            saveZoomRoomTicket(sessionId, {
                payload,
                faceCheck: faceCheckEnabled && !faceCheck.notApplicable,
            });
            // Alohida HTML sahifa, to'liq yuklash: Client View va saytning
            // stillari bir-biriga aralashmasin (`zoom-room.html`).
            window.location.assign(`/zoom-room.html?session=${sessionId}`);
        } catch (cause) {
            logger.error('Zoom join failed', cause);
            setError(apiErrorMessage(cause, "Uchrashuvga qo'shilib bo'lmadi."));
            setState('idle');
        }
    };

    const busy = state !== 'idle';

    return (
        <div className="min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            <div className="flex flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-primary/10 via-card to-cyan-500/10 px-4 py-10 text-center sm:px-8 sm:py-14">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                    {state === 'verifying' ? <ScanFace className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </span>
                <div className="space-y-1">
                    <p className="text-lg font-semibold tracking-tight">
                        {state === 'verifying'
                            ? 'Shaxsingiz tekshirilmoqda'
                            : state === 'joining'
                                ? 'Zoom ochilmoqda...'
                                : "Dars jonli efirda o'tadi"}
                    </p>
                    <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                        {state === 'verifying'
                            ? 'Kameraga qarab turing — bu bir necha soniya oladi.'
                            : host
                                ? "Zoom butun ekranda host sifatida ochiladi: «Join Audio» ni bosing — mikrofon yoqiq bo'ladi, talabalar ovozini boshqara olasiz."
                                : faceCheckEnabled
                                    ? "Zoom butun ekranda ochiladi. Qo'shilishdan oldin shaxsingiz tekshiriladi, dars davomida ham tasodifiy tekshiriladi."
                                    : "Zoom butun ekranda ochiladi — ilova shart emas. Kirgach «Join Audio» ni bosing."}
                    </p>
                </div>
                {/* Tekshiruv bu foydalanuvchiga tegishli emasligi ochiq aytiladi —
                    aks holda «tekshirildi» degan taassurot qolardi. */}
                {faceCheckEnabled && faceCheck.notApplicable && (
                    <p className="text-xs text-muted-foreground">
                        Yuz nazorati faqat guruh talabalari uchun — sizga qo'llanmadi.
                    </p>
                )}
                {/* Tekshiruv natijasi: nima bo'lgani va nechanchi urinish. */}
                {faceResult && faceResult.status !== 'ok' && state === 'idle' && (
                    <p className="text-xs text-amber-600">
                        {faceResult.message}. Qayta urinib ko'ring — tasdiqlanmaguncha darsga kirib bo'lmaydi.
                    </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={() => void join()} disabled={busy}>
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                        {state === 'verifying'
                            ? 'Tekshirilmoqda...'
                            : state === 'joining'
                                ? 'Ochilmoqda...'
                                : attempts > 0 ? 'Qayta urinish' : host ? 'Darsni boshlash' : "Darsga qo'shilish"}
                    </Button>
                    {showAppFallback && (
                        <Button variant="outline" onClick={() => void join(true)} disabled={busy}>
                            <ExternalLink className="mr-2 h-4 w-4" /> Zoom ilovasida ochish
                        </Button>
                    )}
                </div>
                {showAppFallback && (
                    <p className="max-w-md text-xs text-muted-foreground">
                        Brauzerda Zoom sekin ishlasa — ilovada oching. Ilovada dars davomidagi yuz tekshiruvi ishlamaydi.
                    </p>
                )}
            </div>
            {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}
        </div>
    );
};
