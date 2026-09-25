import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { FileSourceField } from '@/components/file/FileSourceField';
import { Input } from '@/components/ui/Input';
import { CalendarClock, ClipboardList, FileText, Info, Loader2, X } from 'lucide-react';
import { useCreateAssignment, useUpdateAssignment } from '@/hooks/useAssignments';
import { resourceService } from '@/services/resourceService';
import type { Assignment, SubmissionFile } from '@/services/assignmentService';
import { DeadlinePicker } from '@/components/homework/DeadlinePicker';
import { toLocalInput } from '@/components/announcement/labels';

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
            setDeadline(toLocalInput(editing.deadline));
            setAttachments(editing.attachments ?? []);
        } else {
            const future = new Date();
            future.setDate(future.getDate() + 7);
            setTitle('');
            setDescription('');
            setDeadline(toLocalInput(future.toISOString()));
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
        if (!Number.isFinite(new Date(deadline).getTime()) ||
            (new Date(deadline).getTime() <= Date.now() && (!editing || deadline !== toLocalInput(editing.deadline)))) {
            setError('Topshirish muddati kelajakda bo‘lishi kerak');
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
            className="md:max-w-2xl"
        >
            <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/[0.055] p-4">
                    <span className="rounded-xl bg-primary/10 p-2 text-primary"><ClipboardList className="h-5 w-5" /></span>
                    <div>
                        <p className="text-sm font-semibold">{editing ? 'Vazifa ma’lumotlarini yangilang' : 'Yangi vazifani tayyorlang'}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Talaba javobni bitta PDF yoki rasm fayl sifatida topshiradi. Baholash 5 ballik tizimda.</p>
                    </div>
                </div>
                <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                    <div>
                        <label htmlFor="homework-title" className="mb-1.5 block text-sm font-semibold">Sarlavha <span className="font-normal text-muted-foreground">(ixtiyoriy)</span></label>
                        <Input id="homework-title" className="h-11 rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan, 1-topshiriq" />
                        <p className="mt-1.5 text-xs text-muted-foreground">Bo‘sh qoldirsangiz, dars mavzusi nom bo‘lib qo‘yiladi.</p>
                    </div>
                    <div>
                        <label htmlFor="homework-description" className="mb-1.5 block text-sm font-semibold">Tavsif</label>
                        <textarea id="homework-description"
                            className="min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Talaba bajarishi kerak bo‘lgan vazifani yozing..."
                        />
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                    {/* Shart, namuna yoki tarqatma material — talaba yuklab oladi.
                        Manbani rol hal qiladi: oʻqituvchi faqat kutubxonadan tanlaydi. */}
                    <FileSourceField
                        label="Vazifa fayllari"
                        multiple
                        deviceHint="Shart, namuna yoki tarqatma material"
                        onFiles={(picked) => setNewFiles((prev) => [...prev, ...picked])}
                        onPickLibrary={() => setIsPickerOpen(true)}
                    />
                    {(attachments.length > 0 || newFiles.length > 0) && (
                        <ul className="mt-3 space-y-2">
                            {attachments.map((file, index) => (
                                <li key={file.url} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
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
                                <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
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

                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                    <div className="mb-3 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold">Topshirish muddati</p>
                    </div>
                    <DeadlinePicker value={deadline} onChange={setDeadline} />
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Sana va vaqt mahalliy vaqt bo‘yicha ko‘rsatiladi.
                    </p>
                </div>

                {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
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
