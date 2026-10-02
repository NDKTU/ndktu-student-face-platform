import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { FileSourceField } from '@/components/file/FileSourceField';
import { resourceService } from '@/services/resourceService';
import type { SubmissionFile } from '@/services/assignmentService';
import type { IndependentTopic, IndependentTopicRequest } from '@/services/independentTopicService';
import { formatSize } from '@/utils/fileSize';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Berilgan bo'lsa — tahrirlash rejimi. */
    topic: IndependentTopic | null;
    isSubmitting: boolean;
    onSubmit: (values: IndependentTopicRequest) => void;
}

/**
 * Mustaqil ish mavzusi oynasi.
 *
 * Nom, ixtiyoriy izoh va materiallar. Muddat va baho yo'q — bu
 * sillabusdagi mavzular ro'yxati, topshiriladigan vazifa emas;
 * topshirish kerak bo'lsa, o'sha mavzuga uy vazifasi beriladi.
 *
 * Materiallar uy vazifasidagi kabi biriktiriladi: o'qituvchi faylni
 * platforma kutubxonasidan tanlaydi (bir ma'ruzani har kursga qayta
 * yuklash shart emas), qurilmadan yuklash esa rol ruxsat bergan joyda.
 */
export const IndependentTopicModal = ({ isOpen, onClose, topic, isSubmitting, onSubmit }: Props) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    // Saqlangan/kutubxonadan tanlangan fayllar va qurilmadan yangi
    // tanlanganlar alohida: ikkinchisi saqlashda yuklanadi.
    const [attachments, setAttachments] = useState<SubmissionFile[]>([]);
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [titleError, setTitleError] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setTitle(topic?.title ?? '');
        setDescription(topic?.description ?? '');
        setAttachments(topic?.attachments ?? []);
        setNewFiles([]);
        setTitleError('');
        setError('');
    }, [isOpen, topic]);

    const handleSubmit = async () => {
        const trimmed = title.trim();
        if (!trimmed) {
            setTitleError('Mavzu nomi kiritilishi shart');
            return;
        }
        setTitleError('');
        setError('');
        setUploading(true);
        try {
            const uploaded: SubmissionFile[] = [];
            for (const file of newFiles) {
                const { url } = await resourceService.upload(file);
                uploaded.push({ name: file.name, url, size: file.size, type: file.type });
            }
            onSubmit({
                title: trimmed,
                description: description.trim() || null,
                attachments: [...attachments, ...uploaded],
            });
        } catch {
            setError('Faylni yuklab bo‘lmadi');
        } finally {
            setUploading(false);
        }
    };

    const isBusy = uploading || isSubmitting;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={topic ? 'Mavzuni tahrirlash' : "Mustaqil ish mavzusi"}
        >
            <div className="space-y-4">
                <Input
                    label="Mavzu nomi"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Masalan: Operatsion tizimlar tarixi"
                    error={titleError || undefined}
                />

                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="independent-topic-description">
                        Izoh (ixtiyoriy)
                    </label>
                    <textarea
                        id="independent-topic-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Nimaga e'tibor berish, qanday manbalardan foydalanish..."
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <FileSourceField
                    label="Materiallar (ixtiyoriy)"
                    multiple
                    deviceHint="Ma'ruza, qo'llanma yoki tarqatma material"
                    onFiles={(picked) => setNewFiles((prev) => [...prev, ...picked])}
                    onPickLibrary={() => setIsPickerOpen(true)}
                >
                    {(attachments.length > 0 || newFiles.length > 0) && (
                        <ul className="mt-3 space-y-2">
                            {attachments.map((file, index) => (
                                <li key={file.url} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                                    {file.size != null && (
                                        <span className="shrink-0 text-[11px] text-muted-foreground">{formatSize(file.size)}</span>
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
                                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatSize(file.size)}</span>
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
                </FileSourceField>

                {error && (
                    <p role="alert" className="text-sm text-destructive">{error}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
                        Bekor qilish
                    </Button>
                    <Button type="button" onClick={() => void handleSubmit()} isLoading={isBusy}>
                        {topic ? 'Saqlash' : "Qo'shish"}
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
