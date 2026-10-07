import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { FACE_FIT_MESSAGES, useFaceFit } from '@/hooks/useFaceFit';
import { cn } from '@/lib/utils';

type CameraStatus = 'starting' | 'ready' | 'denied' | 'error';

/**
 * Rad etilgandan keyin keyingi avtomatik urinishgacha pauza. Server bitta
 * talabaga daqiqasiga 10 ta tekshiruv beradi — 7 soniya bu chegaraga
 * yetmaydi, odamga esa yorug'lik yoki holatini o'zgartirishga vaqt beradi.
 */
const RETRY_COOLDOWN_MS = 7000;

interface Props {
    /** Kadr olindi — `data:image/jpeg;base64,...`. */
    onCapture: (image: string) => void;
    /** Kadr serverda tekshirilyapti. */
    busy: boolean;
    /** Oxirgi tekshiruv natijasi: mos kelmasa — sababi, talaba qayta urinadi. */
    result: { ok: boolean; text: string } | null;
}

/**
 * Testga kirishdagi yuz tekshiruvi (`face_entry`): jonli ko'rinish va bitta
 * kadr olish.
 *
 * Kadr o'zi olinadi: yuz ramkada bir lahza qimirlamay tursa (`useFaceFit`).
 * Aniqlagich yuklanmasa — tugma bilan. Rad etilsa, pauzadan keyin yana
 * avtomatik urinadi; tugma bilan darhol qayta urinish ham mumkin.
 *
 * Kamera faqat shu oyna ochiq turganda yonadi va yopilishi bilan o'chadi —
 * test davomida kuzatuv yo'q. Kadrni solishtirishni server qiladi, bu yerda
 * faqat surat olinadi.
 */
export const FaceEntryCamera = ({ onCapture, busy, result }: Props) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    // http sahifa yoki eski brauzerda `mediaDevices` yo'q — kamera umuman ochilmaydi.
    const [status, setStatus] = useState<CameraStatus>(() =>
        typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'starting' : 'error',
    );

    const { hint, steady } = useFaceFit(videoRef, status === 'ready');
    // Rad etilgandan keyingi pauza: qaysi natija uchun pauza tugaganini
    // eslab qolamiz — yangi rad etish yangi pauzani boshlaydi.
    const [cooledFor, setCooledFor] = useState<Props['result']>(null);
    const coolingDown = Boolean(result && !result.ok && cooledFor !== result);

    useEffect(() => {
        if (!result || result.ok) return;
        const timer = setTimeout(() => setCooledFor(result), RETRY_COOLDOWN_MS);
        return () => clearTimeout(timer);
    }, [result]);

    useEffect(() => {
        let cancelled = false;
        if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return;
        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
            .then((stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    void videoRef.current.play().catch(() => undefined);
                }
                setStatus('ready');
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error');
            });

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
    }, []);

    const capture = useCallback(() => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        onCapture(canvas.toDataURL('image/jpeg', 0.85));
    }, [onCapture]);

    const autoAllowed = !busy && !coolingDown && !result?.ok;
    useEffect(() => {
        if (steady && autoAllowed) capture();
    }, [steady, autoAllowed, capture]);

    const manualRetry = () => {
        setCooledFor(result);
        capture();
    };

    return (
        <div className="space-y-3">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-border bg-muted">
                {/* Ko'zgu ko'rinishi: odam o'zini oynadagidek ko'radi. Server kadrni aslidek oladi. */}
                <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
                {status === 'ready' && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div
                            className={cn(
                                'h-3/4 w-1/2 rounded-[50%] border-2 transition-colors',
                                hint === 'fit' ? 'border-solid border-emerald-400' : 'border-dashed border-white/70',
                            )}
                        />
                    </div>
                )}
                {status !== 'ready' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                        {status === 'starting' ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Kamera yoqilmoqda…
                            </>
                        ) : (
                            <>
                                <Camera className="h-5 w-5" />
                                {status === 'denied'
                                    ? 'Kameraga ruxsat berilmadi. Brauzer manzil satridagi kamera belgisidan ruxsat bering.'
                                    : 'Kamerani ochib bo‘lmadi. Kamera ulanganini tekshiring.'}
                            </>
                        )}
                    </div>
                )}
            </div>

            <p
                className={cn(
                    'text-center text-sm',
                    hint === 'fit' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}
            >
                {status !== 'ready'
                    ? "Yuzingizni ramka ichida, yorug' joyda tuting. Kadrda faqat siz bo'ling."
                    : busy
                      ? 'Tekshirilmoqda…'
                      : coolingDown
                        ? "Yorug'roq joyga o'ting yoki holatingizni o'zgartiring — tez orada yana urinadi"
                        : FACE_FIT_MESSAGES[hint]}
            </p>

            {result && (
                <div
                    className={cn(
                        'flex items-start gap-2 rounded-md px-3 py-2 text-sm',
                        result.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive',
                    )}
                >
                    {result.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{result.text}</span>
                </div>
            )}

            <Button
                type="button"
                variant={hint === 'unavailable' ? 'primary' : 'outline'}
                className="w-full gap-2"
                onClick={manualRetry}
                disabled={status !== 'ready' || busy || Boolean(result?.ok)}
            >
                {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : result && !result.ok ? (
                    <RefreshCw className="h-4 w-4" />
                ) : (
                    <Camera className="h-4 w-4" />
                )}
                {busy ? 'Tekshirilmoqda…' : result && !result.ok ? 'Qayta urinish' : 'Yuzni tasdiqlash'}
            </Button>
        </div>
    );
};
