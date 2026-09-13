import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, LogOut, Maximize2, Minimize2, Radio, ScanFace, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { jitsiService } from '@/services/jitsiService';
import { JITSI_DOMAIN } from '@/config/env';
import { useLessonFaceCheck } from '@/hooks/useLessonFaceCheck';
import type { FaceCheckResult } from '@/services/faceCheckService';
import { logger } from '@/utils/logger';
import './JitsiMeetingBox.css';

/**
 * Jitsi Meet (External API) — Zoom yonidagi muqobil, sinov uchun.
 *
 * `ZoomMeetingBox` bilan bir xil qoidalarga bo'ysunadi: yuz nazorati,
 * to'liq ekran, chiqishda kamerani yopish. Farqi ikkitasi:
 *
 *  1. Imzo (signature) yo'q — ochiq Jitsi serverida xonaga kirish uchun
 *     kalit kerak emas, shuning uchun bekend faqat xona nomini beradi.
 *  2. SDK bitta skript: vendor fayllari va global React kerak emas, chunki
 *     Jitsi hammasini iframe ichida ochadi. Shu sababli loyihaning React 19
 *     bilan to'qnashuv ehtimoli ham yo'q.
 */
const JITSI_SCRIPT_PATH = '/external_api.js';

type JitsiApi = {
    dispose: () => void;
    addListener: (event: string, handler: (payload: unknown) => void) => void;
    executeCommand: (command: string, ...args: unknown[]) => void;
};

declare global {
    interface Window {
        JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
    }
}

// Skript domenga bog'liq: muassasa o'z serverini ko'tarsa, API o'sha
// serverdan yuklanishi kerak — shuning uchun kalit sifatida domen olinadi.
const sdkPromises = new Map<string, Promise<void>>();

function loadJitsiSdk(domain: string): Promise<void> {
    if (window.JitsiMeetExternalAPI) return Promise.resolve();
    const cached = sdkPromises.get(domain);
    if (cached) return cached;

    const src = `https://${domain}${JITSI_SCRIPT_PATH}`;
    const promise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
        if (existing?.dataset.loaded === 'true') return resolve();
        const script = existing ?? document.createElement('script');
        script.src = src;
        script.async = true;
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        });
        script.addEventListener('error', () => reject(new Error(`Yuklanmadi: ${src}`)));
        if (!existing) document.head.appendChild(script);
    }).catch((cause) => {
        sdkPromises.delete(domain);
        throw cause;
    });
    sdkPromises.set(domain, promise);
    return promise;
}

interface Props {
    lessonId: number;
    /** Dars sahifasida saqlangan havola — SDK ishlamasa shu ochiladi. */
    joinUrl: string;
    /** Yuz nazorati faqat talabalar uchun yoqiladi. */
    faceCheckEnabled?: boolean;
}

// Zoom qutisidagi bilan bir xil qoida: shaxs tasdiqlanmasa ham dars
// to'xtamaydi, uch urinishdan keyin talaba kiradi va jurnalda «tasdiqlanmadi»
// yozuvi qoladi. Qaror o'qituvchida.
const MAX_JOIN_ATTEMPTS = 3;

