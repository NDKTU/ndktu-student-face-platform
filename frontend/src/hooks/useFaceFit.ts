import { useEffect, useRef, useState, type RefObject } from 'react';

import { logger } from '@/utils/logger';

/**
 * Yuz ramkaga to'g'ri tushdimi — brauzerning o'zida, MediaPipe BlazeFace bilan.
 *
 * Bu faqat «qachon suratga olish» uchun: yuz bitta, markazda, mos kattalikda
 * va kameraga qaragan bo'lsa, kadr o'zi olinadi. Shaxsni solishtirish baribir
 * serverda — bu yerdagi natijaga hech narsa ishonib qoldirilmaydi.
 *
 * Model va WASM faqat shu hook ishlaganda yuklanadi (~3 MB gzip) va ilova
 * bilan birga keladi — CDN'ga bog'liq emas: universitet tarmog'ida tashqi
 * manzillar yopiq bo'lishi mumkin.
 */

export type FaceFitHint =
    | 'loading'
    | 'unavailable'
    | 'no_face'
    | 'multiple'
    | 'too_far'
    | 'too_close'
    | 'off_center'
    | 'turned'
    | 'fit';

export const FACE_FIT_MESSAGES: Record<FaceFitHint, string> = {
    loading: 'Yuz aniqlagich yuklanmoqda…',
    unavailable: 'Avtomatik suratga olish ishlamadi — tugmani bosing',
    no_face: 'Yuzingizni ramkaga keltiring',
    multiple: "Kadrda faqat siz bo'ling",
    too_far: 'Kameraga yaqinroq keling',
    too_close: 'Biroz uzoqroq turing',
    off_center: "Yuzingizni ramka o'rtasiga keltiring",
    turned: "To'g'ri kameraga qarang",
    fit: "Qimirlamang — suratga olinmoqda…",
};

/** Yuz shuncha vaqt ketma-ket ramkada tursa — suratga olinadi. */
const STEADY_MS = 800;
const DETECT_EVERY_MS = 150;

interface Box {
    originX: number;
    originY: number;
    width: number;
    height: number;
}

interface Keypoint {
    x: number;
    y: number;
}

/**
 * Ramka (`FaceEntryCamera` dagi oval) kadr o'rtasida, kengligi 50%,
 * balandligi 75%. BlazeFace qutisi peshona va sochni olmaydi, shuning uchun
 * u ovaldan kichikroq va biroz pastroq bo'ladi — chegaralar shunga moslangan.
 */
function classify(box: Box, keypoints: Keypoint[], width: number, height: number): FaceFitHint {
    const size = box.width / width;
    if (size < 0.2) return 'too_far';
    if (size > 0.55) return 'too_close';

    const cx = (box.originX + box.width / 2) / width;
    const cy = (box.originY + box.height / 2) / height;
    if (Math.abs(cx - 0.5) > 0.12 || Math.abs(cy - 0.52) > 0.16) return 'off_center';

    // Burun ikki ko'z o'rtasidan qanchalik chetga siljigan — bosh yon tomonga
    // burilganini bildiradi. Profil kadri etalon bilan yomon solishtiriladi.
    const [rightEye, leftEye, nose] = keypoints;
    if (rightEye && leftEye && nose) {
        const eyeDistance = Math.abs(leftEye.x - rightEye.x);
        const yaw = eyeDistance > 0 ? (nose.x - (leftEye.x + rightEye.x) / 2) / eyeDistance : 0;
        if (Math.abs(yaw) > 0.3) return 'turned';
    }
    return 'fit';
}

export function useFaceFit(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
    const [hint, setHint] = useState<FaceFitHint>('loading');
    const [steady, setSteady] = useState(false);
    const fitSinceRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | null = null;
        let detector: { detectForVideo: (video: HTMLVideoElement, ts: number) => unknown; close: () => void } | null =
            null;

        const update = (next: FaceFitHint) => {
            setHint((prev) => (prev === next ? prev : next));
            const now = performance.now();
            if (next === 'fit') {
                fitSinceRef.current ??= now;
                const isSteady = now - fitSinceRef.current >= STEADY_MS;
                setSteady((prev) => (prev === isSteady ? prev : isSteady));
            } else {
                fitSinceRef.current = null;
                setSteady((prev) => (prev ? false : prev));
            }
        };

        (async () => {
            try {
                const [{ FaceDetector }, wasmLoader, wasmBinary, model] = await Promise.all([
                    import('@mediapipe/tasks-vision'),
                    import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
                    import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
                    import('@/assets/models/blaze_face_short_range.tflite?url'),
                ]);
                const created = await FaceDetector.createFromOptions(
                    { wasmLoaderPath: wasmLoader.default, wasmBinaryPath: wasmBinary.default },
                    {
                        baseOptions: { modelAssetPath: model.default, delegate: 'CPU' },
                        runningMode: 'VIDEO',
                        minDetectionConfidence: 0.6,
                    },
                );
                if (cancelled) {
                    created.close();
                    return;
                }
                detector = created;
            } catch (error) {
                logger.error('Face detector failed to load', error);
                if (!cancelled) setHint('unavailable');
                return;
            }

            timer = setInterval(() => {
                const video = videoRef.current;
                if (!detector || !video || video.readyState < 2 || !video.videoWidth) return;
                try {
                    const result = detector.detectForVideo(video, performance.now()) as {
                        detections: { boundingBox?: Box; keypoints: Keypoint[] }[];
                    };
                    const faces = result.detections;
                    if (faces.length === 0) return update('no_face');
                    if (faces.length > 1) return update('multiple');
                    const box = faces[0].boundingBox;
                    if (!box) return update('no_face');
                    update(classify(box, faces[0].keypoints, video.videoWidth, video.videoHeight));
                } catch (error) {
                    logger.error('Face detection failed', error);
                }
            }, DETECT_EVERY_MS);
        })();

        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
            detector?.close();
            fitSinceRef.current = null;
        };
    }, [enabled, videoRef]);

    return { hint, steady: enabled && steady };
}
