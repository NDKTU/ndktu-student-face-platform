import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BarChart3, BookOpen, ClipboardCheck, ClipboardList, ExternalLink, FileText, FileQuestion, Link as LinkIcon, ListChecks, Loader2, Paperclip, Pencil, PlayCircle, Plus, Trash2, Upload, Video as VideoIcon, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLesson } from '@/hooks/useLessons';
import { useAssignments, useDeleteAssignment } from '@/hooks/useAssignments';
import { useCreateResource, useDeleteResource, useResources, useUpdateResource } from '@/hooks/useResources';
import { resourceService, type ResourceType } from '@/services/resourceService';
import type { Assignment } from '@/services/assignmentService';
import { AssignmentFormModal } from '@/components/AssignmentFormModal';
import { LessonQuizModal } from '@/components/courses/LessonQuizModal';
import { LessonAttendancePanel } from '@/components/courses/LessonAttendancePanel';
import { LessonGradebook } from '@/components/courses/LessonGradebook';
import { ATTENDANCE_ENABLED } from '@/constants/features';
import { QuestionExcelUploadModal } from '@/components/questions/QuestionExcelUploadModal';
import { useLessonQuestions } from '@/hooks/useQuestions';
import { QuestionAccordionList } from '@/components/questions/QuestionAccordionList';
import { useActiveLessonQuizzes, useQuizzes, useDeleteQuiz, useLessonQuizSummary, useUpdateQuiz } from '@/hooks/useQuizzes';
import { QUIZ_TYPE_LABELS, type Quiz, type QuizCreateRequest } from '@/services/quizService';
import { LessonHomeworkCard } from '@/components/homework/LessonHomeworkCard';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { CardAction } from '@/components/ui/CardAction';
import { formatDate } from '@/utils/date';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { FileSourceField } from '@/components/file/FileSourceField';
import type { LibraryFile } from '@/services/fileService';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabBar, type TabDef } from '@/components/ui/TabBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiErrorMessage } from '@/utils/apiError';
import { EXTERNAL_LINK_ERROR, normalizeExternalUrl } from '@/utils/url';
import { YOUTUBE_LINK_ERROR, youtubeEmbedUrl, youtubeVideoId } from '@/utils/youtube';

