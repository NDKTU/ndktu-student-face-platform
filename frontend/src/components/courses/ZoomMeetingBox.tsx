import { useEffect, useRef, useState } from 'react';
import { Loader2, LogOut, Radio, ScanFace, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { zoomService } from '@/services/zoomService';
import { useLessonFaceCheck } from '@/hooks/useLessonFaceCheck';
import type { FaceCheckResult } from '@/services/faceCheckService';
import { logger } from '@/utils/logger';

/**
 * Zoom Meeting SDK (Component View) — uchrashuv saytdan chiqmasdan ochiladi.
 *
 * SDK npm paketi sifatida emas, Zoom CDN'idan yuklanadi: `@zoom/meetingsdk`
 * peer sifatida React 18 ni talab qiladi, loyihada esa React 19. CDN bundli
 * o'z React'ini ichida olib yuradi, shuning uchun ziddiyat yo'q.
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
    const containerRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<ZoomClient | null>(null);
    const [state, setState] = useState<'idle' | 'verifying' | 'joining' | 'joined'>('idle');
    const [error, setError] = useState('');
    const [faceResult, setFaceResult] = useState<FaceCheckResult | null>(null);
    const [attempts, setAttempts] = useState(0);
    const faceCheck = useLessonFaceCheck(lessonId);

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

            // O'lcham konteyner kengligidan olinadi: qat'iy 1000×600 da video
            // kartochkadan chiqib ketar yoki yon tomonlarda qora chiziq qolardi.
            const width = Math.round(containerRef.current.clientWidth) || 960;
            // Bo'yi ekranga ham qarab olinadi: 16:9 keng monitorda balandlikni
            // sahifadan tashqariga chiqarib yuborardi.
            const height = Math.min(Math.round((width * 9) / 16), Math.round(window.innerHeight * 0.62));

            const client = window.ZoomMtgEmbedded.createClient();
            clientRef.current = client;
            await client.init({
                zoomAppRoot: containerRef.current,
                language: 'en-US',
                patchJsMedia: true,
                customize: {
                    video: {
                        isResizable: false,
                        // Ikkala ko'rinish uchun bir xil o'lcham: SDK «ribbon»
                        // rejimiga o'tganda blok bo'yiga cho'zilib, kartochkadan
                        // chiqib ketardi.
                        viewSizes: { default: { width, height }, ribbon: { width, height } },
                    },
                },
            });
            // Uchrashuv tugaganda yoki uzilib qolganda tugma qaytib kelsin.
            client.on?.('connection-change', (payload) => {
                const stateName = (payload as { state?: string })?.state;
                if (stateName === 'Closed' || stateName === 'Fail') {
                    clientRef.current = null;
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
            setState('idle');
        }
    };

    return (
        <div className="space-y-3">
            {state !== 'joined' ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-8 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {state === 'verifying' ? <ScanFace className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold">
                            {state === 'verifying' ? 'Shaxsingiz tekshirilmoqda' : "Dars jonli efirda o'tadi"}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                        <Button onClick={() => void join()} disabled={state === 'joining' || state === 'verifying'}>
                            {state === 'joining' || state === 'verifying'
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <Video className="mr-2 h-4 w-4" />}
                            {state === 'verifying'
                                ? 'Tekshirilmoqda...'
                                : state === 'joining'
                                    ? 'Ulanmoqda...'
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                            <Radio className="h-3.5 w-3.5 animate-pulse" /> Efirdasiz
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
                    <Button variant="outline" size="sm" onClick={() => void leave()}>
                        <LogOut className="mr-2 h-4 w-4" /> Uchrashuvdan chiqish
                    </Button>
                </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* SDK shu konteynerga chiziladi; u doim DOM'da turishi kerak,
                shuning uchun yashirilganda ham o'chirilmaydi. */}
            <div
                ref={containerRef}
                className={
                    state === 'joined'
                        // Zoom o'z tartibini o'zi chizadi (galereya, ribbon) va
                        // balandligi kutilganidan katta chiqishi mumkin — blok
                        // sahifani cho'zmasligi uchun cheklab, ichida skroll beramiz.
                        ? 'max-h-[78vh] overflow-auto rounded-xl border border-border/60 bg-black'
                        : 'h-0 w-full overflow-hidden'
                }
            />
        </div>
    );
};
