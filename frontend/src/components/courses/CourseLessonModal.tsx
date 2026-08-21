import { useEffect, useState } from 'react';
import { ClipboardList, FilePlus2, Loader2, Upload, Youtube } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useCreateLesson } from '@/hooks/useLessons';
import { resourceService } from '@/services/resourceService';
import { assignmentService } from '@/services/assignmentService';
import type { Course } from '@/services/courseService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    course: Course;
    topicId?: number;
}

export function CourseLessonModal({ isOpen, onClose, course, topicId }: Props) {
    const createLesson = useCreateLesson();
    const [groupId, setGroupId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [duration, setDuration] = useState('15');
    const [videoType, setVideoType] = useState<'youtube' | 'upload'>('youtube');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
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
        setGroupId(course.groups[0]?.id.toString() ?? '');
        setTitle('');
        setDescription('');
        setDate(new Date().toISOString().slice(0, 10));
        setDuration('15');
        setVideoType('youtube');
        setYoutubeUrl('');
        setVideoFile(null);
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
    }, [isOpen, course.groups]);

    const submit = async () => {
        if (!title.trim() || !groupId || !date) {
            setError("Dars nomi, guruh va sana to'ldirilishi kerak");
            return;
        }
        if (videoType === 'youtube' && !youtubeUrl.trim()) {
            setError('YouTube havolasini kiriting');
            return;
        }
        if (videoType === 'upload' && !videoFile) {
            setError('Video faylni tanlang');
            return;
        }
        const durationMinutes = Number(duration);
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
            setError("Davomiylikni 1 dan 1440 daqiqagacha kiriting");
            return;
        }
        if (showHomework && homeworkTitle.trim() && !homeworkDeadline) {
            setError("Uy vazifasi uchun topshirish muddatini kiriting");
            return;
        }

        setSaving(true);
        setError('');
        try {
            const lesson = await createLesson.mutateAsync({
                course_id: course.id,
                group_id: Number(groupId),
                topic_id: topicId,
                topic: title.trim(),
                date,
                duration_minutes: durationMinutes,
                description: description.trim() || null,
            });

            if (videoType === 'youtube') {
                await resourceService.create({
                    lesson_id: lesson.id,
                    resource_type: 'video',
                    title: title.trim(),
                    link_url: youtubeUrl.trim(),
                });
            } else if (videoFile) {
                const { url } = await resourceService.upload(videoFile);
                await resourceService.create({
                    lesson_id: lesson.id,
                    resource_type: 'video',
                    title: videoFile.name,
                    file_url: url,
                });
            }

            if (showResources && script.trim()) {
                await resourceService.create({
                    lesson_id: lesson.id,
                    resource_type: 'text',
                    title: 'Dars skripti',
                    text_content: script.trim(),
                });
            }
            if (showResources) {
                for (const file of extraFiles) {
                    const { url } = await resourceService.upload(file);
                    await resourceService.create({
                        lesson_id: lesson.id,
                        resource_type: 'file',
                        title: file.name,
                        file_url: url,
                    });
                }
                if (extraUrl.trim()) {
                    await resourceService.create({
                        lesson_id: lesson.id,
                        resource_type: 'link',
                        title: extraUrlTitle.trim() || "Qo'shimcha manba",
                        link_url: extraUrl.trim(),
                    });
                }
            }
            if (showHomework && homeworkTitle.trim()) {
                await assignmentService.create({
                    course_id: course.id,
                    lesson_id: lesson.id,
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
        <Modal isOpen={isOpen} onClose={onClose} title="Yangi dars" className="max-w-2xl">
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
                    <label className="mb-2 block text-sm font-medium">Video manbasi</label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            type="button"
                            variant={videoType === 'youtube' ? 'primary' : 'outline'}
                            onClick={() => setVideoType('youtube')}
                        >
                            <Youtube className="h-4 w-4" /> YouTube havola
                        </Button>
                        <Button
                            type="button"
                            variant={videoType === 'upload' ? 'primary' : 'outline'}
                            onClick={() => setVideoType('upload')}
                        >
                            <Upload className="h-4 w-4" /> Video yuklash
                        </Button>
                    </div>
                    <div className="mt-2">
                        {videoType === 'youtube' ? (
                            <Input
                                value={youtubeUrl}
                                onChange={(event) => setYoutubeUrl(event.target.value)}
                                placeholder="https://www.youtube.com/watch?v=..."
                            />
                        ) : (
                            <Input
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime"
                                onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                            />
                        )}
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                    <div>
                        <label className="mb-2 block text-sm font-medium">Davomiyligi (daq)</label>
                        <Input type="number" min={1} max={1440} value={duration} onChange={(event) => setDuration(event.target.value)} />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium">Guruh</label>
                        <Combobox
                            options={course.groups.map((group) => ({ value: String(group.id), label: group.name }))}
                            value={groupId}
                            onChange={setGroupId}
                            placeholder="Guruhni tanlang"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium">Tavsif <span className="font-normal text-muted-foreground">(ixtiyoriy)</span></label>
                    <textarea
                        className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Dars mazmuni haqida qisqacha"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-sm font-medium">Dars sanasi</label>
                        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </div>
                </div>

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
