import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, LogOut, Maximize2, Minimize2, Radio, ScanFace, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { zoomService } from '@/services/zoomService';
import { useLessonFaceCheck } from '@/hooks/useLessonFaceCheck';
import type { FaceCheckResult } from '@/services/faceCheckService';
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
const ZOOM_SCRIPTS = [
    `${ZOOM_CDN}/lib/vendor/react.min.js`,
    `${ZOOM_CDN}/lib/vendor/react-dom.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`,
    `${ZOOM_CDN}/lib/vendor/lodash.min.js`,
    `${ZOOM_CDN}/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`,
];

type ZoomClient = {
    init: (options: Record<string, unknown>) => Promise<void>;
    join: (options: Record<string, unknown>) => Promise<void>;
    leaveMeeting: () => Promise<void>;
    on?: (event: string, callback: (payload: unknown) => void) => void;
    /** SDK 6.x: uchrashuv davomida video o'lchamini qayta belgilash. */
    updateVideoOptions?: (options: Record<string, unknown>) => void;
};

declare global {
    interface Window {
        ZoomMtgEmbedded?: { createClient: () => ZoomClient };
    }
}

let sdkPromise: Promise<void> | null = null;

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
    lessonId: number;
    /** Dars sahifasida saqlangan havola — SDK ishlamasa shu ochiladi. */
    joinUrl: string;
    /** Yuz nazorati faqat talabalar uchun yoqiladi. */
    faceCheckEnabled?: boolean;
}

// Shaxs tasdiqlanmasa ham dars to'xtamaydi: uch urinishdan keyin talaba
// darsga kiradi, jurnalda esa «tasdiqlanmadi» yozuvi qoladi. Qaror
// o'qituvchida — yorug'lik yoki burilib turish begona odam degani emas.
const MAX_JOIN_ATTEMPTS = 3;

export const ZoomMeetingBox = ({ lessonId, joinUrl, faceCheckEnabled = false }: Props) => {
    const { user } = useAuth();
    const shellRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<ZoomClient | null>(null);
    const [state, setState] = useState<'idle' | 'verifying' | 'joining' | 'joined'>('idle');
    const [error, setError] = useState('');
    const [faceResult, setFaceResult] = useState<FaceCheckResult | null>(null);
    const [attempts, setAttempts] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const faceCheck = useLessonFaceCheck(lessonId);

    // Zoom's video dimensions exclude its header and toolbar. Measure the
    // available stage, and keep ribbon sizing separate from speaker/gallery.
    const viewSizes = useCallback(() => {
        const viewport = viewportRef.current;
        const width = Math.max(240, Math.min(1440, (viewport?.clientWidth || 960) - 24));
        const availableHeight = Math.max(135, (viewport?.clientHeight || 600) - 120);
        return {
            default: { width, height: Math.min(720, availableHeight, Math.round(width * 9 / 16)) },
            ribbon: { width: Math.min(316, width), height: Math.min(720, availableHeight) },
        };
    }, []);

    useEffect(() => {
        const onChange = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || state !== 'joined') return;
        let frame = 0;
        const resize = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                clientRef.current?.updateVideoOptions?.({ viewSizes: viewSizes() });
            });
        };
        const observer = new ResizeObserver(resize);
        observer.observe(viewport);
        resize();
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [state, viewSizes]);

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
            clientRef.current?.leaveMeeting().catch(() => { /* uchrashuv allaqachon yopilgan */ });
            clientRef.current = null;
        };
    }, []);

    const leave = async () => {
        await clientRef.current?.leaveMeeting().catch(() => { /* allaqachon yopiq */ });
        clientRef.current = null;
        faceCheck.stop();
        if (document.fullscreenElement === shellRef.current) await document.exitFullscreen().catch(() => undefined);
        setState('idle');
    };

    /** Darsga kirishdan oldingi tekshiruv. `true` — ulanamiz. */
    const verifyBeforeJoin = async (): Promise<boolean> => {
        setState('verifying');
        const result = await faceCheck.runCheck('join');
        setFaceResult(result);
        const nextAttempt = attempts + 1;
        setAttempts(nextAttempt);
        if (result?.status === 'ok') return true;
        // Xizmat javob bermasa ham (result === null) darsni to'sib qo'ymaymiz.
        return result === null || nextAttempt >= MAX_JOIN_ATTEMPTS;
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
        try {
            const payload = await zoomService.join(lessonId);
            await loadZoomSdk();
            if (!window.ZoomMtgEmbedded || !containerRef.current) throw new Error('Zoom SDK topilmadi');

            const client = window.ZoomMtgEmbedded.createClient();
            clientRef.current = client;
            await client.init({
                zoomAppRoot: containerRef.current,
                language: 'en-US',
                patchJsMedia: true,
                customize: {
                    video: {
                        isResizable: false,
                        popper: { disableDraggable: true },
                        viewSizes: viewSizes(),
                    },
                },
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
                userName: user?.username ?? 'Talaba',
            });
            setState('joined');
            // Uchrashuv sahifaning o'rtasida ochiladi — o'sha joyga olib
            // boramiz, aks holda talaba uni qidirib skroll qilishi kerak edi.
            requestAnimationFrame(() => {
                containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            if (faceCheckEnabled) faceCheck.startRandomChecks();
        } catch (cause) {
            logger.error('Zoom join failed', cause);
            // Bekend xatosi o'zbekcha keladi; Zoom SDK esa inglizcha sabab
            // qaytaradi (masalan «The meeting number is not found») — uni
            // yo'qotmaymiz, chunki muammoni aynan shu ochib beradi.
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            const sdkReason = (cause as { reason?: string })?.reason;
            setError(
                detail
                    || (sdkReason
                        ? `Uchrashuvga qo'shilib bo'lmadi: ${sdkReason}. Zoom ilovasida ochib ko'ring.`
                        : "Uchrashuvga qo'shilib bo'lmadi. Zoom ilovasida ochib ko'ring."),
            );
            await clientRef.current?.leaveMeeting().catch(() => undefined);
            clientRef.current = null;
            setState('idle');
        }
    };

    return (
        <div ref={shellRef} className="zoom-meeting-shell min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            {state === 'idle' || state === 'verifying' ? (
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
                            {faceResult.message}
                            {attempts < MAX_JOIN_ATTEMPTS
                                ? `. Qayta urinib ko'ring (${attempts}/${MAX_JOIN_ATTEMPTS})`
                                : '. Darsga kirasiz, lekin jurnalda qayd qilindi'}
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
                        {/* SDK ishlamaydigan brauzerlar uchun (ayniqsa mobil) zaxira yo'l. */}
                        <a
                            href={joinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                            Zoom ilovasida ochish
                        </a>
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
                className="zoom-meeting-viewport"
                hidden={state !== 'joined' && state !== 'joining'}
                aria-label="Zoom jonli dars oynasi"
            >
                <div ref={containerRef} className="zoom-meeting-root" />
            </div>
            {(state === 'joined' || state === 'joining') && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                    <span>Ovoz va kamerani Zoom panelidan boshqaring</span>
                    <a href={joinUrl} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                        Zoom ilovasida ochish ↗
                    </a>
                </div>
            )}
        </div>
    );
};
