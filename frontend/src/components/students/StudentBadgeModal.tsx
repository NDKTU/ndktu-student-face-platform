import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Download, ImageOff, Loader2, RefreshCw, Rotate3d } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import logoUrl from '@/assets/logo.png';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { BRAND } from '@/config/branding';
import { useStudentBadge, useStudentBadgePhoto } from '@/hooks/useStudents';
import {
    BADGE_DPI,
    BADGE_HEIGHT,
    BADGE_SIZE_CM,
    BADGE_WIDTH,
    badgeFileName,
    badgeFontSample,
    badgeThemeFor,
    badgeToJpeg,
    drawStudentBadge,
    loadBadgeFonts,
    loadImage,
    saveBlob,
    type BadgeContent,
} from '@/lib/studentBadge';
import { BadgeTilt } from './BadgeTilt';

interface StudentBadgeModalProps {
    isOpen: boolean;
    onClose: () => void;
    studentId: number;
}

/** Canvas'da hozir nima turibdi: hech narsa, standart rasmli yoki suratli bejik. */
type Drawn = 'none' | 'placeholder' | 'photo';

const BadgePreview = ({ studentId, onClose }: { studentId: number; onClose: () => void }) => {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [drawn, setDrawn] = useState<Drawn>('none');
    const [photoBroken, setPhotoBroken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const badgeQuery = useStudentBadge(studentId);
    const badge = badgeQuery.data;
    const photoQuery = useStudentBadgePhoto(studentId, badge?.has_photo === true);
    const photoBlob = photoQuery.data;

    useEffect(() => {
        if (!badge) return;
        let cancelled = false;
        let objectUrl: string | null = null;

        const content: BadgeContent = {
            fullName: badge.full_name,
            faculty: badge.faculty,
            groupName: badge.group_name,
            studentIdNumber: badge.student_id_number,
            universityName: BRAND.universityName,
            universityShortName: BRAND.shortName,
        };

        const render = async () => {
            const [logo, photo] = await Promise.all([
                loadImage(logoUrl).catch(() => null),
                photoBlob
                    ? loadImage((objectUrl = URL.createObjectURL(photoBlob))).catch(() => null)
                    : Promise.resolve(null),
                loadBadgeFonts(badgeFontSample(content)),
            ]);
            // Surat kelgach effekt qayta ishlaydi: eski chizma yangisining
            // ustiga tushmasligi uchun tekshiruv chizishdan oldin turadi.
            if (cancelled || !canvasRef.current) return;

            drawStudentBadge(canvasRef.current, content, { logo, photo });
            setPhotoBroken(Boolean(photoBlob) && photo === null);
            setDrawn(photo ? 'photo' : 'placeholder');
        };

        render().catch(() => {
            if (!cancelled) toast.error(t("Bejikni chizib bo'lmadi"));
        });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [badge, photoBlob, t]);

    if (badgeQuery.isError) {
        const forbidden = isAxiosError(badgeQuery.error) && badgeQuery.error.response?.status === 403;
        return (
            <ErrorState
                title={forbidden ? t("Ruxsat yo'q") : undefined}
                description={forbidden ? t('Bejik yaratish faqat administratorga ruxsat etilgan.') : undefined}
                onRetry={forbidden ? undefined : () => badgeQuery.refetch()}
            />
        );
    }

    // Fakultet rangi (Konchilik — yashil): oldindan ko'rish foni ham shu tusda.
    const theme = badge ? badgeThemeFor(badge.faculty) : null;
    const photoMissing = badge?.has_photo === false;
    // `!photoBlob`: fonda qayta so'rash xato bersa ham, avval kelgan surat
    // bejikda turibdi — ogohlantirish kerak emas.
    const photoFailed = (photoQuery.isError && !photoBlob) || photoBroken;
    // Surat hali yo'lda bo'lsa, yuklab olish kutadi: aks holda admin
    // standart rasmli bejikni saqlab qo'yishi mumkin edi.
    const isReady = drawn === 'photo' || (drawn === 'placeholder' && (photoMissing || photoFailed));
    const isPhotoPending = Boolean(badge?.has_photo) && !photoFailed && drawn !== 'photo';

    const handleDownload = async () => {
        if (!canvasRef.current || !badge) return;
        setIsSaving(true);
        try {
            const blob = await badgeToJpeg(canvasRef.current);
            saveBlob(blob, badgeFileName(badge.full_name, badge.student_id_number, badge.student_id));
            toast.success(t('Bejik JPG formatida yuklab olindi'));
        } catch {
            toast.error(t("Bejikni saqlab bo'lmadi"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Sahna: bejik rangidagi yorug'lik ustida turgan karta. */}
            <div
                className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-6 sm:py-7"
                style={
                    theme
                        ? {
                              backgroundImage: `radial-gradient(circle at 50% 38%, color-mix(in srgb, ${theme.main} 22%, transparent), transparent 68%)`,
                          }
                        : undefined
                }
            >
                <BadgeTilt
                    enabled={drawn !== 'none'}
                    className="mx-auto w-full max-w-[270px] sm:max-w-[310px]"
                    cardClassName="overflow-hidden rounded-[14px] bg-white shadow-2xl shadow-black/25 ring-1 ring-black/10"
                    cardStyle={{ aspectRatio: `${BADGE_WIDTH} / ${BADGE_HEIGHT}` }}
                >
                    {/* Canvas doim DOM'da: unga ref yuklanish paytidayoq kerak. */}
                    <canvas
                        ref={canvasRef}
                        width={BADGE_WIDTH}
                        height={BADGE_HEIGHT}
                        role="img"
                        aria-label={badge ? t('{{name}} bejigi', { name: badge.full_name }) : t('Talaba bejigi')}
                        className="block h-full w-full"
                    />
                    {drawn === 'none' && <Skeleton className="absolute inset-0 rounded-none" />}
                </BadgeTilt>
            </div>

            <div className="space-y-1 text-center text-xs text-muted-foreground">
                <p>
                    {t("O'lcham: {{w}} × {{h}} sm · {{pw}} × {{ph}} px · {{dpi}} DPI", {
                        w: BADGE_SIZE_CM.width,
                        h: BADGE_SIZE_CM.height,
                        pw: BADGE_WIDTH,
                        ph: BADGE_HEIGHT,
                        dpi: BADGE_DPI,
                    })}
                </p>
                <p className="flex items-center justify-center gap-1.5 motion-reduce:hidden">
                    <Rotate3d className="h-3.5 w-3.5 shrink-0" />
                    <span>{t("Kartani kursor yoki barmoq bilan burib ko'ring")}</span>
                </p>
            </div>

            {isPhotoPending && (
                <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span>{t('Talaba surati yuklanmoqda...')}</span>
                </div>
            )}

            {(photoMissing || photoFailed) && (
                <div
                    role="status"
                    className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300 sm:flex-row sm:items-center"
                >
                    <div className="flex flex-1 items-start gap-2">
                        <ImageOff className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            {photoMissing
                                ? t("Talabaning surati tizimda yo'q — bejikda standart rasm ishlatildi.")
                                : t("Talaba suratini yuklab bo'lmadi — bejikda standart rasm ishlatildi.")}
                        </span>
                    </div>
                    {photoFailed && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 gap-1.5"
                            isLoading={photoQuery.isFetching}
                            onClick={() => {
                                setPhotoBroken(false);
                                photoQuery.refetch();
                            }}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>{t('Qayta urinish')}</span>
                        </Button>
                    )}
                </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={onClose}>
                    {t('Yopish')}
                </Button>
                <Button onClick={handleDownload} disabled={!isReady} isLoading={isSaving} className="gap-2">
                    {!isSaving && <Download className="h-4 w-4" />}
                    <span>{t('JPG formatida yuklab olish')}</span>
                </Button>
            </div>
        </div>
    );
};

/**
 * Talaba bejigini oldindan ko'rish va JPG qilib yuklab olish.
 *
 * Ma'lumot qayta kiritilmaydi: hammasi `GET /students/{id}/badge` dan keladi.
 * Ichki qism faqat oyna ochiqligida mavjud (Radix yopiq oynani DOM'ga
 * chiqarmaydi), ya'ni so'rovlar tugma bosilgandagina ketadi.
 */
export const StudentBadgeModal = ({ isOpen, onClose, studentId }: StudentBadgeModalProps) => {
    const { t } = useTranslation();
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('Talaba bejigi')}>
            <BadgePreview studentId={studentId} onClose={onClose} />
        </Modal>
    );
};

export default StudentBadgeModal;
