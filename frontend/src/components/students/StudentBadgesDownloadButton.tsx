import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import logoUrl from '@/assets/logo.png';
import { Button } from '@/components/ui/Button';
import { BRAND } from '@/config/branding';
import { useRoleView } from '@/hooks/useRoleView';
import {
    badgeArchiveName,
    badgeFileName,
    badgeFontSample,
    badgeToJpeg,
    drawStudentBadge,
    loadBadgeFonts,
    loadImage,
    saveBlob,
    type BadgeContent,
} from '@/lib/studentBadge';
import { cn } from '@/lib/utils';
import { createZip, type ZipEntry } from '@/lib/zip';
import { studentService, type Student } from '@/services/studentService';

/**
 * Bir arxivga sig'adigan bejiklar soni. Har bir JPG 300-400 KB va arxiv
 * brauzer xotirasida yig'iladi; guruh (20-30 talaba) va hatto oqim uchun
 * yetarli, butun universitet ro'yxati uchun esa filtr kerak.
 */
const MAX_BADGES = 300;
const LIST_PAGE_SIZE = 100;
/** HEMIS surati sekin kelishi mumkin — bir nechta talaba parallel ishlanadi. */
const CONCURRENCY = 4;

interface StudentBadgesDownloadButtonProps {
    /** Ro'yxatdagi joriy filtrlar: arxivga aynan shu talabalar tushadi. */
    search?: string;
    groupId?: number;
    /** Arxiv nomi uchun: `Bejiklar_25A_26_TVM.zip`. */
    groupName?: string;
    /** Filtrga mos talabalar soni (sahifadagi emas, jami). */
    total: number;
    className?: string;
}

interface Rendered {
    entry: ZipEntry;
    /** Surati bor edi, lekin olib bo'lmadi — bejik standart rasm bilan chiqdi. */
    photoFailed: boolean;
}

const renderBadge = async (
    canvas: HTMLCanvasElement,
    studentId: number,
    logo: HTMLImageElement | null,
): Promise<Rendered> => {
    const badge = await studentService.getBadge(studentId);
    const content: BadgeContent = {
        fullName: badge.full_name,
        faculty: badge.faculty,
        groupName: badge.group_name,
        studentIdNumber: badge.student_id_number,
        universityName: BRAND.universityName,
        universityShortName: BRAND.shortName,
    };

    let photo: HTMLImageElement | null = null;
    let objectUrl: string | null = null;
    try {
        if (badge.has_photo) {
            photo = await studentService
                .getBadgePhoto(studentId)
                .then((blob) => loadImage((objectUrl = URL.createObjectURL(blob))))
                .catch(() => null);
        }
        await loadBadgeFonts(badgeFontSample(content));
        drawStudentBadge(canvas, content, { logo, photo });
        return {
            entry: {
                name: badgeFileName(badge.full_name, badge.student_id_number, badge.student_id),
                blob: await badgeToJpeg(canvas),
            },
            photoFailed: badge.has_photo && photo === null,
        };
    } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
};

/**
 * «Bejiklarni yuklab olish» — talabalar ro'yxati ustida, faqat admin
 * ko'rinishida. Joriy filtrga mos barcha talabalarning bejiklari bitta ZIP
 * arxivga yig'iladi; chizma yakka bejik bilan bir xil (`drawStudentBadge`).
 *
 * Tugmani yashirish qulaylik uchun, himoya emas: bejik endpointlari rolni
 * backendda o'zi tekshiradi (`AdminRequired`).
 */
