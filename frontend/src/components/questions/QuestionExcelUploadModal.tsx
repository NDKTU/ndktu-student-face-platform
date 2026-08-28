import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useUploadQuestions } from '@/hooks/useQuestions';
import type { Subject } from '@/services/subjectService';

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
}

export const QuestionExcelUploadModal = ({
    isOpen,
    onClose,
    onSuccess,
    subjects,
    defaultSubjectId,
    lockSubject = false,
    subjectName,
}: Props) => {
    const [file, setFile] = useState<File | null>(null);
    const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ? String(defaultSubjectId) : '');
    const uploadMutation = useUploadQuestions();

    useEffect(() => {
        setSubjectId(defaultSubjectId ? String(defaultSubjectId) : '');
    }, [defaultSubjectId]);

    useEffect(() => {
        if (!isOpen) setFile(null);
    }, [isOpen]);

    const handleUpload = () => {
        if (!file || !subjectId) return;
        uploadMutation.mutate({ file, subject_id: parseInt(subjectId, 10) }, {
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
                            options={subjects.map((s) => ({ value: String(s.id), label: s.name }))}
                            value={subjectId}
                            onChange={setSubjectId}
                            placeholder="Fan tanlang"
                            searchPlaceholder="Fanni qidirish..."
                        />
                    )}
                </div>

                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-10">
                    <FileUp className="mb-4 h-10 w-10 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">Excel fayl (.xlsx) tanlang</p>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/15"
                    />
                </div>

                {file && (
                    <div className="text-sm">
                        Tanlangan fayl: <span className="font-medium">{file.name}</span>
                    </div>
                )}

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
