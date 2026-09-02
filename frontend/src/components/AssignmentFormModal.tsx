import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { FileSourceField } from '@/components/file/FileSourceField';
import { Input } from '@/components/ui/Input';
import { FileText, Loader2, X } from 'lucide-react';
import { useCreateAssignment, useUpdateAssignment } from '@/hooks/useAssignments';
import { resourceService } from '@/services/resourceService';
import type { Assignment, SubmissionFile } from '@/services/assignmentService';

/** Vazifa uchun ruxsat etilgan fayl turlari — `CourseLessonModal` bilan bir xil. */
const FILE_TYPE_OPTIONS = [
    { value: 'pdf', label: 'PDF' },
    { value: 'doc,docx', label: 'Word' },
    { value: 'xls,xlsx', label: 'Excel' },
    { value: 'ppt,pptx', label: 'PowerPoint' },
    { value: 'jpg,jpeg,png', label: 'Rasm' },
    { value: 'zip,rar', label: 'Arxiv' },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    courseId: number;
    lessonId?: number | null;
    editing?: Assignment | null;
}

export const AssignmentFormModal = ({
    isOpen,
    onClose,
    courseId,
    lessonId,
    editing,
}: Props) => {
    const createMut = useCreateAssignment();
    const updateMut = useUpdateAssignment();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [allowFile, setAllowFile] = useState(true);
    const [allowText, setAllowText] = useState(true);
    const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
    // Saqlangan ilovalar (tahrirlashda) va yangi tanlanganlar alohida turadi:
    // birinchisi allaqachon serverda, ikkinchisi saqlashda yuklanadi.
    const [attachments, setAttachments] = useState<SubmissionFile[]>([]);
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            setTitle(editing.title);
            setDescription(editing.description ?? '');
            setDeadline(editing.deadline.slice(0, 16));
            setAllowFile(editing.allow_file);
            setAllowText(editing.allow_text);
            setAllowedTypes(editing.allowed_file_types ?? []);
            setAttachments(editing.attachments ?? []);
        } else {
            const future = new Date();
            future.setDate(future.getDate() + 7);
            setTitle('');
            setDescription('');
            setDeadline(future.toISOString().slice(0, 16));
            setAllowFile(true);
            setAllowText(true);
            setAllowedTypes([]);
            setAttachments([]);
        }
        setNewFiles([]);
        setError('');
    }, [isOpen, editing]);

    const handleSubmit = async () => {
        // Sarlavha ixtiyoriy: bo'sh qolsa, bekend dars mavzusini nom qilib qo'yadi.
        if (!deadline) {
            setError("Topshirish muddatini kiriting");
            return;
        }
        if (!allowFile && !allowText) {
            setError("Talaba qanday topshirishini tanlang: fayl yoki matn");
            return;
        }

        setError('');
        setUploading(true);
        try {
            const uploaded: SubmissionFile[] = [];
            for (const file of newFiles) {
                const { url } = await resourceService.upload(file);
                uploaded.push({ name: file.name, url, size: file.size, type: file.type });
            }
            const base = {
                title: title.trim() || undefined,
                description: description.trim() || null,
                deadline: new Date(deadline).toISOString(),
                // Baholash 5 ballik tizimda — o'qituvchi sozlamaydi.
                max_grade: 5,
                allow_file: allowFile,
                allow_text: allowText,
                allowed_file_types: allowFile ? allowedTypes : [],
                attachments: [...attachments, ...uploaded],
            };
            if (editing) {
                await updateMut.mutateAsync({ id: editing.id, data: { ...base, lesson_id: lessonId } });
            } else {
                await createMut.mutateAsync({ ...base, course_id: courseId, lesson_id: lessonId });
            }
            onClose();
        } catch (cause) {
            // Bekend 409 bilan «bu darsda vazifa bor» deyishi mumkin — shu matn ko'rsatiladi.
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || 'Vazifani saqlashda xatolik yuz berdi');
        } finally {
            setUploading(false);
        }
    };

    const isPending = createMut.isPending || updateMut.isPending || uploading;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editing ? 'Uy vazifasini tahrirlash' : 'Uy vazifasi'}
            className="max-w-2xl"
        >
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-sm font-medium">Sarlavha <span className="font-normal text-muted-foreground">(ixtiyoriy)</span></label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Uy vazifasi sarlavhasi" />
                    <p className="mt-1 text-xs text-muted-foreground">Bo'sh qoldirsangiz, dars mavzusi nom bo'lib qo'yiladi.</p>
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium">Tavsif</label>
                    <textarea
                        className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Vazifa tavsifi"
                    />
                </div>

                <div>
                    {/* Shart, namuna yoki tarqatma material — talaba yuklab oladi.
                        Ikkala manba ham teng koʻrinadi: qurilma va kutubxona. */}
                    <FileSourceField
                        label="Vazifa fayllari"
                        multiple
                        deviceHint="Shart, namuna yoki tarqatma material"
                        onFiles={(picked) => setNewFiles((prev) => [...prev, ...picked])}
                        onPickLibrary={() => setIsPickerOpen(true)}
                    />
                    {(attachments.length > 0 || newFiles.length > 0) && (
                        <ul className="mt-2 space-y-1.5">
                            {attachments.map((file, index) => (
                                <li key={file.url} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                                    {file.size != null && (
                                        <span className="shrink-0 text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Faylni olib tashlash"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </li>
                            ))}
                            {newFiles.map((file, index) => (
                                <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                                    <span className="shrink-0 text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Faylni olib tashlash"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div>
                    <label className="mb-2 block text-xs font-medium text-muted-foreground">Talaba qanday topshiradi</label>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={allowFile}
                                onChange={(e) => setAllowFile(e.target.checked)}
                                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            Fayl yuklaydi
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={allowText}
                                onChange={(e) => setAllowText(e.target.checked)}
                                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            Matn yozadi
                        </label>
                    </div>
                    {allowFile && (
                        <div className="mt-3">
                            <p className="mb-2 text-xs text-muted-foreground">
                                Qabul qilinadigan fayl turlari — hech biri tanlanmasa, cheklov qo'yilmaydi.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {FILE_TYPE_OPTIONS.map((option) => {
                                    const active = allowedTypes.includes(option.value);
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() =>
                                                setAllowedTypes((prev) =>
                                                    active ? prev.filter((v) => v !== option.value) : [...prev, option.value])
                                            }
                                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                                                active
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border text-muted-foreground hover:border-primary/40'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div>
                    <label className="mb-2 block text-xs font-medium text-muted-foreground">Topshirish muddati</label>
                    <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">Baholash 5 ballik tizimda: 1–5.</p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Bekor qilish
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editing ? 'Saqlash' : "Qo'shish"}
                    </Button>
                </div>
            </div>

            <FilePickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelect={(files) =>
                    setAttachments((prev) => [
                        ...prev,
                        // Kutubxonadagi fayl allaqachon serverda — qayta
                        // yuklanmaydi, faqat havolasi qoʻshiladi.
                        ...files
                            .filter((file) => !prev.some((item) => item.url === file.url))
                            .map((file) => ({
                                name: file.title,
                                url: file.url,
                                size: file.size_bytes,
                                type: file.mime_type ?? undefined,
                            })),
                    ])
                }
            />
        </Modal>
    );
};
