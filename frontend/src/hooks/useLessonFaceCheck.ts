import { useCallback, useEffect, useRef, useState } from 'react';
import { faceCheckService, type FaceCheckResult, type FaceCheckStage } from '@/services/faceCheckService';
import { logger } from '@/utils/logger';

/**
 * Jonli darsdagi yuz nazorati.
 *
 * Kamera oqimi Zoom bilan parallel ochiladi — brauzer bitta kameradan
 * bir nechta oqim berishga ruxsat beradi (tekshirildi), shuning uchun
 * uchrashuvga xalaqit qilmaydi.
 *
 * Tekshiruv vaqtlari tasodifiy: qat'iy jadval bo'lsa, uni oldindan bilib
 * olish mumkin edi.
 *
 * Oraliq ~1 daqiqa. Hisobotda «necha daqiqa yo'q edi» degan savolga javob
 * berish kerak, 5-12 daqiqalik oraliqda esa aniqlik o'sha oraliqdan yaxshi
 * bo'la olmasdi. Qaror bitta kadrga qarab qabul qilinmaydi: ketma-ket
 * ikkitasi buzilgandagina «yo'q» davri ochiladi (backend'da).
 */
const MIN_INTERVAL_MS = 45 * 1000;
const MAX_INTERVAL_MS = 75 * 1000;

const randomDelay = () => MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);

export function useLessonFaceCheck(lessonId: number) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastResult, setLastResult] = useState<FaceCheckResult | null>(null);
    // Tekshiruv bu foydalanuvchiga tegishli emas (talaba emas).
    const [notApplicable, setNotApplicable] = useState(false);

    const stop = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => stop, [stop]);

    /** Kamerani ochadi. Ruxsat berilmasa `false` qaytaradi — dars to'xtamaydi. */
    const openCamera = useCallback(async (): Promise<boolean> => {
        if (streamRef.current) return true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            streamRef.current = stream;
            if (!videoRef.current) {
                const video = document.createElement('video');
                video.muted = true;
                video.playsInline = true;
                videoRef.current = video;
            }
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => { /* avtomatik ijro bloklansa ham kadr olinadi */ });
            if (!canvasRef.current) {
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 480;
                canvasRef.current = canvas;
            }
            return true;
        } catch (cause) {
            logger.warn('Face check camera unavailable', cause);
            return false;
        }
    }, []);

    const capture = useCallback((): string | null => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.8);
    }, []);

    /**
     * `null` — tekshirib bo'lmadi (xizmat javob bermadi yoki foydalanuvchi
     * bu guruhning talabasi emas). Bunday holatda dars to'xtatilmaydi.
     */
    const runCheck = useCallback(async (stage: FaceCheckStage): Promise<FaceCheckResult | null> => {
        // Sahifa fonda bo'lsa kadr olinmaydi: brauzer fon tabidagi taymerlarni
        // sekinlashtiradi va kamera qora kadr berishi mumkin. Bunday kadrga
        // qarab «talaba yo'q» deyish halol emas — serverga holatni aytamiz.
        if (document.visibilityState === 'hidden') {
            try {
                const result = await faceCheckService.run(lessonId, { stage, page_hidden: true });
                setLastResult(result);
                return result;
            } catch (cause) {
                logger.warn('Face check skipped (page hidden)', cause);
                return null;
            }
        }
        const cameraReady = await openCamera();
        if (!cameraReady) {
            try {
                const result = await faceCheckService.run(lessonId, { stage, camera_unavailable: true });
                setLastResult(result);
                return result;
            } catch (cause) {
                logger.error('Face check failed', cause);
                return null;
            }
        }
        // Birinchi kadrlar qora bo'lib chiqadi — kamera ekspozitsiyasi ulgurmaydi.
        await new Promise((resolve) => setTimeout(resolve, 600));
        const image = capture();
        try {
            const result = await faceCheckService.run(lessonId, {
                stage,
                image_base64: image ?? undefined,
                camera_unavailable: !image,
            });
            setLastResult(result);
            return result;
        } catch (cause) {
            const status = (cause as { response?: { status?: number } })?.response?.status;
            // 403 — bu guruhning talabasi emas (masalan, admin yoki o'qituvchi
            // talaba ko'rinishida): tekshiruv qo'llanmaydi, xato ham emas.
            if (status === 403) {
                setNotApplicable(true);
                return null;
            }
            // 429 — cheklovga urildik. Bu talabaning aybi emas va uni xato deb
            // jurnalga yozish mumkin emas: keyingi tekshiruvda qayta uriniladi.
            if (status === 429) {
                logger.warn('Face check rate limited — keyingi tekshiruvda qayta urinamiz');
                return null;
            }
            logger.error('Face check failed', cause);
            return null;
        }
    }, [lessonId, openCamera, capture]);

    /** Dars davomida tasodifiy vaqtlarda tekshiradi. */
    const startRandomChecks = useCallback(() => {
        if (timerRef.current) return;
        const tick = () => {
            timerRef.current = setTimeout(async () => {
                await runCheck('random');
                timerRef.current = null;
                tick();
            }, randomDelay());
        };
        tick();
    }, [runCheck]);

    return { runCheck, startRandomChecks, stop, lastResult, notApplicable };
}
