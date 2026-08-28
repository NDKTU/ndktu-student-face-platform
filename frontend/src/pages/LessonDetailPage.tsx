import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ClipboardCheck, ExternalLink, FileText, Link as LinkIcon, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLesson } from '@/hooks/useLessons';
import { useAssignments, useDeleteAssignment } from '@/hooks/useAssignments';
import { useCreateResource, useDeleteResource, useResources } from '@/hooks/useResources';
import { resourceService, type ResourceType } from '@/services/resourceService';
import type { Assignment } from '@/services/assignmentService';
import { AssignmentFormModal } from '@/components/AssignmentFormModal';
import { HomeworkSubmissionBox } from '@/components/courses/HomeworkSubmissionBox';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

function youtubeEmbedUrl(url?: string | null) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        let videoId = parsed.hostname.includes('youtu.be') ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
        if (parsed.pathname.startsWith('/embed/')) videoId = parsed.pathname.split('/')[2];
        return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
    } catch { return null; }
}

export default function LessonDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const lessonId = id ? Number.parseInt(id, 10) : undefined;
    const lessonQuery = useLesson(lessonId);
    const resourcesQuery = useResources(lessonId);
    const assignmentsQuery = useAssignments(lessonId ? { lesson_id: lessonId, limit: 1 } : undefined);
    const deleteResource = useDeleteResource(lessonId);
    const deleteAssignment = useDeleteAssignment();
    const [contentOpen, setContentOpen] = useState(false);
    const [homeworkOpen, setHomeworkOpen] = useState(false);
    const [editingHomework, setEditingHomework] = useState<Assignment | null>(null);

    if (lessonQuery.isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-2/3" /><Skeleton className="aspect-video w-full rounded-2xl" /></div>;
    if (lessonQuery.isError) return <ErrorState onRetry={() => lessonQuery.refetch()} />;
    const lesson = lessonQuery.data;
    if (!lesson) return <EmptyState title="Dars topilmadi" description="Bu dars mavjud emas." />;

    const resources = resourcesQuery.data?.resources ?? [];
    const video = resources.find((item) => item.resource_type === 'video');
    const scripts = resources.filter((item) => item.resource_type === 'text');
    const extras = resources.filter((item) => item.resource_type === 'file' || item.resource_type === 'link');
    // Bir darsga — bitta uy vazifasi (bazada `uq_homework_per_lesson` bilan
    // kafolatlangan), shuning uchun ro'yxat emas, bitta yozuv ko'rsatiladi.
    const homework = assignmentsQuery.data?.homeworks?.[0] ?? null;
    const embedUrl = youtubeEmbedUrl(video?.link_url);
    const canManageContent = hasPermission('create:resource');
    const canManageHomework = hasPermission('create:homework');
    // Javob topshirish faqat talabaga: admin/o'qituvchida `create:submission`
    // ham bor, lekin ular vazifani boshqaradi, topshirmaydi.
    const canSubmitHomework = hasPermission('create:submission') && !canManageHomework;
    const canGrade = hasPermission('update:submission');

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/courses/${lesson.course_id}`)} className="-ml-2"><ArrowLeft className="mr-2 h-4 w-4" /> Kursga qaytish</Button>
                <PageHeader title={lesson.topic} description={[lesson.date, lesson.subject_teacher?.subject?.name, lesson.group?.name].filter(Boolean).join(' · ')} actions={canManageContent ? <Button onClick={() => setContentOpen(true)}><Plus className="mr-2 h-4 w-4" /> Kontent qo'shish</Button> : undefined} />
                {lesson.description && <p className="max-w-4xl text-sm leading-6 text-foreground/80">{lesson.description}</p>}
            </div>

            <Card><CardHeader><CardTitle>Dars videosi</CardTitle></CardHeader><CardContent>
                {embedUrl ? <div className="aspect-video overflow-hidden rounded-xl bg-black"><iframe className="h-full w-full" src={embedUrl} title={video?.title ?? lesson.topic} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
                    : video?.link_url ? <a href={video.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-medium text-primary hover:underline">{video.title || 'Video havolasi'} <ExternalLink className="h-4 w-4" /></a>
                    : <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Video qo'shilmagan" description="Bu darsni video bo'lmasdan ham o'qish mumkin." />}
            </CardContent></Card>

            {scripts.length > 0 && <Card><CardHeader><CardTitle>Dars skripti / konspekti</CardTitle></CardHeader><CardContent className="space-y-4">{scripts.map((item) => <div key={item.id} className="relative rounded-xl bg-muted/40 p-4"><p className="whitespace-pre-wrap text-sm leading-7">{item.text_content}</p>{canManageContent && <DeleteButton onClick={() => deleteResource.mutate(item.id)} />}</div>)}</CardContent></Card>}

            <Card><CardHeader><CardTitle>Qo'shimcha materiallar</CardTitle></CardHeader><CardContent>
                {extras.length === 0 ? <p className="text-sm text-muted-foreground">Hozircha kitob, hujjat yoki qo'shimcha havola yo'q.</p> : <div className="grid gap-3 sm:grid-cols-2">{extras.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-4">{item.resource_type === 'file' ? <FileText className="h-5 w-5 text-primary" /> : <LinkIcon className="h-5 w-5 text-primary" />}<a href={item.file_url || item.link_url || '#'} {...(item.file_url ? { download: item.title } : {})} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-primary">{item.title}</a><ExternalLink className="h-4 w-4 text-muted-foreground" />{canManageContent && <button onClick={() => deleteResource.mutate(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}</div>)}</div>}
            </CardContent></Card>

            <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Uy vazifasi</CardTitle>{canManageHomework && !homework && <Button size="sm" onClick={() => { setEditingHomework(null); setHomeworkOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Uy vazifasi</Button>}</CardHeader><CardContent>
                {!homework ? <p className="text-sm text-muted-foreground">Bu dars uchun uy vazifasi berilmagan.</p> : (() => { const assignment = homework; return <div key={assignment.id} className="rounded-xl border border-border/60 p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="font-semibold">{assignment.title}</p>{assignment.description && <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>}<p className="mt-2 text-xs text-muted-foreground">Muddat: {new Date(assignment.deadline).toLocaleString()} · Baho: 1–{assignment.max_grade}</p>{assignment.attachments?.length > 0 && <ul className="mt-3 space-y-1.5">{assignment.attachments.map((file) => <li key={file.url}><a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span>{file.size != null && <span className="shrink-0 text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>}</a></li>)}</ul>}</div>{canGrade && <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/homework/${assignment.id}/submissions`)}><ClipboardCheck className="mr-2 h-4 w-4" /> Ishlarni tekshirish{assignment.stats ? ` (${assignment.stats.submitted})` : ''}</Button>}{canManageHomework && <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingHomework(assignment); setHomeworkOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteAssignment.mutate(assignment.id)}><Trash2 className="h-4 w-4" /></Button></div>}</div>{canSubmitHomework && <HomeworkSubmissionBox assignment={assignment} />}</div>; })()}
            </CardContent></Card>

            <ContentModal isOpen={contentOpen} onClose={() => setContentOpen(false)} lessonId={lesson.id} />
            <AssignmentFormModal isOpen={homeworkOpen} onClose={() => setHomeworkOpen(false)} courseId={lesson.course_id} lessonId={lesson.id} editing={editingHomework} />
        </div>
    );
}

