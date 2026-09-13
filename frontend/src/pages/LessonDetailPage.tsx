import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ClipboardCheck, ExternalLink, FileText, FileQuestion, Link as LinkIcon, ListChecks, Loader2, Paperclip, Pencil, Plus, Radio, ScanFace, ScrollText, Trash2, Upload, Video as VideoIcon, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRoleView } from '@/hooks/useRoleView';
import { useLesson } from '@/hooks/useLessons';
import { useAssignments, useDeleteAssignment } from '@/hooks/useAssignments';
import { useCreateResource, useDeleteResource, useResources } from '@/hooks/useResources';
import { useUpdateLesson } from '@/hooks/useLessons';
import { resourceService, type ResourceType } from '@/services/resourceService';
import type { Assignment } from '@/services/assignmentService';
import { AssignmentFormModal } from '@/components/AssignmentFormModal';
import { LessonQuizModal } from '@/components/courses/LessonQuizModal';
import { ZoomMeetingBox } from '@/components/courses/ZoomMeetingBox';
import { LessonFaceCheckReport } from '@/components/courses/LessonFaceCheckReport';
import { LessonAttendancePanel } from '@/components/courses/LessonAttendancePanel';
import { Switch } from '@/components/ui/Switch';
import { toast } from 'sonner';
import { QuestionExcelUploadModal } from '@/components/questions/QuestionExcelUploadModal';
import { useQuizzes, useDeleteQuiz } from '@/hooks/useQuizzes';
import { QUIZ_TYPE_LABELS, type Quiz } from '@/services/quizService';
import { HomeworkSubmissionBox } from '@/components/courses/HomeworkSubmissionBox';
import { Button } from '@/components/ui/Button';
import { CardAction } from '@/components/ui/CardAction';
import { formatDateTime } from '@/utils/date';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { FileSourceField } from '@/components/file/FileSourceField';
import type { LibraryFile } from '@/services/fileService';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabBar, type TabDef } from '@/components/ui/TabBar';
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
    const { isStudent } = useRoleView();
    const lessonId = id ? Number.parseInt(id, 10) : undefined;
    const lessonQuery = useLesson(lessonId);
    const resourcesQuery = useResources(lessonId);
    const assignmentsQuery = useAssignments(lessonId ? { lesson_id: lessonId, limit: 1 } : undefined);
    const deleteResource = useDeleteResource(lessonId);
    const updateLesson = useUpdateLesson();
    const deleteAssignment = useDeleteAssignment();
    // Kontent bitta umumiy oynada emas, har bir blokda alohida qo'shiladi:
    // o'qituvchi «video qo'shaman» deb kirsa, unga fayl/konspekt tanlash
    // kerak emas. `contentKinds` — o'sha blok uchun ruxsat etilgan turlar.
    // Ochilganda doim dars ma'lumoti: o'qituvchi avval nimani o'qitayotganini
    // ko'rishi kerak, jurnal esa alohida qadam.
    const [tab, setTab] = useState<'info' | 'attendance' | 'grading'>('info');
    const [contentKinds, setContentKinds] = useState<ResourceType[] | null>(null);
    const [homeworkOpen, setHomeworkOpen] = useState(false);
    const [editingHomework, setEditingHomework] = useState<Assignment | null>(null);
    const [quizOpen, setQuizOpen] = useState(false);
    const [excelOpen, setExcelOpen] = useState(false);
    const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
    // Talabada `read:quiz` yo'q — so'rov yuborilsa 403 qaytadi va konsol
    // xatolarga to'ladi. Huquq bo'lmasa, blok umuman ko'rsatilmaydi.
    const canSeeQuizzes = hasPermission('read:quiz');
    const quizzesQuery = useQuizzes(
        lessonId ? { lesson_id: lessonId, limit: 20 } : {},
        Boolean(lessonId) && canSeeQuizzes,
    );
    const deleteQuiz = useDeleteQuiz();

    if (lessonQuery.isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-2/3" /><Skeleton className="aspect-video w-full rounded-2xl" /></div>;
    if (lessonQuery.isError) return <ErrorState onRetry={() => lessonQuery.refetch()} />;
    const lesson = lessonQuery.data;
    if (!lesson) return <EmptyState title="Dars topilmadi" description="Bu dars mavjud emas." />;

    const resources = resourcesQuery.data?.resources ?? [];
    const video = resources.find((item) => item.resource_type === 'video');
    // Jonli dars — Zoom havolasi. Oxirgisi olinadi: o'qituvchi havolani
    // yangilaganda eskisi qolib ketmasin.
    const zoom = [...resources].reverse().find((item) => item.resource_type === 'zoom');
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
    const canManageQuiz = hasPermission('create:quiz');
    // Yuz nazorati faqat talabaga: darsni o'qituvchining o'zi olib boradi.
    // Ko'rinish roli bo'yicha aniqlanadi — huquqlar to'plami emas: bir
    // hisobda bir nechta rol bo'lishi mumkin.
    const isStudentView = isStudent;
    const canAddQuestion = hasPermission('create:question');
    const quizzes = quizzesQuery.data?.quizzes ?? [];
    // Excel oynasi fan nomini ko'rsatishi uchun — dars javobida nom bor,
    // ro'yxat esa tanlanmagan holat uchun zaxira.
    const lessonSubjectId = lesson.teacher_subject?.subject_id;
    const lessonSubjectName = lesson.teacher_subject?.subject?.name;

    // ── Tablar ───────────────────────────────────────────────────────────
    //
    // Ilgari sakkizta karta ketma-ket turardi va Davomat yuqoridan ikkinchi
    // bo'lib chiqardi: o'qituvchi darsga kirishi bilan jurnalni ko'rar, dars
    // mazmuni esa pastda qolardi. Endi birinchi tab — darsning o'zi.
    const canSeeAttendance = canManageContent && hasPermission('read:attendance');
    // Baholash tab'i: testlar va uy vazifasi ishlarini tekshirish. Talabada
    // ham testlar ko'rinadi (u ularni ishlaydi), shuning uchun shart
    // `canSeeQuizzes` ni ham hisobga oladi.
    const canSeeGrading = canSeeQuizzes || canGrade;

    const tabs: TabDef<'info' | 'attendance' | 'grading'>[] = [
        { id: 'info', label: "Dars ma'lumoti", icon: <BookOpen className="h-4 w-4" /> },
        ...(canSeeAttendance
            ? [{ id: 'attendance' as const, label: 'Davomat', icon: <ClipboardCheck className="h-4 w-4" /> }]
            : []),
        ...(canSeeGrading
            ? [{ id: 'grading' as const, label: 'Baholash', icon: <ListChecks className="h-4 w-4" /> }]
            : []),
    ];
    const activeTab = tabs.some((t) => t.id === tab) ? tab : 'info';

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/courses/${lesson.course_id}`)} className="-ml-2"><ArrowLeft className="mr-2 h-4 w-4" /> Kursga qaytish</Button>
                <PageHeader title={lesson.topic} description={[lesson.date, lesson.teacher_subject?.subject?.name, lesson.group?.name].filter(Boolean).join(' · ')} />
                {lesson.description && <p className="max-w-4xl text-sm leading-6 text-foreground/80">{lesson.description}</p>}
            </div>

            <TabBar tabs={tabs} active={activeTab} onChange={setTab} />

            {/* ── Dars ma'lumoti ──────────────────────────────────────── */}
            {activeTab === 'info' && (
            <div className="space-y-6">
            {(zoom?.link_url || canManageContent) && (
                <SectionCard
                    icon={<Radio className="h-[18px] w-[18px]" />}
                    tone="teal"
                    title="Jonli dars (Zoom)"
                    description={zoom?.link_url ? 'Uchrashuv biriktirilgan' : undefined}
                    action={canManageContent && (
                        zoom
                            ? <CardAction variant="ghost" className="text-destructive" onClick={() => deleteResource.mutate(zoom.id)} icon={<Trash2 className="h-4 w-4" />} label="Havolani olib tashlash" />
                            : <CardAction onClick={() => setContentKinds(['zoom'])} icon={<Plus className="h-4 w-4" />} label="Zoom havolasi" />
                    )}
                >
                    {/* Nazorat har bir darsga kerak emas — o'qituvchi o'zi hal qiladi. */}
                    {canManageContent && zoom?.link_url && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-medium"><ScanFace className="h-4 w-4" /> Yuz nazorati</p>
                                <p className="text-xs text-muted-foreground">
                                    Talaba darsga kirishda va dars davomida tasodifiy vaqtlarda tekshiriladi.
                                </p>
                            </div>
                            <Switch
                                checked={Boolean(lesson.face_check_enabled)}
                                disabled={updateLesson.isPending}
                                onCheckedChange={(checked) => {
                                    updateLesson.mutate(
                                        { id: lesson.id, data: { face_check_enabled: checked } },
                                        { onError: () => toast.error("Sozlamani saqlab bo'lmadi") },
                                    );
                                }}
                            />
                        </div>
                    )}
                    {zoom?.link_url
                        ? <ZoomMeetingBox lessonId={lesson.id} joinUrl={zoom.link_url} faceCheckEnabled={isStudentView && Boolean(lesson.face_check_enabled)} />
                        : <EmptyState icon={<Radio className="h-6 w-6" />} title="Jonli uchrashuv yo'q" description="Bu darsga Zoom havolasi biriktirilmagan." className="py-8" />}
                </SectionCard>
            )}

            <SectionCard
                icon={<VideoIcon className="h-[18px] w-[18px]" />}
                tone="blue"
                title="Dars videosi"
                action={canManageContent && (
                    video
                        ? <CardAction variant="ghost" className="text-destructive" onClick={() => deleteResource.mutate(video.id)} icon={<Trash2 className="h-4 w-4" />} label="Videoni olib tashlash" />
                        : <CardAction onClick={() => setContentKinds(['video'])} icon={<Plus className="h-4 w-4" />} label="YouTube havolasi" />
                )}
            >
                {embedUrl ? <div className="aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-border/60"><iframe className="h-full w-full" src={embedUrl} title={video?.title ?? lesson.topic} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
                    : video?.link_url ? <a href={video.link_url} target="_blank" rel="noreferrer" className="group/link inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/[0.04]">{video.title || 'Video havolasi'} <ExternalLink className="h-4 w-4 transition-transform group-hover/link:translate-x-0.5" /></a>
                    : <EmptyState icon={<VideoIcon className="h-6 w-6" />} title="Video qo'shilmagan" description="Bu darsni video bo'lmasdan ham o'qish mumkin." className="py-8" />}
            </SectionCard>

            {(scripts.length > 0 || canManageContent) && <SectionCard
                icon={<ScrollText className="h-[18px] w-[18px]" />}
                tone="purple"
                title="Dars skripti / konspekti"
                description={scripts.length > 0 ? `${scripts.length} ta yozuv` : undefined}
                action={canManageContent && <CardAction variant="outline" onClick={() => setContentKinds(['text'])} icon={<Plus className="h-4 w-4" />} label="Konspekt qo'shish" />}
            >{scripts.length === 0 ? <EmptyState icon={<ScrollText className="h-6 w-6" />} title="Konspekt qo'shilmagan" description="Dars matnini shu yerga qo'shish mumkin." className="py-8" /> : scripts.map((item) => <div key={item.id} className="group/item relative rounded-xl border border-border/60 bg-muted/30 p-4 transition-colors hover:border-border"><p className="whitespace-pre-wrap text-sm leading-7">{item.text_content}</p>{canManageContent && <DeleteButton onClick={() => deleteResource.mutate(item.id)} />}</div>)}</SectionCard>}

            <SectionCard
                icon={<Paperclip className="h-[18px] w-[18px]" />}
                tone="orange"
                title="Qo'shimcha materiallar"
                description={extras.length > 0 ? `${extras.length} ta havola va hujjat` : undefined}
                action={canManageContent && <CardAction variant="outline" onClick={() => setContentKinds(['file', 'link'])} icon={<Plus className="h-4 w-4" />} label="Material qo'shish" />}
            >
                {extras.length === 0 ? <EmptyState icon={<Paperclip className="h-6 w-6" />} title="Material yo'q" description="Hozircha kitob, hujjat yoki qo'shimcha havola qo'shilmagan." className="py-8" /> : <div className="grid gap-3 sm:grid-cols-2">{extras.map((item) => <div key={item.id} className="group/item flex items-center gap-3 rounded-xl border border-border/60 p-3.5 transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_6px_16px_-8px_rgba(16,24,40,0.2)]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.resource_type === 'file' ? <FileText className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}</span><a href={item.file_url || item.link_url || '#'} {...(item.file_url ? { download: item.title } : {})} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium transition-colors hover:text-primary">{item.title}</a><ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover/item:translate-x-0.5 group-hover/item:text-primary" />{canManageContent && <button onClick={() => deleteResource.mutate(item.id)} aria-label="Materialni o'chirish" className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/item:opacity-100"><Trash2 className="h-4 w-4" /></button>}</div>)}</div>}
            </SectionCard>

            <SectionCard
                icon={<ClipboardCheck className="h-[18px] w-[18px]" />}
                tone="green"
                title="Uy vazifasi"
                description={homework ? `Muddat: ${formatDateTime(homework.deadline)}` : undefined}
                action={canManageHomework && !homework && <CardAction onClick={() => { setEditingHomework(null); setHomeworkOpen(true); }} icon={<Plus className="h-4 w-4" />} label="Uy vazifasi" />}
            >
                {!homework ? <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="Uy vazifasi yo'q" description="Bu dars uchun uy vazifasi berilmagan." className="py-8" /> : (() => { const assignment = homework; return <div key={assignment.id} className="rounded-xl border border-border/60 p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="font-semibold">{assignment.title}</p>{assignment.description && <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>}<p className="mt-2 text-xs text-muted-foreground">Muddat: {formatDateTime(assignment.deadline)}</p>{/* Kim bergani faqat vazifani boshqaradiganlarga: talabaga muddat muhim, xizmat ma'lumoti emas. */}{canManageHomework && <p className="mt-1 text-xs text-muted-foreground">Bergan: {assignment.created_by_name || "noma'lum"} · {formatDateTime(assignment.created_at)}</p>}{assignment.attachments?.length > 0 && <ul className="mt-3 space-y-1.5">{assignment.attachments.map((file) => <li key={file.url}><a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span>{file.size != null && <span className="shrink-0 text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>}</a></li>)}</ul>}</div>{canGrade && <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/homework/${assignment.id}/submissions`)}><ClipboardCheck className="mr-2 h-4 w-4" /> Ishlarni tekshirish{assignment.stats ? ` (${assignment.stats.submitted})` : ''}</Button>}{canManageHomework && <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingHomework(assignment); setHomeworkOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteAssignment.mutate(assignment.id)}><Trash2 className="h-4 w-4" /></Button></div>}</div>{canSubmitHomework && <HomeworkSubmissionBox assignment={assignment} />}</div>; })()}
            </SectionCard>

            </div>
            )}

            {/* ── Davomat ─────────────────────────────────────────────── */}
            {activeTab === 'attendance' && canSeeAttendance && (
                <div className="space-y-6">
                    <SectionCard icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone="teal" title="Davomat">
                        <LessonAttendancePanel lessonId={lesson.id} />
                    </SectionCard>

                    {/* Yuz nazorati jurnali — davomat bilan bir kesimda: ikkovi
                        ham «kim darsda bo'ldi» degan savolga javob beradi. */}
                    {zoom?.link_url && lesson.face_check_enabled && (
                        <SectionCard icon={<ScanFace className="h-[18px] w-[18px]" />} tone="purple" title="Yuz nazorati">
                            <LessonFaceCheckReport lessonId={lesson.id} />
                        </SectionCard>
                    )}
                </div>
            )}

            {/* ── Baholash ────────────────────────────────────────────── */}
            {activeTab === 'grading' && (
            <div className="space-y-6">
            {/* Uy vazifasi ishlari. Vazifaning o'zi «Dars ma'lumoti» da qoladi
                — u dars mazmunining bir qismi; bu yerda esa tekshirishga
                kirish, ya'ni baholash ishi. */}
            {canGrade && homework && (
                <SectionCard icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone="green" title="Uy vazifasi ishlari">
                    <p className="text-sm text-muted-foreground">
                        «{homework.title}» — topshirilgan ishlarni ko'rib, baho qo'yish.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/homework/${homework.id}/submissions`)}>
                        <ClipboardCheck className="mr-2 h-4 w-4" /> Ishlarni tekshirish
                        {homework.stats ? ` (${homework.stats.submitted})` : ''}
                    </Button>
                </SectionCard>
            )}

            {canSeeQuizzes && <SectionCard
                icon={<ListChecks className="h-[18px] w-[18px]" />}
                tone="blue"
                title="Testlar"
                description={quizzes.length > 0 ? `${quizzes.length} ta test` : undefined}
                action={
                    <div className="flex flex-wrap gap-2">
                        {canAddQuestion && (
                            <>
                                <CardAction
                                    variant="outline"
                                    // Fanni `lesson_id` bo'yicha savol formasi o'zi aniqlaydi —
                                    // dars javobi kechikkan bo'lsa ham havola to'g'ri qoladi.
                                    onClick={() => navigate(`/questions/create?lesson_id=${lesson.id}&return_to=/lessons/${lesson.id}`)}
                                    icon={<FileQuestion className="h-4 w-4" />}
                                    label="Savol qo'shish"
                                />
                                <CardAction
                                    variant="outline"
                                    onClick={() => setExcelOpen(true)}
                                    disabled={!lessonSubjectId}
                                    title={lessonSubjectId ? undefined : 'Darsning fani aniqlanmadi'}
                                    icon={<Upload className="h-4 w-4" />}
                                    label="Excel'dan yuklash"
                                />
                            </>
                        )}
                        {canManageQuiz && (
                            <CardAction
                                onClick={() => { setEditingQuiz(null); setQuizOpen(true); }}
                                icon={<Plus className="h-4 w-4" />}
                                label="Test yaratish"
                            />
                        )}
                    </div>
                }
            >
                {/* Savollar ma'ruzachining bankidan yig'iladi, shuning uchun avval
                    savol qo'shish, keyin test tuzish tabiiy tartib. */}
                {quizzes.length === 0 ? (
                    <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Test tuzilmagan" description="Bu dars uchun hali test yaratilmagan." className="py-8" />
                ) : (
                    <div className="space-y-3">
                        {quizzes.map((quiz) => (
                            <div key={quiz.id} className="group/item flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3.5 transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_6px_16px_-8px_rgba(16,24,40,0.2)]">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <ListChecks className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold">{quiz.title}</p>
                                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                                        {QUIZ_TYPE_LABELS[quiz.quiz_type ?? 'LESSON_QUIZ']} · {quiz.question_number} savol · {quiz.duration} daqiqa · PIN: {quiz.pin}
                                    </p>
                                </div>
                                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${quiz.is_active ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400' : 'bg-muted text-muted-foreground ring-border'}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${quiz.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                                    {quiz.is_active ? 'Faol' : 'Faol emas'}
                                </span>
                                {canManageQuiz && (
                                    <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover/item:opacity-100">
                                        <Button variant="ghost" size="icon" aria-label="Testni tahrirlash" onClick={() => { setEditingQuiz(quiz); setQuizOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" aria-label="Testni o'chirish" className="text-muted-foreground hover:text-destructive" onClick={() => deleteQuiz.mutate({ id: quiz.id })}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>}
            </div>
            )}

            <ContentModal kinds={contentKinds} onClose={() => setContentKinds(null)} lessonId={lesson.id} />
            <LessonQuizModal isOpen={quizOpen} onClose={() => setQuizOpen(false)} lessonId={lesson.id} quiz={editingQuiz} />
            <QuestionExcelUploadModal
                isOpen={excelOpen}
                onClose={() => setExcelOpen(false)}
                subjects={[]}
                defaultSubjectId={lessonSubjectId}
                subjectName={lessonSubjectName}
                lockSubject
            />
            <AssignmentFormModal isOpen={homeworkOpen} onClose={() => setHomeworkOpen(false)} courseId={lesson.course_id} lessonId={lesson.id} editing={editingHomework} />
        </div>
    );
}

function DeleteButton({ onClick }: { onClick: () => void }) { return <button onClick={onClick} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/item:opacity-100"><Trash2 className="h-4 w-4" /></button>; }

/**
 * Dars sahifasidagi bo'lim kartochkasi.
 *
 * Har bir bo'lim bir xil tuzilishda: chapda rangli belgi, yonida sarlavha va
 * ixtiyoriy izoh, o'ngda amal tugmasi. Belgi rangi `--stat-*` tokenidan
 * olinadi — to'q rejimda ular o'zi ochroq variantga o'tadi, shuning uchun
 * bu yerda hex yozilmaydi.
 *
 * Avval har bir `Card` o'z qo'lida yig'ilardi va sarlavhalar bir-biridan
 * farq qilardi; bitta komponent ularni bir maromga soladi.
 */
function SectionCard({
    icon,
    tone,
    title,
    description,
    action,
    children,
}: {
    icon: React.ReactNode;
    tone: 'teal' | 'blue' | 'purple' | 'orange' | 'green';
    title: string;
    description?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    const color = `var(--stat-${tone})`;
    return (
        <Card className="overflow-hidden rounded-2xl border-border/60 transition-shadow duration-200 hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)]">
            <CardHeader className="flex-row items-center justify-between gap-3 bg-muted/30 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                    <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                        style={{
                            color,
                            backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ['--tw-ring-color' as any]: `color-mix(in srgb, ${color} 22%, transparent)`,
                        }}
                    >
                        {icon}
                    </span>
                    <div className="min-w-0">
                        <CardTitle className="truncate text-base">{title}</CardTitle>
                        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
                    </div>
                </div>
                {action}
            </CardHeader>
            <CardContent className="space-y-4">{children}</CardContent>
        </Card>
    );
}

/**
 * Kontent qo'shish oynasi. Turlar ro'yxati chaqirgan blokdan keladi:
 * video blokida faqat YouTube, materiallar blokida fayl va havola.
 * Bitta umumiy oynada hammasi bo'lgani chalkash edi.
 */
function ContentModal({ kinds, onClose, lessonId }: { kinds: ResourceType[] | null; onClose: () => void; lessonId: number }) {
    const createResource = useCreateResource(lessonId);
    const [kind, setKind] = useState<ResourceType>(kinds?.[0] ?? 'file');
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    // Kutubxonadan tanlangan fayl allaqachon serverda — yuklanmaydi.
    const [libraryFile, setLibraryFile] = useState<LibraryFile | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const ALL_OPTIONS: { value: ResourceType; label: string }[] = [
        { value: 'file', label: 'Hujjat / kitob' },
        { value: 'link', label: 'Havola' },
        { value: 'text', label: 'Skript / konspekt' },
        { value: 'video', label: 'YouTube video' },
        { value: 'zoom', label: 'Zoom (jonli dars)' },
    ];
    const options = ALL_OPTIONS.filter((option) => (kinds ?? []).includes(option.value));

    // Oyna ochilganda tur chaqirgan blokka moslanadi.
    useEffect(() => {
        if (kinds?.length) setKind(kinds[0]);
    }, [kinds]);

    const submit = async () => {
        setSaving(true); setError('');
        try {
            let fileUrl: string | undefined;
            if (kind === 'file' && file) fileUrl = (await resourceService.upload(file)).url;
            else if (kind === 'file' && libraryFile) fileUrl = libraryFile.url;
            await createResource.mutateAsync({ lesson_id: lessonId, resource_type: kind, title: title.trim() || file?.name || libraryFile?.title || (kind === 'text' ? 'Dars konspekti' : kind === 'zoom' ? 'Jonli dars' : kind === 'video' ? 'Dars videosi' : 'Material'), file_url: fileUrl, link_url: url.trim() || undefined, text_content: text.trim() || undefined });
            setTitle(''); setUrl(''); setText(''); setFile(null); setLibraryFile(null); onClose();
        } catch (cause) { setError((cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Saqlashda xatolik'); }
        finally { setSaving(false); }
    };

    const modalTitle = options.length === 1 ? options[0].label : 'Dars materiali';

    return <Modal isOpen={kinds !== null} onClose={onClose} title={modalTitle}><div className="space-y-4">
        {/* Tanlov faqat bir nechta tur bo'lganda ko'rsatiladi. */}
        {options.length > 1 && <div className="flex flex-wrap gap-2">{options.map((option) => <Button key={option.value} size="sm" variant={kind === option.value ? 'primary' : 'outline'} onClick={() => { setKind(option.value); setError(''); }}>{option.label}</Button>)}</div>}
        {/* Zoom va video nomi avtomatik qo'yiladi — ortiqcha maydon so'ralmaydi. */}
        {kind !== 'zoom' && kind !== 'video' && <div><label className="mb-1 block text-sm font-medium">Nomi</label><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Material nomi" /></div>}
        {kind === 'text' && <textarea className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} placeholder="Dars skripti yoki konspekti..." />}
        {kind === 'link' && <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />}
        {kind === 'video' && <div><Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." /><p className="mt-1.5 text-xs text-muted-foreground">Video fayl yuklab bo'lmaydi — faqat havola.</p></div>}
        {kind === 'zoom' && <div><Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://us05web.zoom.us/j/89012345678?pwd=..." /><p className="mt-1.5 text-xs text-muted-foreground">Zoom'da «Copy Invite Link» orqali olingan havolani qo'ying. Uchrashuvni o'qituvchi Zoom ilovasida boshlaydi, talabalar shu sahifada qo'shiladi.</p></div>}
        {kind === 'file' && <FileSourceField
            label="Fayl"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            deviceHint="PDF, Word, Excel, PowerPoint, TXT yoki ZIP"
            onFiles={(picked) => { setFile(picked[0] ?? null); setLibraryFile(null); }}
            onPickLibrary={() => setIsPickerOpen(true)}
        >
            {(file || libraryFile) && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{file?.name ?? libraryFile?.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{file ? 'qurilmadan' : 'kutubxonadan'}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label="Olib tashlash" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { setFile(null); setLibraryFile(null); }}><X className="h-3.5 w-3.5" /></Button>
                </div>
            )}
        </FileSourceField>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Bekor qilish</Button><Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Saqlash</Button></div>
        <FilePickerModal
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            multiple={false}
            title="Dars materialini tanlash"
            onSelect={(files) => { const picked = files[0]; if (picked) { setLibraryFile(picked); setFile(null); } }}
        />
    </div></Modal>;
}