export const StudentBadgesDownloadButton = ({
    search,
    groupId,
    groupName,
    total,
    className,
}: StudentBadgesDownloadButtonProps) => {
    const { t } = useTranslation();
    const { isAdmin } = useRoleView();
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    // Sahifadan chiqib ketilsa, qolgan so'rovlar yuborilmaydi.
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;
        return () => {
            cancelledRef.current = true;
        };
    }, []);

    if (!isAdmin) return null;

    const loadStudents = async (): Promise<Student[]> => {
        const students: Student[] = [];
        for (let page = 1; ; page++) {
            const data = await studentService.getStudents(page, LIST_PAGE_SIZE, search || undefined, undefined, groupId, {
                sort_by: 'name',
                order: 'asc',
            });
            students.push(...data.students);
            if (data.students.length === 0 || students.length >= data.total) return students;
        }
    };

    const handleDownload = async () => {
        if (total > MAX_BADGES) {
            toast.error(
                t("Bir yo'la eng ko'pi {{max}} ta bejik yuklab olinadi — avval guruhni tanlang.", { max: MAX_BADGES }),
            );
            return;
        }

        setProgress({ done: 0, total });
        try {
            const students = await loadStudents();
            if (cancelledRef.current) return;
            if (students.length === 0) {
                toast.error(t('Talabalar topilmadi'));
                return;
            }
            // Ro'yxat ochilgandan beri o'zgargan bo'lishi mumkin.
            if (students.length > MAX_BADGES) {
                toast.error(
                    t("Bir yo'la eng ko'pi {{max}} ta bejik yuklab olinadi — avval guruhni tanlang.", {
                        max: MAX_BADGES,
                    }),
                );
                return;
            }
            setProgress({ done: 0, total: students.length });

            const logo = await loadImage(logoUrl).catch(() => null);
            // Arxivdagi tartib ro'yxatdagi bilan bir xil: natija o'z o'rniga yoziladi.
            const rendered: (Rendered | null)[] = new Array(students.length).fill(null);
            let next = 0;
            let done = 0;
            let forbidden = false;

            const worker = async () => {
                // Har bir ishchiga o'z canvas'i: chizish va JPG ga o'tkazish
                // orasida boshqasi ustidan chizib yubormasin.
                const canvas = document.createElement('canvas');
                while (!cancelledRef.current && !forbidden) {
                    const index = next++;
                    if (index >= students.length) return;
                    try {
                        rendered[index] = await renderBadge(canvas, students[index].id, logo);
                    } catch (error) {
                        if (isAxiosError(error) && error.response?.status === 403) forbidden = true;
                    }
                    done += 1;
                    if (!cancelledRef.current) setProgress({ done, total: students.length });
                }
            };
            await Promise.all(Array.from({ length: Math.min(CONCURRENCY, students.length) }, worker));
            if (cancelledRef.current) return;

            if (forbidden) {
                toast.error(t('Bejik yaratish faqat administratorga ruxsat etilgan.'));
                return;
            }

            const ready = rendered.filter((item): item is Rendered => item !== null);
            if (ready.length === 0) {
                toast.error(t("Bejiklarni yaratib bo'lmadi"));
                return;
            }

            const archive = await createZip(ready.map((item) => item.entry));
            saveBlob(archive, badgeArchiveName(groupName));

            const failed = students.length - ready.length;
            const withoutPhoto = ready.filter((item) => item.photoFailed).length;
            toast.success(t('{{count}} ta bejik ZIP arxivda yuklab olindi', { count: ready.length }));
            if (failed > 0) {
                toast.warning(t("{{count}} ta talabaning bejigini yaratib bo'lmadi", { count: failed }));
            }
            if (withoutPhoto > 0) {
                toast.warning(
                    t("{{count}} ta talabaning suratini yuklab bo'lmadi — bejikda standart rasm ishlatildi", {
                        count: withoutPhoto,
                    }),
                );
            }
        } catch {
            if (!cancelledRef.current) toast.error(t("Bejiklarni yaratib bo'lmadi"));
        } finally {
            if (!cancelledRef.current) setProgress(null);
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            className={cn('gap-1.5 font-semibold shadow-sm', className)}
            onClick={handleDownload}
            disabled={total === 0}
            isLoading={progress !== null}
            title={t("Ro'yxatdagi barcha talabalarning bejiklari — bitta ZIP arxivda")}
        >
            {progress === null && <Download className="h-4 w-4" />}
            <span>
                {progress === null
                    ? t('Bejiklarni yuklab olish')
                    : t('Bejiklar: {{done}} / {{total}}', progress)}
            </span>
        </Button>
    );
};

export default StudentBadgesDownloadButton;