function DeleteButton({ onClick }: { onClick: () => void }) { return <button onClick={onClick} className="absolute right-3 top-3 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>; }

function ContentModal({ isOpen, onClose, lessonId }: { isOpen: boolean; onClose: () => void; lessonId: number }) {
    const createResource = useCreateResource(lessonId);
    const [kind, setKind] = useState<ResourceType>('file');
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const options: { value: ResourceType; label: string }[] = [{ value: 'file', label: 'Hujjat / kitob' }, { value: 'link', label: 'Havola' }, { value: 'text', label: 'Skript / konspekt' }, { value: 'video', label: 'YouTube video' }];

    const submit = async () => {
        setSaving(true); setError('');
        try {
            let fileUrl: string | undefined;
            if (kind === 'file' && file) fileUrl = (await resourceService.upload(file)).url;
            await createResource.mutateAsync({ lesson_id: lessonId, resource_type: kind, title: title.trim() || file?.name || (kind === 'text' ? 'Dars konspekti' : 'Material'), file_url: fileUrl, link_url: url.trim() || undefined, text_content: text.trim() || undefined });
            setTitle(''); setUrl(''); setText(''); setFile(null); onClose();
        } catch (cause) { setError((cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Saqlashda xatolik'); }
        finally { setSaving(false); }
    };

    return <Modal isOpen={isOpen} onClose={onClose} title="Dars kontenti"><div className="space-y-4">
        <div className="flex flex-wrap gap-2">{options.map((option) => <Button key={option.value} size="sm" variant={kind === option.value ? 'primary' : 'outline'} onClick={() => { setKind(option.value); setError(''); }}>{option.label}</Button>)}</div>
        <div><label className="mb-1 block text-sm font-medium">Nomi</label><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Material nomi" /></div>
        {kind === 'text' && <textarea className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} placeholder="Dars skripti yoki konspekti..." />}
        {kind === 'link' && <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />}
        {kind === 'video' && <div><Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." /><p className="mt-1.5 text-xs text-muted-foreground">Video fayl yuklab bo'lmaydi — faqat havola.</p></div>}
        {kind === 'file' && <div><label className="mb-1 flex items-center gap-2 text-sm font-medium"><Upload className="h-4 w-4" /> Fayl</label><Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Bekor qilish</Button><Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Saqlash</Button></div>
    </div></Modal>;
}
