import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, FileUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useUploadQuestions, useDownloadQuestionsExcelTemplate } from '@/hooks/useQuestions';
import { useTranslation } from 'react-i18next';
import type { Subject } from '@/services/subjectService';
import { subjectOption } from '@/utils/subject';

/**
 * Oynada ko'rsatiladigan namuna. Ustun nomlari serverdagi shablon bilan bir
 * xil bo'lishi kerak (`question/excel_format.py::TEMPLATE_HEADERS`) — shuning
 * uchun ularni o'zgartirganda ikkala joyni ham yangilash kerak. Import
 * sarlavhalarni nomi bo'yicha taniydi, ya'ni tartib qat'iy emas, lekin
 * o'qituvchi ko'radigan namuna shablonga mos turgani yaxshi.
 */
const EXAMPLE_HEADERS = ['Savol', 'A variant', 'B variant', 'C variant', 'D variant', "To'g'ri javob"];
const EXAMPLE_ROW = ['2 + 2 nechaga teng?', '3', '4', '5', '6', 'B'];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    subjects: Subject[];
    defaultSubjectId?: number;
    /**
     * Fan qat'iy belgilangan (dars sahifasidan kelingan) — tanlash o'rniga
     * shunchaki ko'rsatiladi, aks holda o'qituvchi savollarni tasodifan
     * boshqa fanga yuklab yuborishi mumkin.
     */
    lockSubject?: boolean;
    /** Fan nomi ma'lum bo'lsa (dars javobidan) — ro'yxatdan izlanmaydi. */
    subjectName?: string;
    /**
     * Dars sahifasidan kelingan boʻlsa — yuklangan savollar oʻsha darsga
     * biriktiriladi. Dars testi aynan shu savollardan yigʻiladi.
     */
    lessonId?: number;
}

export const QuestionExcelUploadModal = ({
    isOpen,
    onClose,
    onSuccess,
    subjects,
    defaultSubjectId,
    lockSubject = false,
    subjectName,
    lessonId,
}: Props) => {
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ? String(defaultSubjectId) : '');
    const uploadMutation = useUploadQuestions();
    const templateMutation = useDownloadQuestionsExcelTemplate();
    const { t } = useTranslation();

    useEffect(() => {
        setSubjectId(defaultSubjectId ? String(defaultSubjectId) : '');
    }, [defaultSubjectId]);

    useEffect(() => {
        if (!isOpen) setFile(null);
    }, [isOpen]);

    const handleUpload = () => {
        if (!file || !subjectId) return;
        uploadMutation.mutate({ file, subject_id: parseInt(subjectId, 10), lesson_id: lessonId }, {
            onSuccess: (data: { questions?: unknown[]; warnings?: string[] }) => {
                const imported = data?.questions?.length ?? 0;
                toast.success(imported ? `${imported} ta savol import qilindi` : 'Savollar import qilindi');
                // Ogohlantirishlar jimgina yo'qolmasin: bir nechta qator o'tkazib
                // yuborilgan bo'lsa, o'qituvchi buni bilishi kerak.
                for (const warning of data?.warnings ?? []) toast.warning(warning);
                setFile(null);
                onSuccess?.();
                onClose();
            },
            onError: () => toast.error('Faylni yuklashda xatolik yuz berdi'),
        });
    };

    const resolvedName =
        subjectName ?? subjects.find((s) => String(s.id) === subjectId)?.name ?? (subjectId ? `#${subjectId}` : '');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Excel dan savollar import qilish">
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Fan</label>
                    {lockSubject ? (
                        <p className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm">
                            {resolvedName || 'Fan aniqlanmadi'}
                        </p>
                    ) : (
                        <Combobox
                            options={subjects.map(subjectOption)}
                            value={subjectId}
                            onChange={setSubjectId}
                            placeholder="Fan tanlang"
                            searchPlaceholder="Fanni qidirish..."
                        />
                    )}
                </div>

                {/* Format hech qayerda yozilmagan edi: o'qituvchi faylni qanday
                    yig'ishni taxmin qilardi. Namuna oynada turadi, to'liq
                    shablonni esa serverdan yuklab olsa bo'ladi. */}
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{t('Fayl qanday ko\'rinishi kerak')}</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            isLoading={templateMutation.isPending}
                            onClick={() =>
                                templateMutation.mutate(undefined, {
                                    onError: () => toast.error(t('Shablonni yuklab bo\'lmadi')),
                                })
                            }
                        >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            {t('Shablonni yuklab olish')}
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    {EXAMPLE_HEADERS.map((header) => (
                                        <th
                                            key={header}
                                            className="whitespace-nowrap border border-border bg-muted px-2 py-1.5 text-left font-medium"
                                        >
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    {EXAMPLE_ROW.map((value, index) => (
                                        <td
                                            key={EXAMPLE_HEADERS[index]}
                                            className="whitespace-nowrap border border-border px-2 py-1.5 text-muted-foreground"
                                        >
                                            {value}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t("Birinchi qator — sarlavhalar. «To'g'ri javob» ustuniga faqat A, B, C yoki D harfi yoziladi.")}
                    </p>
                </div>

                {/* Nativ `<input type="file">` brauzer tilida «Choose File / No
                    file chosen» deb yozadi: u tarjima qilinmaydi va qolgan
                    tugmalardan boshqacha ko'rinadi. Shuning uchun input
                    yashirin, ko'rinadigan qismi — o'z tugmamiz. */}
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-10 transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <FileUp className="mb-4 h-10 w-10 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                        {file ? file.name : 'Excel fayl tanlash'}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                        {file ? "Boshqa fayl tanlash uchun bosing" : '.xlsx yoki .xls'}
                    </span>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                />

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button onClick={handleUpload} isLoading={uploadMutation.isPending} disabled={!file || !subjectId}>
                        Yuklash
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
