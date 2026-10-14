import { useEffect, useMemo, useRef, useState } from 'react';
import { Hourglass, Loader2, LogOut, Maximize2, MicOff, Minimize2, Radio, ScanFace, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { zoomSessionService } from '@/services/zoomSessionService';
import { useZoomFaceCheck } from '@/hooks/useZoomFaceCheck';
import { apiErrorMessage } from '@/utils/apiError';
import type { FaceCheckResult, ZoomJoinResponse } from '@/services/zoomSessionService';
import { isMobileDevice } from '@/utils/device';
import { logger } from '@/utils/logger';
import './ZoomMeetingBox.css';
import { useKeepSessionAlive } from '@/hooks/useKeepSessionAlive';

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

/**
 * SDK'ning `/lib` dan oladigan og'ir fayllari — prod nginx jurnalidan
 * (14.10): brauzerlar har kirishda aynan shularni so'ragan. Audio dekoder
 * varianti (`audio.simd` / `audio.light.simd`) brauzerga qarab tanlanadi,
 * shuning uchun ular bu yerda yo'q — keraksiz 3–4 MB yuklamaymiz.
 */
const ZOOM_LIB_PREFETCH = [
    'manifest.json', 'js_media.min.js', 'net.wasm', 'net_thread.min.js',
    'tp.min.js', 'tp.wasm', 'wmsc.min.js', 'video_simd.min.js', 'video.simd.wasm',
    'sharing_simd.min.js', 'audio.encode.wasm',
];

let prefetchStarted = false;

/**
 * Sahifa ochilishi bilan SDK'ni oldindan yuklaymiz — talaba tugmaga qarab
 * turgan va yuz tekshiruvidan o'tayotgan paytda. Ilgari yuklash faqat
 * imzo kelgandan keyin boshlanardi va ~12–15 MB shu zanjirning oxirida
 * kutilardi. `/lib` fayllari bir yillik kesh bilan beriladi, SDK ularni
 * xuddi shu manzildan so'raydi — keyin tarmoqqa chiqmaydi. Xato bo'lsa
 * jim: kirishda baribir yuklanadi.
 */
function prefetchZoom() {
    if (prefetchStarted) return;
    prefetchStarted = true;
    loadZoomSdk()
        .then(() =>
            Promise.all(
                ZOOM_LIB_PREFETCH.map((name) =>
                    fetch(`${window.location.origin}/lib/${name}`, { priority: 'low' } as RequestInit).then((r) => r.blob()),
                ),
            ),
        )
        .catch(() => {
            prefetchStarted = false;
        });
}

/**
 * Zoom asboblar panelidagi «Join Audio» tugmasi. SDK'da ovozga ulanishning
 * ochiq metodi yo'q (`EmbeddedClient` da faqat `mute`/`muteAll`/`stopAudio`),
 * shuning uchun tugmani o'zimiz bosamiz. Yorliq `aria-label` da va
 * `language: 'en-US'` bilan doim inglizcha. SDK versiyasi almashsa, shu
 * selektorni qayta tekshirish kerak (6.2.0 da tekshirilgan).
 */
const JOIN_AUDIO_SELECTOR = '[aria-label="Join Audio"], [title="Join Audio"]';
/** Ulangandan keyin tugma shuncha vaqt ichida chiqmasa — qidirishni to'xtatamiz. */
const JOIN_AUDIO_WAIT_MS = 30_000;

function findJoinAudioButton(root: HTMLElement | null): HTMLElement | null {
    const label = root?.querySelector<HTMLElement>(JOIN_AUDIO_SELECTOR);
    if (!label) return null;
    // Tooltip'li variantda `aria-label` o'rovchi elementda, bosiladigani ichida.
    return label.matches('button') ? label : label.querySelector<HTMLElement>('button') ?? label;
}

/**
 * Mikrofonga ruxsatni kirish tugmasi bosilgan zahoti so'raymiz. Ruxsatsiz
 * Zoom ovozga umuman ulanmaydi — talaba o'qituvchini ham eshitmaydi.
 * Oqim darhol yopiladi: mikrofonni keyin Zoom o'zi oladi. `false` — rad etildi.
 */
async function ensureMicrophone(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
    } catch (cause) {
        // Mikrofon umuman yo'q — bu ruxsat masalasi emas, Zoom tinglashga ulaydi.
        return (cause as DOMException)?.name === 'NotFoundError';
    }
}