type LessonTab = 'info' | 'tasks' | 'attendance' | 'grading';

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
    // Kontent bitta umumiy oynada emas, har bir blokda alohida qo'shiladi:
    // o'qituvchi «video qo'shaman» deb kirsa, unga fayl/konspekt tanlash
    // kerak emas. `contentKinds` — o'sha blok uchun ruxsat etilgan turlar.
    // Ochilganda doim dars ma'lumoti: o'qituvchi avval nimani o'qitayotganini
    // ko'rishi kerak, jurnal esa alohida qadam.
    const [tab, setTab] = useState<LessonTab>('info');
    const [contentKinds, setContentKinds] = useState<ResourceType[] | null>(null);
    // Material o'chirish qaytarib bo'lmaydigan amal: havola ham, konspekt matni
    // ham qayta yozishga to'g'ri keladi. Ilgari bitta bosishda darhol o'chardi —
    // tasodifiy bosish uchun juda arzon narx edi.
    const [resourceToDelete, setResourceToDelete] = useState<{ id: number; title: string } | null>(null);
    const [resourceToRename, setResourceToRename] = useState<{ id: number; title: string } | null>(null);
    const [homeworkOpen, setHomeworkOpen] = useState(false);
    const [homeworkToDelete, setHomeworkToDelete] = useState<Assignment | null>(null);
    const [editingHomework, setEditingHomework] = useState<Assignment | null>(null);
    const [quizOpen, setQuizOpen] = useState(false);
    const [excelOpen, setExcelOpen] = useState(false);
    const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
    // Talabada `read:quiz` yo'q — so'rov yuborilsa 403 qaytadi va konsol
    // xatolarga to'ladi. Huquq bo'lmasa, blok umuman ko'rsatilmaydi.
    const canSeeQuizzes = hasPermission('read:quiz');
    // Savollar alohida huquq bilan: savolda to'g'ri javob ham bor va u
    // talabaga ko'rinmasligi kerak. `read:quiz` bilan birlashtirilsa,
    // kelajakda testlar talabaga ochilgan kuni savollar ham ochilardi.
    const canSeeQuestions = hasPermission('read:question');
    // Natijalar sahifasi (`/quizzes/:id`) shu huquq ostida — tugmani ham
    // o'shanga bog'laymiz, aks holda u bosilganda 403 beradigan sahifaga
    // olib borardi.
    const canSeeResults = hasPermission('read:result');
    const quizzesQuery = useQuizzes(
        lessonId ? { lesson_id: lessonId, limit: 20 } : {},
        Boolean(lessonId) && canSeeQuizzes,
    );
    // Talaba uchun: darsdagi FAOL testlar `/quiz/active` orqali — u
    // talabaning guruhi bo'yicha cheklaydi. Ilgari dars ichida tuzilgan test
    // talabaga shu yerda umuman ko'rinmasdi: karta `read:quiz` ga bog'langan,
    // talaba esa testni faqat umumiy «Test ishlash» ro'yxatidan topardi.
    const canTakeQuizzes = !canSeeQuizzes
        && hasPermission('read:active_quiz')
        && hasPermission('quiz_process:start_quiz');
    const activeLessonQuizzesQuery = useActiveLessonQuizzes(lessonId, canTakeQuizzes);
    const deleteQuiz = useDeleteQuiz();
    const updateQuiz = useUpdateQuiz();
    // Test yakunlari: nechta talaba topshirdi va o'rtacha baho. O'qituvchi
    // natijani darhol ko'rishi kerak — ilgari buning uchun umumiy
    // «Testlar» bo'limidan kerakli testni qidirish kerak edi.
    const quizSummaryQuery = useLessonQuizSummary(
        canSeeQuizzes && lessonId ? lessonId : undefined,
    );
    // Testni shu yerdan yoqish/o'chirish. Ilgari holat faqat YOZUV edi:
    // test tuzgan o'qituvchi uni faollashtirish uchun «Testlar» sahifasini
    // qidirib topishi kerak bo'lardi — dars sahifasida esa testi tayyor
    // bo'lib, lekin o'chiq turardi.
    const [togglingQuizId, setTogglingQuizId] = useState<number | null>(null);

    const toggleQuizActive = (quiz: Quiz) => {
        setTogglingQuizId(quiz.id);
        const payload: QuizCreateRequest = {
            title: quiz.title,
            question_number: quiz.question_number,
            duration: quiz.duration,
            pin: quiz.pin,
            lecturer_id: quiz.lecturer_id ?? null,
            group_id: quiz.group_id ?? null,
            subject_id: quiz.subject_id ?? null,
            is_active: !quiz.is_active,
            proctoring_mode: quiz.proctoring_mode,
        };
        updateQuiz.mutate(
            { id: quiz.id, data: payload },
            {
                onSettled: () => setTogglingQuizId(null),
                onSuccess: () =>
                    toast.success(
                        payload.is_active ? 'Test faollashtirildi' : "Test faol emas holatga o'tkazildi",
                    ),
                onError: (error: unknown) => {
                    // Savoli yetmagan testni yoqishni bekend 409 bilan rad
                    // etadi va sababini aytadi — aynan shuni ko'rsatamiz,
                    // aks holda nega ishlamagani tushunarsiz qolardi.
                    const response = (
                        error as { response?: { status?: number; data?: { detail?: { message?: string } } } }
                    )?.response;
                    if (response?.status === 409 && response.data?.detail?.message) {
                        toast.error(response.data.detail.message);
                        return;
                    }
                    toast.error('Test holatini yangilashda xatolik yuz berdi');
                },
            },
        );
    };
    // Dars savollari. Test aynan shulardan yigʻiladi, shuning uchun
    // oʻqituvchi ularni shu yerda, dars ichida koʻrishi kerak: avval
    // ular faqat umumiy «Savollar» bankida koʻrinardi.
    const lessonQuestionsQuery = useLessonQuestions(
        canSeeQuestions && lessonId ? lessonId : undefined,
    );

    if (lessonQuery.isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-2/3" /><Skeleton className="aspect-video w-full rounded-2xl" /></div>;
    if (lessonQuery.isError) return <ErrorState onRetry={() => lessonQuery.refetch()} />;
    const lesson = lessonQuery.data;
    if (!lesson) return <EmptyState title="Dars topilmadi" description="Bu dars mavjud emas." />;

    const resources = resourcesQuery.data?.resources ?? [];
    const video = resources.find((item) => item.resource_type === 'video');
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
    const canAddQuestion = hasPermission('create:question');
    const quizzes = quizzesQuery.data?.quizzes ?? [];
    const quizSummary = new Map(
        (quizSummaryQuery.data?.items ?? []).map((item) => [item.quiz_id, item]),
    );
    const lessonQuestions = lessonQuestionsQuery.data?.questions ?? [];
    // Excel oynasi fan nomini ko'rsatishi uchun — dars javobida nom bor,
    // ro'yxat esa tanlanmagan holat uchun zaxira.
    const lessonSubjectId = lesson.teacher_subject?.subject_id;
    const lessonSubjectName = lesson.teacher_subject?.subject?.name;

    // ── Tablar ───────────────────────────────────────────────────────────
    //
    // Ilgari sakkizta karta ketma-ket turardi va Davomat yuqoridan ikkinchi
    // bo'lib chiqardi: o'qituvchi darsga kirishi bilan jurnalni ko'rar, dars
    // mazmuni esa pastda qolardi. Endi birinchi tab — darsning o'zi.
    // Yuz nazorati endi darsda emas — «Zoom» sahifasidagi seansda (o'z hisoboti bilan).
    const canReadAttendance = canManageContent && hasPermission('read:attendance');
    // Davomat yashirilgan bo'lsa ham tab yuz nazorati hisoboti uchun qoladi.
    const canSeeAttendance = canReadAttendance && ATTENDANCE_ENABLED;
    // «Topshiriqlar» — talaba nima qilishi kerak: uy vazifasi, testlar va
    // savollar. «Baholash jurnali» — shularning natijasi: kim topshirdi,
    // qancha baho oldi. Jurnal faqat baho qo'yadiganlarga.
    const canSeeGrading = canGrade;

    const tabs: TabDef<LessonTab>[] = [
        { id: 'info', label: "Dars ma'lumoti", icon: <BookOpen className="h-4 w-4" /> },
        { id: 'tasks', label: 'Topshiriqlar', icon: <ClipboardList className="h-4 w-4" /> },
        ...(canSeeGrading
            ? [{ id: 'grading' as const, label: 'Baholash jurnali', icon: <ListChecks className="h-4 w-4" /> }]
            : []),
        ...(canSeeAttendance
            ? [{ id: 'attendance' as const, label: 'Davomat', icon: <ClipboardCheck className="h-4 w-4" /> }]
            : []),
    ];
    const activeTab = tabs.some((t) => t.id === tab) ? tab : 'info';

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/courses/${lesson.course_id}`)} className="-ml-2"><ArrowLeft className="mr-2 h-4 w-4" /> Kursga qaytish</Button>
                <PageHeader title={lesson.topic} description={[formatDate(lesson.date), lesson.teacher_subject?.subject?.name, lesson.group?.name].filter(Boolean).join(' · ')} />
                {lesson.description && <p className="max-w-4xl text-sm leading-6 text-foreground/80">{lesson.description}</p>}
            </div>

            <TabBar tabs={tabs} active={activeTab} onChange={setTab} />

            {/* ── Dars ma'lumoti ──────────────────────────────────────── */}
            {activeTab === 'info' && (
            <div className="space-y-6">
            <SectionCard
                icon={<Paperclip className="h-[18px] w-[18px]" />}
                tone="orange"
                title="Asosiy materiallar"
                description={extras.length > 0 ? `${extras.length} ta havola va hujjat` : undefined}
                action={canManageContent && <CardAction variant="outline" onClick={() => setContentKinds(['file', 'link'])} icon={<Plus className="h-4 w-4" />} label="Material qo'shish" />}
            >
                {extras.length === 0 ? <EmptyState icon={<Paperclip className="h-6 w-6" />} title="Material yo'q" description="Hozircha kitob, hujjat yoki havola qo'shilmagan." className="py-8" /> : <div className="grid gap-3 sm:grid-cols-2">{extras.map((item) => <div key={item.id} className="group/item flex items-center gap-3 rounded-xl border border-border/60 p-3.5 transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_6px_16px_-8px_rgba(16,24,40,0.2)]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.resource_type === 'file' ? <FileText className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}</span><a href={item.file_url || item.link_url || '#'} {...(item.file_url ? { download: downloadName(item.title, item.file_url) } : {})} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium transition-colors hover:text-primary">{item.title}</a><ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover/item:translate-x-0.5 group-hover/item:text-primary" />{canManageContent && <button onClick={() => setResourceToRename({ id: item.id, title: item.title })} aria-label="Material nomini tahrirlash" title="Nomini tahrirlash" className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"><Pencil className="h-4 w-4" /></button>}{canManageContent && <button onClick={() => setResourceToDelete({ id: item.id, title: item.title })} aria-label="Materialni o'chirish" className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/item:opacity-100"><Trash2 className="h-4 w-4" /></button>}</div>)}</div>}
            </SectionCard>

            <SectionCard
                icon={<VideoIcon className="h-[18px] w-[18px]" />}
                tone="blue"
                title="Dars videosi"
                action={canManageContent && (
                    video
                        ? <CardAction variant="ghost" className="text-destructive" onClick={() => setResourceToDelete({ id: video.id, title: video.title || 'Dars videosi' })} icon={<Trash2 className="h-4 w-4" />} label="Videoni olib tashlash" />
                        : <CardAction onClick={() => setContentKinds(['video'])} icon={<Plus className="h-4 w-4" />} label="YouTube havolasi" />
                )}
            >
                {embedUrl ? <div className="aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-border/60"><iframe className="h-full w-full" src={embedUrl} title={video?.title ?? lesson.topic} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
                    /* Yaroqsiz havola (yangi tekshiruvdan oldin saqlangan yozuv) oddiy
                       havolaga aylanib ketmaydi: pleyer ochilmagani ko'rinib tursin,
                       aks holda buni hech kim tuzatmaydi. */
                    : video?.link_url ? <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4"><p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4 shrink-0" /> Havola YouTube videosiga o'xshamaydi — pleyer ochilmadi.</p><a href={video.link_url} target="_blank" rel="noreferrer" className="group/link inline-flex items-center gap-2 break-all text-sm font-medium text-primary hover:underline">{video.title || video.link_url} <ExternalLink className="h-4 w-4 shrink-0 transition-transform group-hover/link:translate-x-0.5" /></a>{canManageContent && <p className="text-xs text-muted-foreground">Videoni olib tashlab, to'g'ri YouTube havolasini qo'shing.</p>}</div>
                    : <EmptyState icon={<VideoIcon className="h-6 w-6" />} title="Video qo'shilmagan" description="Bu darsni video bo'lmasdan ham o'qish mumkin." className="py-8" />}
            </SectionCard>


            </div>
            )}

            {/* ── Davomat ─────────────────────────────────────────────── */}
            {activeTab === 'attendance' && canSeeAttendance && (
                <div className="space-y-6">
                    <SectionCard icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone="teal" title="Davomat">
                        <LessonAttendancePanel lessonId={lesson.id} />
                    </SectionCard>
                </div>
            )}

            {/* ── Topshiriqlar ────────────────────────────────────────── */}
            {activeTab === 'tasks' && (
            <div className="space-y-6">
            <SectionCard
                icon={<ClipboardCheck className="h-[18px] w-[18px]" />}
                tone="green"
                title="Uy vazifasi"
                action={canManageHomework && (
                    homework ? (
                        <div className="flex shrink-0 gap-1.5">
                            <CardAction variant="outline" onClick={() => { setEditingHomework(homework); setHomeworkOpen(true); }} icon={<Pencil className="h-4 w-4" />} label="Tahrirlash" />
                            {(homework.stats?.submitted ?? 0) === 0 && <CardAction variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setHomeworkToDelete(homework)} icon={<Trash2 className="h-4 w-4" />} label="O'chirish" />}
                        </div>
                    ) : (
                        <CardAction onClick={() => { setEditingHomework(null); setHomeworkOpen(true); }} icon={<Plus className="h-4 w-4" />} label="Uy vazifasi berish" />
                    )
                )}
            >
                {homework ? (
                    <LessonHomeworkCard homework={homework} canGrade={canGrade} canManage={canManageHomework} canSubmit={canSubmitHomework} />
                ) : (
                    <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="Uy vazifasi yo'q" description="Bu dars uchun uy vazifasi berilmagan." className="py-8" />
                )}
            </SectionCard>

            {/* Testlar va savollar ataylab IKKI karta. Ilgari ular bitta
                kartada edi va savollar ro'yxati tepada turardi: o'qituvchi
                savol qo'shgani sayin testlar pastga suriladi va ularni
                ko'rish uchun butun bankni aylantirish kerak bo'lardi.
                Testlar birinchi — ular kundalik ishda tez-tez kerak
                bo'ladi (yoqish, PIN aytish, holatni ko'rish). */}
            {canSeeQuizzes && <SectionCard
                icon={<ListChecks className="h-[18px] w-[18px]" />}
                tone="blue"
                title="Testlar"
                description={
                    quizzes.length > 0
                        ? `${quizzes.length} ta test`
                        : 'Dars savollaridan test tuziladi'
                }
                action={
                    canManageQuiz && (
                        <CardAction
                            onClick={() => { setEditingQuiz(null); setQuizOpen(true); }}
                            icon={<Plus className="h-4 w-4" />}
                            label="Test yaratish"
                        />
                    )
                }
            >
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
                                    {/* Yakun: nechta topshirdi va o'rtacha baho.
                                        Maxraj — test guruhlaridagi talabalar soni,
                                        shuning uchun kim qolgani ham ko'rinadi. */}
                                    {(() => {
                                        const summary = quizSummary.get(quiz.id);
                                        if (!summary) return null;
                                        return (
                                            <p className="mt-1 text-xs tabular-nums">
                                                <span className={summary.submitted_count > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                                                    {summary.submitted_count}/{summary.total_students} topshirdi
                                                </span>
                                                {summary.average_grade != null && (
                                                    <span className="text-muted-foreground">
                                                        {' '}· o'rtacha {summary.average_grade}
                                                    </span>
                                                )}
                                            </p>
                                        );
                                    })()}
                                </div>
                                {canManageQuiz ? (
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Switch
                                            checked={quiz.is_active}
                                            onCheckedChange={() => toggleQuizActive(quiz)}
                                            disabled={togglingQuizId === quiz.id || updateQuiz.isPending}
                                            aria-label={quiz.is_active ? "Testni o'chirish" : 'Testni faollashtirish'}
                                        />
                                        <span className={quiz.is_active ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400' : 'text-xs text-muted-foreground'}>
                                            {quiz.is_active ? 'Faol' : 'Faol emas'}
                                        </span>
                                    </div>
                                ) : (
                                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${quiz.is_active ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400' : 'bg-muted text-muted-foreground ring-border'}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${quiz.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                                        {quiz.is_active ? 'Faol' : 'Faol emas'}
                                    </span>
                                )}
                                {canSeeResults && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0 gap-1.5"
                                        onClick={() => navigate(`/quizzes/${quiz.id}?return_to=/lessons/${lesson.id}`)}
                                    >
                                        <BarChart3 className="h-4 w-4" />
                                        <span>Natijalar</span>
                                    </Button>
                                )}
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

            {canTakeQuizzes && (() => {
                const activeQuizzes = activeLessonQuizzesQuery.data?.quizzes ?? [];
                return (
                    <SectionCard
                        icon={<ListChecks className="h-[18px] w-[18px]" />}
                        tone="blue"
                        title="Testlar"
                        description={activeQuizzes.length > 0 ? `${activeQuizzes.length} ta faol test` : undefined}
                    >
                        {activeLessonQuizzesQuery.isLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                        ) : activeQuizzes.length === 0 ? (
                            <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Faol test yo'q" description="O'qituvchi testni faollashtirganda shu yerda ko'rinadi." className="py-8" />
                        ) : (
                            <div className="space-y-3">
                                {activeQuizzes.map((quiz) => (
                                    <div key={quiz.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3.5 transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_6px_16px_-8px_rgba(16,24,40,0.2)]">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <ListChecks className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold">{quiz.title}</p>
                                            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                                                {QUIZ_TYPE_LABELS[quiz.quiz_type ?? 'LESSON_QUIZ']} · {quiz.question_number} savol · {quiz.duration} daqiqa
                                            </p>
                                        </div>
                                        {/* Test sahifasi testni o'z ro'yxatidan qidiradi, u esa
                                            sahifalangan — test birinchi sahifada bo'lmasa oyna
                                            ochilmasdi. Shuning uchun testni `state` da uzatamiz. */}
                                        <Button
                                            size="sm"
                                            className="shrink-0 gap-1.5"
                                            onClick={() => navigate(`/quiz-test?quizId=${quiz.id}`, { state: { quiz } })}
                                        >
                                            <PlayCircle className="h-4 w-4" />
                                            <span>Boshlash</span>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </SectionCard>
                );
            })()}

            {canSeeQuestions && <SectionCard
                icon={<FileQuestion className="h-[18px] w-[18px]" />}
                tone="purple"
                title="Savollar"
                description={
                    lessonQuestions.length > 0
                        ? `${lessonQuestions.length} ta savol · test aynan shulardan yig'iladi`
                        : 'Test shu darsning savollaridan yig\'iladi'
                }
                action={
                    canAddQuestion && (
                        <div className="flex flex-wrap gap-2">
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
                        </div>
                    )
                }
            >
                {lessonQuestions.length === 0 ? (
                    <EmptyState
                        icon={<FileQuestion className="h-6 w-6" />}
                        title="Savol qo'shilmagan"
                        description="Savol qo'shing yoki Excel'dan yuklang — test shu savollardan tuziladi."
                        className="py-8"
                    />
                ) : (
                    <QuestionAccordionList
                        questions={lessonQuestions}
                        canManage={canAddQuestion}
                        returnTo={`/lessons/${lesson.id}`}
                    />
                )}
            </SectionCard>}
            </div>
            )}

            {/* ── Baholash jurnali ────────────────────────────────────── */}
            {activeTab === 'grading' && canSeeGrading && (
                <SectionCard icon={<ListChecks className="h-[18px] w-[18px]" />} tone="green" title="Baholash jurnali" description="Uy vazifasi va testlar bo'yicha har bir talabaning bahosi">
                    <LessonGradebook lessonId={lesson.id} onCreateTask={() => setTab('tasks')} />
                </SectionCard>
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
                lessonId={lesson.id}
            />
            <AssignmentFormModal isOpen={homeworkOpen} onClose={() => setHomeworkOpen(false)} courseId={lesson.course_id} lessonId={lesson.id} editing={editingHomework} />
            <ConfirmDialog
                isOpen={homeworkToDelete !== null}
                onClose={() => setHomeworkToDelete(null)}
                onConfirm={() => {
                    if (!homeworkToDelete) return;
                    deleteAssignment.mutate(homeworkToDelete.id, { onSettled: () => setHomeworkToDelete(null) });
                }}
                title="Uy vazifasini o'chirish"
                description={`«${homeworkToDelete?.title ?? ''}» vazifasi o‘chiriladi. Talaba javobi yuklangan vazifani o‘chirib bo‘lmaydi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
                isLoading={deleteAssignment.isPending}
            />
            <RenameResourceModal lessonId={lesson.id} resource={resourceToRename} onClose={() => setResourceToRename(null)} />
            <ConfirmDialog
                isOpen={resourceToDelete !== null}
                onClose={() => setResourceToDelete(null)}
                onConfirm={() => {
                    if (!resourceToDelete) return;
                    deleteResource.mutate(resourceToDelete.id, { onSettled: () => setResourceToDelete(null) });
                }}
                title="Materialni o'chirish"
                description={`«${resourceToDelete?.title ?? ''}» o'chiriladi. Bu amalni bekor qilib bo'lmaydi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
                isLoading={deleteResource.isPending}
            />
        </div>
    );
}


/**
 * Yuklab olinadigan fayl nomi. Material nomi qo'lda o'zgartirilgan bo'lsa
 * (masalan, «Atmosfera»), unda kengaytma bo'lmaydi va brauzer faylni
 * ochib bo'lmaydigan nom bilan saqlaydi — kengaytma URL dan olinadi.
 */
function downloadName(title: string, url: string): string {
    const ext = url.split(/[?#]/)[0].match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '';
    return ext && !title.toLowerCase().endsWith(ext.toLowerCase()) ? `${title}${ext}` : title;
}

/** Material nomini tahrirlash oynasi. */
function RenameResourceModal({ lessonId, resource, onClose }: { lessonId: number; resource: { id: number; title: string } | null; onClose: () => void }) {
    const updateResource = useUpdateResource(lessonId);
    const [title, setTitle] = useState('');
    const [error, setError] = useState('');
    const [openedFor, setOpenedFor] = useState<number | null>(null);

    // Oyna boshqa material uchun ochilganda maydon uning joriy nomi bilan to'ladi.
    if (resource && resource.id !== openedFor) {
        setOpenedFor(resource.id);
        setTitle(resource.title);
        setError('');
    }
    if (!resource && openedFor !== null) setOpenedFor(null);

    const submit = () => {
        if (!resource) return;
        const next = title.trim();
        if (!next) { setError('Nomini kiriting'); return; }
        if (next === resource.title) { onClose(); return; }
        setError('');
        updateResource.mutate(
            { id: resource.id, data: { title: next } },
            {
                onSuccess: onClose,
                onError: (cause) => setError(apiErrorMessage(cause, 'Saqlashda xatolik')),
            },
        );
    };

    const saving = updateResource.isPending;
    return (
        <Modal isOpen={resource !== null} onClose={() => { if (!saving) onClose(); }} title="Material nomini tahrirlash">
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                <div>
                    <label className="mb-1 block text-sm font-medium">Nomi</label>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Material nomi" maxLength={255} autoFocus />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Bekor qilish</Button>
                    <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Saqlash</Button>
                </div>
            </form>
        </Modal>
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
    ];
    const options = ALL_OPTIONS.filter((option) => (kinds ?? []).includes(option.value));

    // Oyna ochilganda tur chaqirgan blokka moslanadi.
    useEffect(() => {
        if (kinds?.length) setKind(kinds[0]);
    }, [kinds]);

    const submit = async () => {
        // Havola bekendda ham tekshiriladi; bu yerda — maydon yonida va so'rov
        // ketmasdan oldin, o'qituvchi nimani tuzatish kerakligini ko'rsin.
        if (kind === 'video' && !youtubeVideoId(url)) { setError(YOUTUBE_LINK_ERROR); return; }
        // `javascript:` va `data:` havolalari shu yerda to'xtaydi. Ular bazaga
        // tushsa, sahifada ularni faqat React to'sadi — eksportda yoki pochta
        // xabarida esa hech kim to'smaydi.
        let safeLink: string | undefined;
        if (kind === 'link') {
            safeLink = normalizeExternalUrl(url) ?? undefined;
            if (!safeLink) { setError(EXTERNAL_LINK_ERROR); return; }
        }
        setSaving(true); setError('');
        try {
            let fileUrl: string | undefined;
            if (kind === 'file' && file) fileUrl = (await resourceService.upload(file)).url;
            else if (kind === 'file' && libraryFile) fileUrl = libraryFile.url;
            await createResource.mutateAsync({ lesson_id: lessonId, resource_type: kind, title: title.trim() || file?.name || libraryFile?.title || (kind === 'text' ? 'Dars konspekti' : kind === 'video' ? 'Dars videosi' : 'Material'), file_url: fileUrl, link_url: safeLink ?? (url.trim() || undefined), text_content: text.trim() || undefined });
            setTitle(''); setUrl(''); setText(''); setFile(null); setLibraryFile(null); onClose();
        } catch (cause) { setError(apiErrorMessage(cause, 'Saqlashda xatolik')); }
        finally { setSaving(false); }
    };

    const modalTitle = options.length === 1 ? options[0].label : 'Dars materiali';

    return <Modal isOpen={kinds !== null} onClose={onClose} title={modalTitle}><div className="space-y-4">
        {/* Tanlov faqat bir nechta tur bo'lganda ko'rsatiladi. */}
        {options.length > 1 && <div className="flex flex-wrap gap-2">{options.map((option) => <Button key={option.value} size="sm" variant={kind === option.value ? 'primary' : 'outline'} onClick={() => { setKind(option.value); setError(''); }}>{option.label}</Button>)}</div>}
        {/* Video nomi avtomatik qo'yiladi — ortiqcha maydon so'ralmaydi. */}
        {kind !== 'video' && <div><label className="mb-1 block text-sm font-medium">Nomi</label><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Material nomi" /></div>}
        {kind === 'text' && <textarea className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} placeholder="Dars skripti yoki konspekti..." />}
        {kind === 'link' && <div><Input value={url} onChange={(event) => { setUrl(event.target.value); setError(''); }} placeholder="https://..." /><p className="mt-1.5 text-xs text-muted-foreground">Faqat http:// yoki https:// havolasi qabul qilinadi.</p></div>}
        {kind === 'video' && <div><Input value={url} onChange={(event) => { setUrl(event.target.value); setError(''); }} placeholder="https://www.youtube.com/watch?v=..." /><p className="mt-1.5 text-xs text-muted-foreground">Video fayl yuklab bo'lmaydi — faqat YouTube havolasi (youtube.com yoki youtu.be).</p></div>}
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
