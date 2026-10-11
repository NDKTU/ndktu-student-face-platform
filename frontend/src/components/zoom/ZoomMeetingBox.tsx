import { useEffect, useRef, useState } from 'react';
import { Hourglass, Loader2, LogOut, Maximize2, Minimize2, Radio, ScanFace, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { zoomSessionService } from '@/services/zoomSessionService';
import { useZoomFaceCheck } from '@/hooks/useZoomFaceCheck';
import { apiErrorMessage } from '@/utils/apiError';
import type { FaceCheckResult, ZoomJoinResponse } from '@/services/zoomSessionService';
import { logger } from '@/utils/logger';
import './ZoomMeetingBox.css';

/**
 * Zoom Meeting SDK (Component View) — uchrashuv saytdan chiqmasdan ochiladi.
 *
 * SDK npm paketi sifatida emas, Zoom CDN'idan yuklanadi: `@zoom/meetingsdk`
 * peer sifatida React 18 ni talab qiladi, loyihada esa React 19.
 * CDN vendor fayllari SDK uchun alohida global React yuklaydi.
 */
const ZOOM_SDK_VERSION = '6.2.0';
const ZOOM_CDN = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;
// SDK bundli React'ni global o'zgaruvchi sifatida kutadi va o'zi olib
// yurmaydi — shuning uchun avval Zoom'ning vendor fayllari yuklanadi.
// Ular `window.React` (18) ni yozadi; loyihaning React 19 esa modul ichida
// qoladi, ular to'qnashmaydi.
// Zoom'ning rasmiy namunasi aynan shu uchtasini yuklaydi. Ilgari bu yerda
// redux, redux-thunk va lodash ham bor edi — SDK ularsiz ham ishlaydi.
const ZOOM_SCRIPTS = [
    `${ZOOM_CDN}/lib/vendor/react.min.js`,
    `${ZOOM_CDN}/lib/vendor/react-dom.min.js`,
    `${ZOOM_CDN}/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`,
];

type ZoomClient = {
    init: (options: Record<string, unknown>) => Promise<void>;
    join: (options: Record<string, unknown>) => Promise<void>;
    leaveMeeting: () => Promise<void>;
    on?: (event: string, callback: (payload: unknown) => void) => void;
};

declare global {
    interface Window {
        ZoomMtgEmbedded?: { createClient: () => ZoomClient };
    }
}

let sdkPromise: Promise<void> | null = null;

/** Zoom SDK: «Meeting has not started» — host hali boshlamagan. */
const MEETING_NOT_STARTED = 3008;
/** O'qituvchini kutganda shuncha soniyada bir qayta urinamiz. */
const HOST_RETRY_MS = 15_000;

/**
 * Zoom SDK: «cross account join error». Nashr etilmagan Meeting SDK ilovasi
 * faqat o'z akkauntidagi uchrashuvlarga kira oladi — SDK ilovasi va
 * uchrashuv egasi (Zoom API host) turli akkauntlarda. Talabaning aybi emas.
 */
const CROSS_ACCOUNT_JOIN = 4011;

const isMeetingNotStarted = (cause: unknown) => {
    const sdk = cause as { errorCode?: number; reason?: string } | null;
    return sdk?.errorCode === MEETING_NOT_STARTED || /not started/i.test(sdk?.reason ?? '');
};

function loadScript(src: string): Promise<void> {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = existing ?? document.createElement('script');
        script.src = src;
        script.async = false;
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        });
        script.addEventListener('error', () => reject(new Error(`Yuklanmadi: ${src}`)));
        if (!existing) document.head.appendChild(script);
    });
}

/** SDK bir marta yuklanadi va keyingi darslarda qayta ishlatiladi. */
function loadZoomSdk(): Promise<void> {
    if (window.ZoomMtgEmbedded) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    // Ketma-ket: vendor fayllari SDK'dan oldin global bo'lishi shart.
    sdkPromise = ZOOM_SCRIPTS.reduce<Promise<void>>(
        (chain, src) => chain.then(() => loadScript(src)),
        Promise.resolve(),
    ).catch((cause) => {
        sdkPromise = null;
        throw cause;
    });
    return sdkPromise;
}

