import { useEffect, useRef, useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { zoomService } from '@/services/zoomService';
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
}

export const ZoomMeetingBox = ({ lessonId, joinUrl }: Props) => {
    const { user } = useAuth();
    const containerRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<ZoomClient | null>(null);
    const [state, setState] = useState<'idle' | 'joining' | 'joined'>('idle');
    const [error, setError] = useState('');

    // Sahifadan chiqilganda uchrashuvdan ham chiqamiz, aks holda mikrofon
    // va kamera ochiq qolib ketardi.
    useEffect(() => {
        return () => {
            clientRef.current?.leaveMeeting().catch(() => { /* uchrashuv allaqachon yopilgan */ });
            clientRef.current = null;
        };
    }, []);

    const join = async () => {
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
                    video: { isResizable: true, viewSizes: { default: { width: 1000, height: 600 } } },
                },
            });
            await client.join({
                signature: payload.signature,
                sdkKey: payload.sdk_key,
                meetingNumber: payload.meeting_number,
                password: payload.passcode ?? '',
                userName: user?.username ?? 'Talaba',
            });
            setState('joined');
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
            {state !== 'joined' && (
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => void join()} disabled={state === 'joining'}>
                        {state === 'joining' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                        {state === 'joining' ? "Ulanmoqda..." : "Darsga qo'shilish"}
                    </Button>
                    {/* SDK ishlamaydigan brauzerlar uchun (ayniqsa mobil) zaxira yo'l. */}
                    <a
                        href={joinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                        Zoom ilovasida ochish
                    </a>
                </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {/* SDK shu konteynerga chiziladi; u doim DOM'da turishi kerak. */}
            <div ref={containerRef} className={state === 'joined' ? 'min-h-[600px]' : 'hidden'} />
        </div>
    );
};
