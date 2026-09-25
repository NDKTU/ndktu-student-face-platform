import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCreateLesson, useUpdateLesson } from '@/hooks/useLessons';
import type { Course } from '@/services/courseService';
import { courseTypeLabel } from '@/services/courseTypes';
import type { Lesson } from '@/services/lessonService';
import { apiErrorMessage } from '@/utils/apiError';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    course: Course;
    /** Berilgan bo'lsa — oyna tahrirlash rejimida ochiladi. */
    lesson?: Lesson | null;
}

export function CourseLessonModal({ isOpen, onClose, course, lesson }: Props) {
    const createLesson = useCreateLesson();
    const updateLesson = useUpdateLesson();
    const isEditing = Boolean(lesson);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setTitle(lesson?.topic ?? '');
        setDescription(lesson?.description ?? '');
        setError('');
    }, [isOpen, lesson]);

    const submit = async () => {
        if (!title.trim()) {
            setError("Dars nomini kiriting");
            return;
        }

        setSaving(true);
        setError('');
        try {
            if (lesson) {
                // Tahrirlashda faqat nomi o'zgaradi: video, Zoom, resurslar va
                // uy vazifasi dars sahifasida boshqariladi. Tavsif yuborilmaydi —
                // bekend yuborilmagan maydonga tegmaydi.
                await updateLesson.mutateAsync({ id: lesson.id, data: { topic: title.trim() } });
            } else {
                // Guruh so'ralmaydi: bo'sh `group_id` bekendda «kursning barcha
                // guruhlari» degani.
                await createLesson.mutateAsync({
                    course_id: course.id,
                    topic: title.trim(),
                    description: description.trim() || null,
                });
            }
            onClose();
        } catch (cause) {
            setError(apiErrorMessage(cause, 'Darsni saqlashda xatolik yuz berdi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Darsni tahrirlash" : "Yangi dars"} className="max-w-2xl">
            <div className="space-y-5">
                {!isEditing && courseTypeLabel(course.course_type) && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Mashg'ulot turi:</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {courseTypeLabel(course.course_type)}
                        </span>
                        <span className="text-xs text-muted-foreground">kursdan olinadi</span>
                    </div>
                )}
                <div>
                    <label className="mb-2 block text-sm font-medium">Dars nomi</label>
                    <Input
                        autoFocus
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !saving) void submit();
                        }}
                        placeholder="Masalan, Nazariy kirish"
                    />
                </div>

                {/* Yangi darsda faqat nomi va tavsifi so'raladi: video, resurs, uy
                    vazifasi va testlar dars sahifasida qo'shiladi. */}
                {!isEditing && (
                    <>
                        <div>
                            <label className="mb-2 block text-sm font-medium">Tavsif <span className="font-normal text-muted-foreground">(ixtiyoriy)</span></label>
                            <textarea
                                className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                placeholder="Dars mazmuni haqida qisqacha"
                            />
                        </div>
                        <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            Video, Zoom havolasi, resurslar, uy vazifasi va testlar dars yaratilgandan
                            keyin uning sahifasida qo'shiladi.
                        </p>
                    </>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}
                {/* `-mx-6` chiziqni modal chetigacha yetkazadi, lekin pastdan
                    `-mb-4` qo'yilmaydi: u modalning o'z `py-4` ini bekor qilib,
                    tugmalarni oynaning tubiga yopishtirib qo'yardi. */}
                <div className="-mx-6 flex justify-end gap-2 border-t border-border/60 px-6 pt-4">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Bekor qilish</Button>
                    <Button onClick={() => void submit()} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Saqlash
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