interface Props {
    sessionId: number;
    /** Kirishdan oldin yuz tekshiruvi (server talab qiladi) va dars davomida tasodifiy. */
    faceCheckEnabled?: boolean;
}

// Shaxs tasdiqlanmaguncha imzo berilmaydi — buni server hal qiladi
// (`zoom_session/repository.py::join`). Urinishlar cheklanmaydi: yomon yorug'lik
// talabaning aybi emas. Ilgari uch urinishdan keyin talaba baribir kirardi.
export const ZoomMeetingBox = ({ sessionId, faceCheckEnabled = false }: Props) => {
    const { user } = useAuth();
    const shellRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<ZoomClient | null>(null);
    const [state, setState] = useState<'idle' | 'verifying' | 'joining' | 'waiting' | 'joined'>('idle');
    const retryRef = useRef<number | null>(null);
    // «Bekor qilish» yo'lda turgan urinishni ham to'xtatsin.
    const cancelledRef = useRef(false);
    const [error, setError] = useState('');
    const [faceResult, setFaceResult] = useState<FaceCheckResult | null>(null);
    const [attempts, setAttempts] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const faceCheck = useZoomFaceCheck(sessionId);

    useEffect(() => {
        const onChange = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullscreen = async () => {
        const element = shellRef.current;
        if (!element) return;
        try {
            if (document.fullscreenElement === element) await document.exitFullscreen();
            else if (element.requestFullscreen) await element.requestFullscreen();
            else setError("Bu brauzer to'liq ekran rejimini qo'llamaydi. Zoom ilovasida ochishingiz mumkin.");
        } catch {
            setError("To'liq ekranni ochib bo'lmadi. Qayta urinib ko'ring.");
        }
    };

    // Sahifadan chiqilganda uchrashuvdan ham chiqamiz, aks holda mikrofon
    // va kamera ochiq qolib ketardi.
    useEffect(() => {
        return () => {
            if (retryRef.current) window.clearTimeout(retryRef.current);
            clientRef.current?.leaveMeeting().catch(() => { /* uchrashuv allaqachon yopilgan */ });
            clientRef.current = null;
        };
    }, []);

    const cancelWaiting = () => {
        cancelledRef.current = true;
        if (retryRef.current) window.clearTimeout(retryRef.current);
        retryRef.current = null;
        setState('idle');
    };

    const leave = async () => {
        await clientRef.current?.leaveMeeting().catch(() => { /* allaqachon yopiq */ });
        clientRef.current = null;
        faceCheck.stop();
        if (document.fullscreenElement === shellRef.current) await document.exitFullscreen().catch(() => undefined);
        setState('idle');
    };

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
        }
    };

    const join = async () => {
        if (faceCheckEnabled) {
            const allowed = await verifyBeforeJoin();
            if (!allowed) {
                setState('idle');
                return;
            }
        }
        setState('joining');
        setError('');
        cancelledRef.current = false;
        let payload: ZoomJoinResponse;
        try {
            payload = await zoomSessionService.join(sessionId);
        } catch (cause) {
            logger.error('Zoom join failed', cause);
            setError(apiErrorMessage(cause, "Uchrashuvga qo'shilib bo'lmadi."));
            setState('idle');
            return;
        }
        await connect(payload);
    };

    /**
     * SDK orqali ulanish. O'qituvchi uchrashuvni hali boshlamagan bo'lsa,
     * shu imzo va token bilan vaqti-vaqti bilan qayta urinamiz: serverdan
     * yangi imzo so'ralmaydi — yuz tasdig'i bor-yo'g'i 3 daqiqa amal qiladi,
     * imzo esa seans oxirigacha.
     */
    const connect = async (payload: ZoomJoinResponse) => {
        retryRef.current = null;
        try {
            await loadZoomSdk();
            if (!window.ZoomMtgEmbedded || !containerRef.current) throw new Error('Zoom SDK topilmadi');

            const client = window.ZoomMtgEmbedded.createClient();
            clientRef.current = client;
            // O'lcham berilmaydi — SDK o'zini o'zi o'lchaydi. Zoom'ning rasmiy
            // namunasida (`meetingsdk-web-sample`) ham `viewSizes`, `customize.video`
            // va `updateVideoOptions` umuman ishlatilmaydi: `zoomAppRoot` va
            // `language` dan boshqasi yo'q. Bizda esa o'sha sonlar bilan kurash
            // videoni kichraytirib, panelni qutidan tashqarida qoldirardi —
            // SDK berilgan balandlikni baribir o'ziga moslab qayta hisoblardi.
            // Shakl endi CSS zimmasida: `.zoom-meeting-root` (aspect-ratio 16/9).
            await client.init({
                zoomAppRoot: containerRef.current,
                language: 'en-US',
                patchJsMedia: true,
                // Audio/video dekodlash kutubxonalari (WASM va worklet'lar)
                // o'z domenimizdan beriladi. Ular berilmasa SDK ularni Zoom
                // CDN'idan qidiradi: interfeys va tugmalar chiziladi, lekin
                // video oqimi dekodlanmay, maydon qora qolardi — bizdagi
                // «qora ekran» aynan shu edi. Zoom namunasi ham shu yo'lni
                // tanlaydi (`assetPath` + o'z `/lib` papkasi).
                assetPath: `${window.location.origin}/lib`,
            });
            // Uchrashuv tugaganda yoki uzilib qolganda tugma qaytib kelsin.
            client.on?.('connection-change', (payload) => {
                const stateName = (payload as { state?: string })?.state;
                if (stateName === 'Closed' || stateName === 'Fail') {
                    clientRef.current = null;
                    faceCheck.stop();
                    if (document.fullscreenElement === shellRef.current) void document.exitFullscreen().catch(() => undefined);
                    setState('idle');
                }
            });
            await client.join({
                signature: payload.signature,
                sdkKey: payload.sdk_key,
                meetingNumber: payload.meeting_number,
                password: payload.passcode ?? '',
                userName: payload.user_name || user?.username || 'Talaba',
                // LMS yaratgan uchrashuv ro'yxatdan o'tishni talab qiladi:
                // talaba faqat server bergan shaxsiy token bilan kira oladi.
                ...(payload.registrant_token ? { tk: payload.registrant_token } : {}),
                // Webhook hodisasida ishtirokchini LMS foydalanuvchisiga bog'laydi.
                customerKey: payload.customer_key,
            });
            if (cancelledRef.current) {
                await client.leaveMeeting().catch(() => undefined);
                clientRef.current = null;
                return;
            }
            setState('joined');
            // Uchrashuv sahifaning o'rtasida ochiladi — o'sha joyga olib
            // boramiz, aks holda talaba uni qidirib skroll qilishi kerak edi.
            requestAnimationFrame(() => {
                containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            if (faceCheckEnabled) faceCheck.startRandomChecks();
        } catch (cause) {
            await clientRef.current?.leaveMeeting().catch(() => undefined);
            clientRef.current = null;
            if (cancelledRef.current) return;
            if (isMeetingNotStarted(cause)) {
                setError('');
                setState('waiting');
                retryRef.current = window.setTimeout(() => void connect(payload), HOST_RETRY_MS);
                return;
            }
            logger.error('Zoom join failed', cause);
            // Zoom SDK inglizcha sabab qaytaradi (masalan «The meeting number
            // is not found») — uni yo'qotmaymiz, muammoni aynan shu ochib beradi.
            const sdkReason = (cause as { reason?: string })?.reason;
            const sdkCode = (cause as { errorCode?: number })?.errorCode;
            setError(
                sdkCode === CROSS_ACCOUNT_JOIN
                    ? "Zoom sozlamasida xato: SDK ilovasi uchrashuv egasi bilan bir akkauntda emas. Administratorga murojaat qiling."
                    : sdkReason
                    ? `Uchrashuvga qo'shilib bo'lmadi: ${sdkReason}.`
                    : "Uchrashuvga qo'shilib bo'lmadi. Qayta urinib ko'ring.",
            );
            setState('idle');
        }
    };

    return (
        <div ref={shellRef} className="zoom-meeting-shell min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            {state === 'waiting' ? (
                <div className="flex flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-card to-primary/10 px-4 py-10 text-center sm:px-8 sm:py-14">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-600 shadow-sm">
                        <Hourglass className="h-5 w-5" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-lg font-semibold tracking-tight">O'qituvchi darsni hali boshlamagan — kuting</p>
                        <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                            Dars boshlanishi bilan avtomatik ulanasiz. Sahifani yopmang.
                        </p>
                    </div>
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Har 15 soniyada tekshirilmoqda
                    </span>
                    <Button variant="outline" size="sm" onClick={cancelWaiting}>
                        Bekor qilish
                    </Button>
                </div>
            ) : state === 'idle' || state === 'verifying' ? (
                <div className="flex flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-primary/10 via-card to-cyan-500/10 px-4 py-10 text-center sm:px-8 sm:py-14">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                        {state === 'verifying' ? <ScanFace className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                    </span>
                    <div className="space-y-1">
                        <p className="text-lg font-semibold tracking-tight">
                            {state === 'verifying' ? 'Shaxsingiz tekshirilmoqda' : "Dars jonli efirda o'tadi"}
                        </p>
                        <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                            {state === 'verifying'
                                ? 'Kameraga qarab turing — bu bir necha soniya oladi.'
                                : faceCheckEnabled
                                    ? "Uchrashuv shu sahifada ochiladi. Qo'shilishdan oldin shaxsingiz tekshiriladi."
                                    : 'Uchrashuv shu sahifada ochiladi — Zoom ilovasi shart emas.'}
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
                    {faceResult && faceResult.status !== 'ok' && state !== 'verifying' && (
                        <p className="text-xs text-amber-600">
                            {faceResult.message}. Qayta urinib ko'ring — tasdiqlanmaguncha darsga kirib bo'lmaydi.
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Button onClick={() => void join()} disabled={state === 'verifying'}>
                            {state === 'verifying'
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <Video className="mr-2 h-4 w-4" />}
                            {state === 'verifying'
                                ? 'Tekshirilmoqda...'
                                : attempts > 0 ? "Qayta urinish" : "Darsga qo'shilish"}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="zoom-meeting-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                            {state === 'joining' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
                            {state === 'joining' ? 'Ulanmoqda...' : 'Jonli dars'}
                        </span>
                        {faceCheckEnabled && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <ScanFace className="h-3.5 w-3.5" />
                                {faceCheck.notApplicable
                                    ? "Yuz nazorati sizga qo'llanmaydi (guruh talabasi emassiz)"
                                    : 'Dars davomida shaxs tasodifiy tekshiriladi'}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => void toggleFullscreen()}>
                            {isFullscreen ? (
                                <><Minimize2 className="mr-2 h-4 w-4" /> Oynaga qaytish</>
                            ) : (
                                <><Maximize2 className="mr-2 h-4 w-4" /> To'liq ekran</>
                            )}
                        </Button>
                        <Button variant="outline" size="sm" disabled={state === 'joining'} onClick={() => void leave()}>
                            <LogOut className="mr-2 h-4 w-4" /> Uchrashuvdan chiqish
                        </Button>
                    </div>
                </div>
            )}

            {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}

            {/* Keep the SDK mounted and measurable while joining, including
                its audio prompts and waiting room. Scroll only if SDK panels
                need more room than a small screen can provide. */}
            <div
                ref={viewportRef}
                className={state === 'waiting' ? 'zoom-meeting-viewport zoom-meeting-viewport--parked' : 'zoom-meeting-viewport'}
                hidden={state !== 'joined' && state !== 'joining' && state !== 'waiting'}
                aria-label="Zoom jonli dars oynasi"
            >
                <div ref={containerRef} className="zoom-meeting-root" />
            </div>
            {(state === 'joined' || state === 'joining') && (
                /* «Zoom ilovasida ochish» yo'q: havola talabaga berilmaydi —
                   u nazoratdan chiqish yo'li bo'lib qolardi. */
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                    <span>Ovoz va kamerani Zoom panelidan boshqaring</span>
                </div>
            )}
        </div>
    );
};
