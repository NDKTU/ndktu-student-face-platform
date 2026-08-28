import { useEffect, useState } from 'react';
import { ClipboardList, FilePlus2, FileText, Loader2, Pencil, Plus, Trash2, UploadCloud, X, Youtube } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useCreateLesson, useUpdateLesson } from '@/hooks/useLessons';
import { resourceService } from '@/services/resourceService';
import { assignmentService } from '@/services/assignmentService';
import type { Course } from '@/services/courseService';
import type { Lesson, LessonResourceInfo } from '@/services/lessonService';
import type { Assignment } from '@/services/assignmentService';

/** Vazifa uchun ruxsat etilgan fayl turlari — kengaytma bo'yicha. */
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
    const [extraFiles, setExtraFiles] = useState<File[]>([]);
    // Bitta havola o'rniga ro'yxat: darsga bir nechta manba biriktirish kerak.
    const [links, setLinks] = useState<{ url: string; title: string }[]>([]);
    const [showHomework, setShowHomework] = useState(false);
    const [homeworkTitle, setHomeworkTitle] = useState('');
    const [homeworkDescription, setHomeworkDescription] = useState('');
    const [homeworkDeadline, setHomeworkDeadline] = useState('');
    // O'qituvchi vazifaga ilova qiladigan fayllar (shart, namuna, tarqatma).
    const [homeworkFiles, setHomeworkFiles] = useState<File[]>([]);
    // Talaba qanday topshirishi mumkinligi: bekendda `allow_file`, `allow_text`
    // va `allowed_file_types` bor edi, lekin formada ko'rsatilmagan — vazifa
    // doim standart sozlama bilan yaratilardi.
    const [allowFile, setAllowFile] = useState(true);
    const [allowText, setAllowText] = useState(true);
    const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    // Video alohida maydonda tahrirlanadi, ro'yxatda qolgan resurslar ko'rsatiladi.
    const [otherResources, setOtherResources] = useState<LessonResourceInfo[]>([]);
    const [homeworks, setHomeworks] = useState<Assignment[]>([]);
    // Mavjud yozuvlarni o'chirib qayta qo'shish emas, joyida tahrirlash mumkin.
    const [editingResourceId, setEditingResourceId] = useState<number | null>(null);
    const [resourceDraft, setResourceDraft] = useState({ title: '', link: '' });
    const [editingHomeworkId, setEditingHomeworkId] = useState<number | null>(null);
    const [homeworkDraft, setHomeworkDraft] = useState({ title: '', description: '', deadline: '' });

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
        setExtraFiles([]);
        setLinks([]);
        setShowHomework(false);
        setHomeworkTitle('');
        setHomeworkDescription('');
        setHomeworkFiles([]);
        setAllowFile(true);
        setAllowText(true);
        setAllowedTypes([]);
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);
        setHomeworkDeadline(deadline.toISOString().slice(0, 16));
        setError('');
        setOtherResources((lesson?.resources ?? []).filter((r) => r.resource_type !== 'video'));
        setHomeworks([]);
        if (lesson) {
            // Vazifalar dars javobida yo'q — alohida so'rov bilan olinadi.
            assignmentService
                .list({ lesson_id: lesson.id, limit: 50 })
                .then((data) => setHomeworks(data.homeworks ?? []))
                .catch(() => setHomeworks([]));
        }
    }, [isOpen, course.groups, lesson]);

    const startResourceEdit = (resource: LessonResourceInfo) => {
        setEditingResourceId(resource.id);
        setResourceDraft({ title: resource.title, link: resource.link_url ?? '' });
    };

    const saveResource = async (resource: LessonResourceInfo) => {
        if (!resourceDraft.title.trim()) {
            setError('Resurs nomini kiriting');
            return;
        }
        try {
            const updated = await resourceService.update(resource.id, {
                title: resourceDraft.title.trim(),
                // Havola faqat link/video turlari uchun mavjud.
                ...(resource.link_url !== null && resource.link_url !== undefined
                    ? { link_url: resourceDraft.link.trim() }
                    : {}),
            });
            setOtherResources((items) =>
                items.map((item) =>
                    item.id === resource.id
                        ? { ...item, title: updated.title, link_url: updated.link_url ?? item.link_url }
                        : item,
                ),
            );
            setEditingResourceId(null);
            setError('');
        } catch {
            setError("Resursni saqlashda xatolik");
        }
    };

    const startHomeworkEdit = (homework: Assignment) => {
        setEditingHomeworkId(homework.id);
        setHomeworkDraft({
            title: homework.title,
            description: homework.description ?? '',
            deadline: new Date(homework.deadline).toISOString().slice(0, 16),
        });
    };

    const saveHomework = async (homework: Assignment) => {
        if (!homeworkDraft.title.trim()) {
            setError("Uy vazifasi sarlavhasini kiriting");
            return;
        }
        try {
            const updated = await assignmentService.update(homework.id, {
                title: homeworkDraft.title.trim(),
                description: homeworkDraft.description.trim() || null,
                deadline: new Date(homeworkDraft.deadline).toISOString(),
            });
            setHomeworks((items) => items.map((item) => (item.id === homework.id ? updated : item)));
            setEditingHomeworkId(null);
            setError('');
        } catch {
            setError("Uy vazifasini saqlashda xatolik");
        }
    };

    const removeResource = async (resourceId: number) => {
        try {
            await resourceService.delete(resourceId);
            setOtherResources((items) => items.filter((item) => item.id !== resourceId));
        } catch {
            setError("Resursni o'chirishda xatolik");
        }
    };

    const removeHomework = async (homeworkId: number) => {
        try {
            await assignmentService.delete(homeworkId);
            setHomeworks((items) => items.filter((item) => item.id !== homeworkId));
        } catch {
            setError("Vazifani o'chirishda xatolik");
        }
    };

    const submit = async () => {
        if (!title.trim()) {
            setError("Dars nomini kiriting");
            return;
        }
        if (needsGroupChoice && !groupId) {
            setError('Guruhni tanlang');
            return;
        }
        // Ilgari vazifa faqat sarlavha yozilganda saqlanardi: o'qituvchi fayl
        // biriktirib, tavsif yozib «Saqlash» bossa ham dars vazifasiz
        // yaratilardi — hech qanday xabarsiz. Endi sarlavha ixtiyoriy, blokda
        // biror narsa to'ldirilgan bo'lsa vazifa yaratiladi (nomi bo'sh
        // qolsa, bekend dars mavzusini qo'yadi).
        const homeworkFilled = Boolean(
            homeworkTitle.trim() || homeworkDescription.trim() || homeworkFiles.length > 0 || allowedTypes.length > 0,
        );
        if (showHomework && homeworkFilled && !homeworkDeadline) {
            setError("Uy vazifasi uchun topshirish muddatini kiriting");
            return;
        }
        if (showHomework && homeworkFilled && !allowFile && !allowText) {
            setError("Talaba qanday topshirishini tanlang: fayl yoki matn");
            return;
        }

        setSaving(true);
        setError('');
        try {
            let lessonId: number;
            if (lesson) {
                lessonId = lesson.id;
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
                if (youtubeUrl.trim() && (!video || video.link_url !== youtubeUrl.trim())) {
                    await resourceService.create({
                        lesson_id: lesson.id,
                        resource_type: 'video',
                        title: title.trim(),
                        link_url: youtubeUrl.trim(),
                    });
                }
            } else {
                const created = await createLesson.mutateAsync({
                    course_id: course.id,
                    group_id: groupId ? Number(groupId) : undefined,
                    topic_id: topicId,
                    topic: title.trim(),
                    description: description.trim() || null,
                });
                lessonId = created.id;

                if (youtubeUrl.trim()) {
                    await resourceService.create({
                        lesson_id: lessonId,
                        resource_type: 'video',
                        title: title.trim(),
                        link_url: youtubeUrl.trim(),
                    });
                }
            }

            if (showResources) {
                for (const file of extraFiles) {
                    const { url } = await resourceService.upload(file);
                    await resourceService.create({
                        lesson_id: lessonId,
                        resource_type: 'file',
                        title: file.name,
                        file_url: url,
                    });
                }
                for (const link of links) {
                    if (!link.url.trim()) continue;
                    await resourceService.create({
                        lesson_id: lessonId,
                        resource_type: 'link',
                        title: link.title.trim() || "Qo'shimcha manba",
                        link_url: link.url.trim(),
                    });
                }
            }
            if (showHomework && homeworkFilled) {
                const attachments = [];
                for (const file of homeworkFiles) {
                    const { url } = await resourceService.upload(file);
                    attachments.push({ name: file.name, url, size: file.size, type: file.type });
                }
                await assignmentService.create({
                    course_id: course.id,
                    lesson_id: lessonId,
                    // Bo'sh sarlavha yuborilmaydi — bekend dars mavzusini qo'yadi.
                    title: homeworkTitle.trim() || undefined,
                    description: homeworkDescription.trim() || null,
                    deadline: new Date(homeworkDeadline).toISOString(),
                    attachments,
                    allow_file: allowFile,
                    allow_text: allowText,
                    allowed_file_types: allowedTypes,
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
                        <span className="font-normal text-muted-foreground">(ixtiyoriy)</span>
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

                <section className="rounded-xl border border-border/60 p-4">
                    {isEditing && (
                        <div className="mb-4 space-y-2">
                            {otherResources.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Qo'shimcha resurs yo'q.</p>
                            ) : otherResources.map((resource) => (
                                <div key={resource.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                                    {editingResourceId === resource.id ? (
                                        <div className="space-y-2">
                                            <Input
                                                value={resourceDraft.title}
                                                onChange={(event) => setResourceDraft((d) => ({ ...d, title: event.target.value }))}
                                                placeholder="Resurs nomi"
                                            />
                                            {resource.link_url != null && (
                                                <Input
                                                    value={resourceDraft.link}
                                                    onChange={(event) => setResourceDraft((d) => ({ ...d, link: event.target.value }))}
                                                    placeholder="https://..."
                                                />
                                            )}
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" variant="outline" size="sm" onClick={() => setEditingResourceId(null)}>
                                                    Bekor qilish
                                                </Button>
                                                <Button type="button" size="sm" onClick={() => void saveResource(resource)}>
                                                    Saqlash
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate text-sm">{resource.title}</span>
                                            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                                {resource.resource_type}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Resursni tahrirlash"
                                                className="h-7 w-7 text-muted-foreground"
                                                onClick={() => startResourceEdit(resource)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Resursni o'chirish"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                onClick={() => void removeResource(resource.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold">Resurslar</p>
                            <p className="text-xs text-muted-foreground">Kitob, hujjat yoki tashqi havola</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowResources((value) => !value)}>
                            <FilePlus2 className="h-4 w-4" /> {showResources ? 'Yopish' : "Resurs qo'shish"}
                        </Button>
                    </div>
                    {showResources && (
                        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                            <div>
                                <label className="mb-2 block text-xs font-medium text-muted-foreground">Hujjat yoki kitob</label>
                                {/* Brauzerning «No files selected» tugmasi o'rniga tushunarli
                                    yuklash maydoni: nima qilish kerakligi va qaysi format
                                    qabul qilinishi ko'rinib turadi. */}
                                <label
                                    htmlFor="lesson-files"
                                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-input bg-muted/20 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                                >
                                    <UploadCloud className="h-6 w-6 text-muted-foreground" />
                                    <span className="text-sm font-medium text-foreground">Fayl tanlash uchun bosing</span>
                                    <span className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, TXT yoki ZIP</span>
                                </label>
                                <input
                                    id="lesson-files"
                                    type="file"
                                    multiple
                                    className="sr-only"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                    onChange={(event) => setExtraFiles((prev) => [...prev, ...Array.from(event.target.files ?? [])])}
                                />
                                {extraFiles.length > 0 && (
                                    <ul className="mt-2 space-y-1.5">
                                        {extraFiles.map((file, index) => (
                                            <li
                                                key={`${file.name}-${index}`}
                                                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                                            >
                                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                                    {(file.size / 1024).toFixed(0)} KB
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Faylni ro'yxatdan olib tashlash"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setExtraFiles((prev) => prev.filter((_, i) => i !== index))}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div>
                                <label className="mb-2 block text-xs font-medium text-muted-foreground">Tashqi havolalar</label>
                                {links.length > 0 && (
                                    <div className="mb-2 space-y-2">
                                        {links.map((link, index) => (
                                            <div key={index} className="flex items-start gap-2">
                                                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                                                    <Input
                                                        value={link.url}
                                                        onChange={(event) =>
                                                            setLinks((prev) => prev.map((item, i) =>
                                                                i === index ? { ...item, url: event.target.value } : item))
                                                        }
                                                        placeholder="https://..."
                                                    />
                                                    <Input
                                                        value={link.title}
                                                        onChange={(event) =>
                                                            setLinks((prev) => prev.map((item, i) =>
                                                                i === index ? { ...item, title: event.target.value } : item))
                                                        }
                                                        placeholder="Havola nomi"
                                                    />
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Havolani olib tashlash"
                                                    className="mt-0.5 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="border-dashed"
                                    onClick={() => setLinks((prev) => [...prev, { url: '', title: '' }])}
                                >
                                    <Plus className="h-4 w-4" /> Havola qo'shish
                                </Button>
                            </div>
                        </div>
                    )}
                </section>

                <section className="rounded-xl border border-border/60 p-4">
                    {isEditing && (
                        <div className="mb-4 space-y-2">
                            {homeworks.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Bu darsga vazifa biriktirilmagan.</p>
                            ) : homeworks.map((homework) => (
                                <div key={homework.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                                    {editingHomeworkId === homework.id ? (
                                        <div className="space-y-2">
                                            <Input
                                                value={homeworkDraft.title}
                                                onChange={(event) => setHomeworkDraft((d) => ({ ...d, title: event.target.value }))}
                                                placeholder="Uy vazifasi sarlavhasi"
                                            />
                                            <textarea
                                                className="min-h-16 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                                value={homeworkDraft.description}
                                                onChange={(event) => setHomeworkDraft((d) => ({ ...d, description: event.target.value }))}
                                                placeholder="Vazifa tavsifi"
                                            />
                                            <div>
                                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Topshirish muddati</label>
                                                <Input
                                                    type="datetime-local"
                                                    value={homeworkDraft.deadline}
                                                    onChange={(event) => setHomeworkDraft((d) => ({ ...d, deadline: event.target.value }))}
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" variant="outline" size="sm" onClick={() => setEditingHomeworkId(null)}>
                                                    Bekor qilish
                                                </Button>
                                                <Button type="button" size="sm" onClick={() => void saveHomework(homework)}>
                                                    Saqlash
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate text-sm">{homework.title}</span>
                                            <span className="shrink-0 text-[11px] text-muted-foreground">
                                                {new Date(homework.deadline).toLocaleDateString()}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Vazifani tahrirlash"
                                                className="h-7 w-7 text-muted-foreground"
                                                onClick={() => startHomeworkEdit(homework)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Vazifani o'chirish"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                onClick={() => void removeHomework(homework.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
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
                            <div>
                                <Input value={homeworkTitle} onChange={(event) => setHomeworkTitle(event.target.value)} placeholder="Uy vazifasi sarlavhasi (ixtiyoriy)" />
                                <p className="mt-1 text-xs text-muted-foreground">Bo'sh qoldirsangiz, dars mavzusi nom bo'lib qo'yiladi.</p>
                            </div>
                            <textarea
                                className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={homeworkDescription}
                                onChange={(event) => setHomeworkDescription(event.target.value)}
                                placeholder="Vazifa tavsifi"
                            />
                            <div>
                                <label className="mb-2 block text-xs font-medium text-muted-foreground">Vazifa fayllari</label>
                                {/* Shart, namuna yoki tarqatma material — talaba yuklab oladi. */}
                                <label
                                    htmlFor="homework-files"
                                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-input bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                                >
                                    <UploadCloud className="h-5 w-5 text-muted-foreground" />
                                    <span className="text-sm font-medium text-foreground">Fayl biriktirish uchun bosing</span>
                                    <span className="text-xs text-muted-foreground">Shart, namuna yoki tarqatma material</span>
                                </label>
                                <input
                                    id="homework-files"
                                    type="file"
                                    multiple
                                    className="sr-only"
                                    onChange={(event) => setHomeworkFiles((prev) => [...prev, ...Array.from(event.target.files ?? [])])}
                                />
                                {homeworkFiles.length > 0 && (
                                    <ul className="mt-2 space-y-1.5">
                                        {homeworkFiles.map((file, index) => (
                                            <li
                                                key={`${file.name}-${index}`}
                                                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                                            >
                                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                                    {(file.size / 1024).toFixed(0)} KB
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Faylni olib tashlash"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setHomeworkFiles((prev) => prev.filter((_, i) => i !== index))}
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
                                            onChange={(event) => setAllowFile(event.target.checked)}
                                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                        />
                                        Fayl yuklaydi
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={allowText}
                                            onChange={(event) => setAllowText(event.target.checked)}
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
                                                                active
                                                                    ? prev.filter((v) => v !== option.value)
                                                                    : [...prev, option.value])
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