interface Props {
    sessionId: number;
    /** Darsni olib boruvchi: uchrashuvni host sifatida boshlaydi. */
    host?: boolean;
    /** Kirishdan oldin yuz tekshiruvi (server talab qiladi) va dars davomida tasodifiy. */
    faceCheckEnabled?: boolean;
}

// Shaxs tasdiqlanmaguncha imzo berilmaydi — buni server hal qiladi
// (`zoom_session/repository.py::join`). Urinishlar cheklanmaydi: yomon yorug'lik
// talabaning aybi emas. Ilgari uch urinishdan keyin talaba baribir kirardi.
export const ZoomMeetingBox = ({ sessionId, host = false, faceCheckEnabled = false }: Props) => {
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
    // Telefonda SDK (Component View) qo'llanmaydi — talaba Zoom ilovasiga o'tadi.
    const mobile = useMemo(isMobileDevice, []);
    const [micDenied, setMicDenied] = useState(false);
    /** Ulangan, lekin ovoz yo'q («Join Audio» hali ko'rinib turibdi). */
    const [audioMissing, setAudioMissing] = useState(false);
    const audioWatchRef = useRef<number | null>(null);
    // Ma'ruzani tinglayotgan talaba sichqonchaga tegmaydi — avtochiqish uni
    // uchrashuvdan chiqarib yubormasin.
    useKeepSessionAlive(state !== 'idle');

    // Quti faqat kirish mumkin bo'lganda chiziladi — SDK'ni shu zahoti
    // yuklay boshlaymiz, tugma bosilishini kutmasdan.
    // Telefonda SDK ishlatilmaydi — mobil trafikni behuda sarflamaymiz.
    useEffect(() => {
        if (!mobile) prefetchZoom();
    }, [mobile]);

    const stopAudioWatch = () => {
        if (audioWatchRef.current) window.clearInterval(audioWatchRef.current);
        audioWatchRef.current = null;
        setAudioMissing(false);
    };

    /**
     * Ulangandan keyin «Join Audio» ni bir marta o'zimiz bosamiz: brauzer ovozni
     * faqat foydalanuvchi bosganda yoqadi, «Darsga qo'shilish» bosilgani esa
     * sahifaga shu ruxsatni allaqachon bergan. Keyin kuzatib turamiz: tugma
     * qayta paydo bo'lsa (ruxsat yo'q, ulanish uzildi) — ko'rinadigan ogohlantirish.
     * 13.10–14.10 da o'qituvchi eshitilmaganining eng ehtimolli sababi — shu tugma bosilmagan.
     */
    const startAudioWatch = () => {
        stopAudioWatch();
        const startedAt = Date.now();
        let clicked = false;
        audioWatchRef.current = window.setInterval(() => {
            const button = findJoinAudioButton(containerRef.current);
            if (button && !clicked && !button.hasAttribute('disabled')) {
                clicked = true;
                button.click();
                return;
            }
            // Bosganimizdan keyin ham tugma turgan bo'lsa — ovoz ulanmagan.
            if (clicked || Date.now() - startedAt > JOIN_AUDIO_WAIT_MS) setAudioMissing(Boolean(button));
        }, 1500);
    };

    useEffect(() => {
        const onChange = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    /**
     * Darsga kirish tugmasi bosilganda — to'liq ekran. Brauzer uni faqat
     * bosish paytida ruxsat beradi: kirish esa bir necha soniya davom etadi
     * (yuz, server, SDK), shuning uchun ulangandan keyin so'rab bo'lmaydi.
     * Shuning uchun `join` ning birinchi `await` idan oldin chaqiriladi.
     * iPhone Safari elementni to'liq ekranga chiqarmaydi — u yerda jim o'tadi.
     */
    const enterFullscreen = () => {
        const element = shellRef.current;
        if (!element || document.fullscreenElement === element || !element.requestFullscreen) return;
        element.requestFullscreen().catch(() => undefined);
    };

    /** Kirish bo'lmadi yoki uchrashuv tugadi — sahifaga qaytamiz. */
    const exitFullscreen = () => {
        if (document.fullscreenElement === shellRef.current) void document.exitFullscreen().catch(() => undefined);
    };

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
            if (audioWatchRef.current) window.clearInterval(audioWatchRef.current);
            clientRef.current?.leaveMeeting().catch(() => { /* uchrashuv allaqachon yopilgan */ });
            clientRef.current = null;
        };
    }, []);

    const cancelWaiting = () => {
        cancelledRef.current = true;
        if (retryRef.current) window.clearTimeout(retryRef.current);
        retryRef.current = null;
        exitFullscreen();
        setState('idle');
    };

    const leave = async () => {
        await clientRef.current?.leaveMeeting().catch(() => { /* allaqachon yopiq */ });
        clientRef.current = null;
        faceCheck.stop();
        stopAudioWatch();
        exitFullscreen();
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
        if (!mobile) {
            enterFullscreen();
            setMicDenied(!(await ensureMicrophone()));
        }
        if (faceCheckEnabled) {
            const allowed = await verifyBeforeJoin();
            if (!allowed) {
                exitFullscreen();
                setState('idle');
                return;
            }
        }
        setState('joining');
        setError('');
        cancelledRef.current = false;
        let payload: ZoomJoinResponse;
        try {
            payload = await zoomSessionService.join(sessionId, { app: mobile });
        } catch (cause) {
            logger.error('Zoom join failed', cause);
            setError(apiErrorMessage(cause, "Uchrashuvga qo'shilib bo'lmadi."));
            exitFullscreen();
            setState('idle');
            return;
        }
        // Telefon: shaxsiy havola bilan Zoom ilovasi ochiladi. Havola faqat
        // LMS yaratgan uchrashuvda bor; qo'lda berilgan havolada SDK'ga qaytamiz.
        if (payload.app_join_url) {
            setState('idle');
            window.location.href = payload.app_join_url;
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
                    stopAudioWatch();
                    exitFullscreen();
                    setState('idle');
                }
            });
            await client.join({
                signature: payload.signature,
                sdkKey: payload.sdk_key,
                meetingNumber: payload.meeting_number,
                password: payload.passcode ?? '',
                userName: payload.user_name || user?.username || 'Talaba',
                // O'qituvchi host bo'lib kiradi (imzoda `role: 1` + ZAK) —
                // mikrofon o'chirilmaydi va talabalarni boshqara oladi.
                ...(payload.zak ? { zak: payload.zak } : {}),
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
            startAudioWatch();
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
            exitFullscreen();
            setState('idle');
        }
    };

    return (
        <div ref={shellRef} className="zoom-meeting-shell min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            {state === 'waiting' ? (
                <div className="zoom-meeting-placeholder flex flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-card to-primary/10 px-4 py-10 text-center sm:px-8 sm:py-14">
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
                <div className="zoom-meeting-placeholder flex flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-primary/10 via-card to-cyan-500/10 px-4 py-10 text-center sm:px-8 sm:py-14">
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
                                    : mobile
                                    ? "Telefonda dars Zoom ilovasida ochiladi — ilova o'rnatilmagan bo'lsa, avval uni o'rnating."
                                    : host
                                    ? "Uchrashuv shu sahifada host sifatida ochiladi: mikrofon yoqiq, talabalar ovozini boshqara olasiz."
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
                                : attempts > 0 ? "Qayta urinish" : host ? 'Darsni boshlash' : "Darsga qo'shilish"}
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

            {/* Ovoz ulanmagan — bu quti ichida, to'liq ekranda ham ko'rinadi. */}
            {state === 'joined' && audioMissing && (
                <div role="alert" className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    <MicOff className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        {micDenied
                            ? "Brauzer mikrofonga ruxsat bermadi — usiz Zoom ovozga ulanmaydi va o'qituvchini eshitmaysiz. Manzil satridagi qulf belgisidan mikrofonga ruxsat bering, so'ng pastdagi «Join Audio» tugmasini bosing."
                            : "Ovoz ulanmagan. Pastdagi «Join Audio» tugmasini bosing — mikrofonni keyin o'chirib qo'yishingiz mumkin, o'qituvchi baribir eshitiladi."}
                    </span>
                </div>
            )}

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