export const JitsiMeetingBox = ({ lessonId, joinUrl, faceCheckEnabled = false }: Props) => {
    const { user } = useAuth();
    const shellRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<JitsiApi | null>(null);
    const [state, setState] = useState<'idle' | 'verifying' | 'joining' | 'joined'>('idle');
    const [error, setError] = useState('');
    const [faceResult, setFaceResult] = useState<FaceCheckResult | null>(null);
    const [attempts, setAttempts] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const faceCheck = useLessonFaceCheck(lessonId);

    useEffect(() => {
        const onChange = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    // Sahifadan chiqilganda uchrashuvdan ham chiqamiz, aks holda mikrofon
    // va kamera ochiq qolib ketardi.
    useEffect(() => {
        return () => {
            apiRef.current?.dispose();
            apiRef.current = null;
        };
    }, []);

    const leave = useCallback(async () => {
        apiRef.current?.dispose();
        apiRef.current = null;
        faceCheck.stop();
        if (document.fullscreenElement === shellRef.current) {
            await document.exitFullscreen().catch(() => undefined);
        }
        setState('idle');
    }, [faceCheck]);

    const toggleFullscreen = async () => {
        const element = shellRef.current;
        if (!element) return;
        try {
            if (document.fullscreenElement === element) await document.exitFullscreen();
            else if (element.requestFullscreen) await element.requestFullscreen();
            else setError("Bu brauzer to'liq ekran rejimini qo'llamaydi. Jitsi'ni brauzerda ochishingiz mumkin.");
        } catch {
            setError("To'liq ekranni ochib bo'lmadi. Qayta urinib ko'ring.");
        }
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
            const payload = await jitsiService.join(lessonId);
            // Havolada domen bo'lsa u ustun: dars boshqa serverda o'tishi mumkin.
            const domain = payload.domain || JITSI_DOMAIN;
            await loadJitsiSdk(domain);
            if (!window.JitsiMeetExternalAPI || !containerRef.current) throw new Error('Jitsi SDK topilmadi');

            const api = new window.JitsiMeetExternalAPI(domain, {
                roomName: payload.room,
                parentNode: containerRef.current,
                userInfo: { displayName: user?.username ?? 'Talaba' },
                configOverwrite: {
                    prejoinPageEnabled: false,
                    disableDeepLinking: true,
                },
                interfaceConfigOverwrite: {
                    // Xonaga taklif qilish tugmasi olib tashlanadi: dars
                    // ro'yxati bekendda tekshiriladi, havolani tarqatish esa
                    // uni chetlab o'tish yo'li bo'lardi.
                    TOOLBAR_BUTTONS: [
                        'microphone', 'camera', 'desktop', 'fullscreen', 'fodeviceselection',
                        'hangup', 'chat', 'raisehand', 'tileview', 'settings',
                    ],
                },
            });
            apiRef.current = api;

            // Uchrashuv tugaganda yoki uzilib qolganda tugma qaytib kelsin.
            api.addListener('videoConferenceLeft', () => {
                void leave();
            });
            api.addListener('readyToClose', () => {
                void leave();
            });

            setState('joined');
            requestAnimationFrame(() => {
                containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            if (faceCheckEnabled) faceCheck.startRandomChecks();
        } catch (cause) {
            logger.error('Jitsi join failed', cause);
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || "Uchrashuvga qo'shilib bo'lmadi. Brauzerda ochib ko'ring.");
            apiRef.current?.dispose();
            apiRef.current = null;
            setState('idle');
        }
    };

    return (
        <div ref={shellRef} className="jitsi-meeting-shell min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            {state === 'idle' || state === 'verifying' ? (
                <div className="flex flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-violet-500/10 via-card to-primary/10 px-4 py-10 text-center sm:px-8 sm:py-14">
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
                                    : "Uchrashuv shu sahifada ochiladi — hech qanday ilova o'rnatish shart emas."}
                        </p>
                    </div>
                    {faceCheckEnabled && faceCheck.notApplicable && (
                        <p className="text-xs text-muted-foreground">
                            Yuz nazorati faqat guruh talabalari uchun — sizga qo'llanmadi.
                        </p>
                    )}
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
                                : attempts > 0 ? 'Qayta urinish' : "Darsga qo'shilish"}
                        </Button>
                        {/* Zaxira yo'l faqat SDK ishlamaganda ko'rinadi — Zoom
                            qutisidagi kabi: doimiy havola nazoratdan chiqishning
                            eng oson yo'li bo'lib qolardi. */}
                        {error && (
                            <a
                                href={joinUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                            >
                                Brauzerda ochish
                            </a>
                        )}
                    </div>
                </div>
            ) : (
                <div className="jitsi-meeting-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
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

            {/* Iframe ulanish paytida ham o'lchanadigan bo'lib turadi: Jitsi
                unga ruxsat so'rovlarini va kutish xonasini chizadi. */}
            <div
                className="jitsi-meeting-viewport"
                hidden={state !== 'joined' && state !== 'joining'}
                aria-label="Jitsi jonli dars oynasi"
            >
                <div ref={containerRef} className="jitsi-meeting-root" />
            </div>
            {(state === 'joined' || state === 'joining') && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                    <span>Ovoz va kamerani Jitsi panelidan boshqaring</span>
                </div>
            )}
        </div>
    );
};
