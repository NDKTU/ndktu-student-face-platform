import { useEffect, useState } from 'react';
import { ClipboardList, FilePlus2, Loader2, Youtube } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useCreateLesson, useUpdateLesson } from '@/hooks/useLessons';
import { resourceService } from '@/services/resourceService';
import { assignmentService } from '@/services/assignmentService';
import type { Course } from '@/services/courseService';
import type { Lesson } from '@/services/lessonService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    course: Course;
    topicId?: number;
    /** Berilgan bo'lsa — oyna tahrirlash rejimida ochiladi. */
    lesson?: Lesson | null;
}

export function CourseLessonModal({ isOpen, onClose, course, topicId, lesson }: Props) {
    const createLesson = useCreateLesson();
    const updateLesson = useUpdateLesson();
    const isEditing = Boolean(lesson);
    // Группа берётся у курса. Выбор остаётся только для курса с несколькими
    // группами — там подставить её автоматически нельзя.
    const needsGroupChoice = course.groups.length > 1;
    const [groupId, setGroupId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [showResources, setShowResources] = useState(false);
    const [script, setScript] = useState('');
    const [extraFiles, setExtraFiles] = useState<File[]>([]);
    const [extraUrl, setExtraUrl] = useState('');
    const [extraUrlTitle, setExtraUrlTitle] = useState('');
    const [showHomework, setShowHomework] = useState(false);
    const [homeworkTitle, setHomeworkTitle] = useState('');
    const [homeworkDescription, setHomeworkDescription] = useState('');
    const [homeworkDeadline, setHomeworkDeadline] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setGroupId(
            lesson?.group_id
                ? String(lesson.group_id)
                : course.groups.length === 1 ? String(course.groups[0].id) : '',
        );
        setTitle(lesson?.topic ?? '');
        setDescription(lesson?.description ?? '');
        setYoutubeUrl(lesson?.resources?.find((r) => r.resource_type === 'video')?.link_url ?? '');
        setShowResources(false);
        setScript('');
        setExtraFiles([]);
        setExtraUrl('');
        setExtraUrlTitle('');
        setShowHomework(false);
        setHomeworkTitle('');
        setHomeworkDescription('');
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);
        setHomeworkDeadline(deadline.toISOString().slice(0, 16));
        setError('');
    }, [isOpen, course.groups, lesson]);

    const submit = async () => {
        if (!title.trim()) {
            setError("Dars nomini kiriting");
            return;
        }
        if (needsGroupChoice && !groupId) {
            setError('Guruhni tanlang');
            return;
        }
        if (!youtubeUrl.trim()) {
            setError('YouTube havolasini kiriting');
            return;
        }
        if (showHomework && homeworkTitle.trim() && !homeworkDeadline) {
            setError("Uy vazifasi uchun topshirish muddatini kiriting");
            return;
        }

        setSaving(true);
        setError('');
        try {
            if (lesson) {
                await updateLesson.mutateAsync({
                    id: lesson.id,
                    data: {
                        topic: title.trim(),
                        description: description.trim() || null,
                        group_id: groupId ? Number(groupId) : undefined,
                    },
                });
                const video = lesson.resources?.find((r) => r.resource_type === 'video');
                if (video && video.link_url !== youtubeUrl.trim()) {
                    // Resurs yangilash yo'li yo'q — eskisini o'chirib, yangisini yozamiz.
                    await resourceService.delete(video.id);
                }
                if (!video || video.link_url !== youtubeUrl.trim()) {
                    await resourceService.create({
                        lesson_id: lesson.id,
                        resource_type: 'video',
                        title: title.trim(),
                        link_url: youtubeUrl.trim(),
                    });
                }
                onClose();
                return;
            }

            const created = await createLesson.mutateAsync({
                course_id: course.id,
                group_id: groupId ? Number(groupId) : undefined,
                topic_id: topicId,
                topic: title.trim(),
                description: description.trim() || null,
            });

            await resourceService.create({
                lesson_id: created.id,
                resource_type: 'video',
                title: title.trim(),
                link_url: youtubeUrl.trim(),
            });

            if (showResources && script.trim()) {
                await resourceService.create({
                    lesson_id: created.id,
                    resource_type: 'text',
                    title: 'Dars skripti',
                    text_content: script.trim(),
                });
            }
            if (showResources) {
                for (const file of extraFiles) {
                    const { url } = await resourceService.upload(file);
                    await resourceService.create({
                        lesson_id: created.id,
                        resource_type: 'file',
                        title: file.name,
                        file_url: url,
                    });
                }
                if (extraUrl.trim()) {
                    await resourceService.create({
                        lesson_id: created.id,
                        resource_type: 'link',
                        title: extraUrlTitle.trim() || "Qo'shimcha manba",
                        link_url: extraUrl.trim(),
                    });
                }
            }
            if (showHomework && homeworkTitle.trim()) {
                await assignmentService.create({
                    course_id: course.id,
                    lesson_id: created.id,
                    title: homeworkTitle.trim(),
                    description: homeworkDescription.trim() || null,
                    deadline: new Date(homeworkDeadline).toISOString(),
                });
            }
            onClose();
        } catch (cause) {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || 'Darsni saqlashda xatolik yuz berdi');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Darsni tahrirlash" : "Yangi dars"} className="max-w-2xl">
            <div className="space-y-5">
                <div>
                    <label className="mb-2 block text-sm font-medium">Dars nomi</label>
                    <Input
                        autoFocus
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Masalan, Nazariy kirish"
                    />
                </div>

                <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Youtube className="h-4 w-4 text-red-600" /> Video (YouTube havolasi)
                    </label>
                    <Input
                        value={youtubeUrl}
                        onChange={(event) => setYoutubeUrl(event.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">Video fayl yuklab bo'lmaydi — faqat YouTube havolasi qabul qilinadi.</p>
                </div>

                {needsGroupChoice && (
                    <div>
                        <label className="mb-2 block text-sm font-medium">Guruh</label>
                        <Combobox
                            options={course.groups.map((group) => ({ value: String(group.id), label: group.name }))}
                            value={groupId}
                            onChange={setGroupId}
                            placeholder="Guruhni tanlang"
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">Bu kurs bir nechta guruhga biriktirilgan — darsni qaysi guruhga qo'shishni tanlang.</p>
                    </div>
                )}

                <div>
                    <label className="mb-2 block text-sm font-medium">Tavsif <span className="font-normal text-muted-foreground">(ixtiyoriy)</span></label>
                    <textarea
                        className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Dars mazmuni haqida qisqacha"
                    />
                </div>

                {!isEditing && (
                <section className="rounded-xl border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold">Resurslar</p>
                            <p className="text-xs text-muted-foreground">Skript, kitob, hujjat yoki tashqi havola</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowResources((value) => !value)}>
                            <FilePlus2 className="h-4 w-4" /> {showResources ? 'Yopish' : "Resurs qo'shish"}
                        </Button>
                    </div>
                    {showResources && (
                        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                            <textarea
                                className="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={script}
                                onChange={(event) => setScript(event.target.value)}
                                placeholder="Dars skripti yoki konspekti (ixtiyoriy)"
                            />
                            <div>
                                <label className="mb-2 block text-xs font-medium text-muted-foreground">Hujjat yoki kitob yuklash</label>
                                <Input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                    onChange={(event) => setExtraFiles(Array.from(event.target.files ?? []))}
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Input value={extraUrl} onChange={(event) => setExtraUrl(event.target.value)} placeholder="https://..." />
                                <Input value={extraUrlTitle} onChange={(event) => setExtraUrlTitle(event.target.value)} placeholder="Havola nomi" />
                            </div>
                        </div>
                    )}
                </section>
                )}

                {!isEditing && (
                <section className="rounded-xl border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold">Uy vazifasi</p>
                            <p className="text-xs text-muted-foreground">Kerak bo'lsa darsga vazifa biriktiring</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowHomework((value) => !value)}>
                            <ClipboardList className="h-4 w-4" /> {showHomework ? 'Yopish' : "Uy vazifasi qo'shish"}
                        </Button>
                    </div>
                    {showHomework && (
                        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                            <Input value={homeworkTitle} onChange={(event) => setHomeworkTitle(event.target.value)} placeholder="Uy vazifasi sarlavhasi" />
                            <textarea
                                className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={homeworkDescription}
                                onChange={(event) => setHomeworkDescription(event.target.value)}
                                placeholder="Vazifa tavsifi"
                            />
                            <div>
                                <label className="mb-2 block text-xs font-medium text-muted-foreground">Topshirish muddati</label>
                                <Input type="datetime-local" value={homeworkDeadline} onChange={(event) => setHomeworkDeadline(event.target.value)} />
                            </div>
                        </div>
                    )}
                </section>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-border/60 px-6 pt-4">
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
