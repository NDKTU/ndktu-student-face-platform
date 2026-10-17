import { useEffect, useState } from 'react';
import { Loader2, ScanFace, Video } from 'lucide-react';
import { FaceEntryCamera } from '@/components/FaceEntryCamera';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { zoomSessionService } from '@/services/zoomSessionService';
import { apiErrorMessage } from '@/utils/apiError';
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
    /** `false` — faqat kirishda tekshiriladi, xonada tasodifiy tekshiruv yo'q. */
    randomChecks?: boolean;
}

// Shaxs tasdiqlanmaguncha imzo berilmaydi — buni server hal qiladi
// (`zoom_session/repository.py::join`). Urinishlar cheklanmaydi: yomon yorug'lik
// talabaning aybi emas. Ilgari uch urinishdan keyin talaba baribir kirardi.
export const ZoomMeetingBox = ({
    sessionId,
    host = false,
    faceCheckEnabled = false,
    randomChecks = true,
}: Props) => {
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');
    /**
     * Kirishdagi yuz tekshiruvi oynasi — elementar testlardagi bilan bir xil
     * (`FaceEntryCamera`): talaba o'zini ko'radi, ramkaga qarab turadi, kadr
     * o'zi olinadi. Ilgari kamera yashirin ochilib, yarim soniyada kadr olardi:
     * talaba kadrga tushganini bilmas, «yuz topilmadi» ko'p chiqardi.
     *
     * Zoom ilovasi orqali kirish (telefonda zaxira yo'l) olib tashlangan:
     * dars faqat shu sahifadagi xonada — tasodifiy yuz tekshiruvi va
     * kirib-chiqish qaydi faqat shu yerda ishlaydi.
     */
    const [faceOpen, setFaceOpen] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [faceResult, setFaceResult] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        prefetchZoom();
    }, []);

    /** Imzo olib, Zoom xonasini ochadi. */
    const openZoom = async () => {
        setJoining(true);
        setError('');
        try {
            const payload = await zoomSessionService.join(sessionId);
            saveZoomRoomTicket(sessionId, { payload, faceCheck: faceCheckEnabled && randomChecks });
            // Alohida HTML sahifa, to'liq yuklash: Client View va saytning
            // stillari bir-biriga aralashmasin (`zoom-room.html`).
            window.location.assign(`/zoom-room.html?session=${sessionId}`);
        } catch (cause) {
            logger.error('Zoom join failed', cause);
            setError(apiErrorMessage(cause, "Uchrashuvga qo'shilib bo'lmadi."));
            setJoining(false);
        }
    };

    const start = () => {
        if (!faceCheckEnabled) {
            void openZoom();
            return;
        }
        setError('');
        setFaceResult(null);
        setFaceOpen(true);
    };

    /** Oynadagi kadr — serverga `join` tekshiruvi; tasdiqlansa — Zoom. */
    const captureFace = async (image: string) => {
        if (!faceOpen) return;
        setVerifying(true);
        try {
            const result = await zoomSessionService.faceCheck(sessionId, { stage: 'join', image_base64: image });
            setFaceResult({ ok: Boolean(result.admitted), text: result.message });
            if (result.admitted) {
                setFaceOpen(false);
                await openZoom();
            }
        } catch (cause) {
            // Guruh, vaqt, HEMIS surati yoki xizmat — bu yerda qayta urinish
            // yordam bermaydi: oynani yopamiz va sababni ochiq aytamiz.
            setFaceOpen(false);
            setError(apiErrorMessage(cause, "Shaxsni tekshirib bo'lmadi. Qayta urinib ko'ring."));
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            <div className="flex flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-primary/10 via-card to-cyan-500/10 px-4 py-10 text-center sm:px-8 sm:py-14">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                    <Video className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                    <p className="text-lg font-semibold tracking-tight">
                        {joining ? 'Zoom ochilmoqda...' : "Dars jonli efirda o'tadi"}
                    </p>
                    <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                        {host
                            ? "Zoom butun ekranda host sifatida ochiladi: «Join Audio» ni bosing — mikrofon yoqiq bo'ladi, talabalar ovozini boshqara olasiz."
                            : faceCheckEnabled && randomChecks
                                ? "Zoom butun ekranda ochiladi. Qo'shilishdan oldin shaxsingiz tekshiriladi, dars davomida ham tasodifiy tekshiriladi."
                            : faceCheckEnabled
                                ? "Zoom butun ekranda ochiladi. Qo'shilishdan oldin shaxsingiz bir marta tekshiriladi."
                                : "Zoom butun ekranda ochiladi — ilova shart emas. Kirgach «Join Audio» ni bosing."}
                    </p>
                </div>
                <Button onClick={start} disabled={joining}>
                    {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                    {joining ? 'Ochilmoqda...' : host ? 'Darsni boshlash' : "Darsga qo'shilish"}
                </Button>
            </div>
            {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}

            <Modal isOpen={faceOpen} onClose={() => setFaceOpen(false)} title="Shaxsni tasdiqlash">
                <div className="space-y-4">
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                        <ScanFace className="mt-0.5 h-4 w-4 shrink-0" />
                        Yuzingizni ramkaga joylang va bir lahza qimirlamay turing — kadr o'zi olinadi.
                        Tasdiqlangach dars ochiladi.
                    </p>
                    {/* Oyna yopilishi bilan kamera o'chadi — FaceEntryCamera o'zi yopadi. */}
                    {faceOpen && (
                        <FaceEntryCamera onCapture={captureFace} busy={verifying || joining} result={faceResult} />
                    )}
                    <div className="flex justify-end">
                        <Button type="button" variant="outline" onClick={() => setFaceOpen(false)}>
                            Bekor qilish
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
