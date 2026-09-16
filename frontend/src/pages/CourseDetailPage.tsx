import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowLeft,
    BookOpen,
    ChevronRight,
    ClipboardCheck,
    FolderOpen,
    Clock3,
    GripVertical,
    Pencil,
    Plus,
    Trash2,
    UserRound,
} from 'lucide-react';
import { useCourse } from '@/hooks/useCourses';
import { useDeleteLesson, useLessons } from '@/hooks/useLessons';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { CardAction } from '@/components/ui/CardAction';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CourseLessonModal } from '@/components/courses/CourseLessonModal';
import { CourseAttendanceJournal } from '@/components/courses/CourseAttendanceJournal';
import { TabBar, type TabDef } from '@/components/ui/TabBar';
import { CourseFileLibrary } from '@/components/courses/CourseFileLibrary';
import type { Lesson } from '@/services/lessonService';
import { semesterLabel } from '@/utils/semester';
import { isYoutubeUrl } from '@/utils/youtube';
import { courseTypeLabel } from '@/services/courseTypes';

export default function CourseDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const courseId = id ? Number.parseInt(id, 10) : undefined;
    const canReadLessons = hasPermission('read:lesson');
    // Jurnal o'qituvchi va adminniki: talabada `read:attendance` yo'q.
    const canReadAttendance = hasPermission('read:attendance');

    // Ochilganda doim darslar: kursga kirgan o'qituvchi avval nima o'tilganini
    // ko'rishi kerak, jurnal esa alohida qadam.
    const [tab, setTab] = useState<'lessons' | 'attendance' | 'library'>('lessons');
    const [lessonModalOpen, setLessonModalOpen] = useState(false);
    const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
    const [deletingLesson, setDeletingLesson] = useState<Lesson | null>(null);
    // Bekend 409 bilan «nima yo'qoladi» ro'yxatini qaytaradi — uni ko'rsatib,
    // ikkinchi bosishda `force` bilan yuboramiz.
    const [lessonCascadeWarnings, setLessonCascadeWarnings] = useState<string[]>([]);

    const courseQuery = useCourse(courseId);
    const lessonsQuery = useLessons(
        courseId ? { course_id: courseId, page: 1, limit: 500 } : undefined,
        Boolean(courseId && canReadLessons),
    );
    const deleteLesson = useDeleteLesson();

    // Darslar sana bo'yicha keladi — kursning o'tilish tartibi shu.
    const lessons = lessonsQuery.data?.lessons ?? [];

    if (!courseId || Number.isNaN(courseId)) {
        return <EmptyState title="Kurs topilmadi" description="Kurs identifikatori noto'g'ri." />;
    }

    if (courseQuery.isLoading) {
        return (
            <div className="space-y-5">
                <Skeleton className="h-8 w-72" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
        );
    }

    if (courseQuery.isError) return <ErrorState onRetry={() => courseQuery.refetch()} />;
    const course = courseQuery.data;
    if (!course) return <EmptyState title="Kurs topilmadi" description="Bu kurs o'chirilgan yoki mavjud emas." />;

    // Arxivdagi kurs faqat o'qish uchun: jurnal va materiallar joyida qoladi,
    // lekin unga yangi dars qo'shish ma'nosiz — u yuklamada endi yo'q.
    const isArchived = !course.is_active;
    const canCreateLessons = hasPermission('create:lesson') && !isArchived;
    const canUpdateLessons = hasPermission('update:lesson') && !isArchived;
    const canDeleteLessons = hasPermission('delete:lesson') && !isArchived;

    // ── Tablar ───────────────────────────────────────────────────────────
    //
    // Ilgari darslar va davomat jurnali ketma-ket turardi: uzun kursda jurnal
    // ekran pastida qolib, uni topish uchun butun dars ro'yxatini aylanish
    // kerak bo'lardi. Huquqi bo'lmagan tab chizilmaydi (talabada jurnal yo'q),
    // bitta tab qolganda esa panel umuman ko'rinmaydi.
    const tabs: TabDef<'lessons' | 'attendance' | 'library'>[] = [
        ...(canReadLessons
            ? [{ id: 'lessons' as const, label: 'Darslar', icon: <BookOpen className="h-4 w-4" /> }]
            : []),
        ...(canReadAttendance
            ? [{ id: 'attendance' as const, label: 'Davomat jurnali', icon: <ClipboardCheck className="h-4 w-4" /> }]
            : []),
        // Kutubxona darslar bilan bir huquqda: u kursning materiali va
        // kursni ko'ra oladigan har kimga (talabaga ham) ochiq.
        ...(canReadLessons
            ? [{ id: 'library' as const, label: 'Kutubxona', icon: <FolderOpen className="h-4 w-4" /> }]
            : []),
    ];
    // Tanlangan tab huquq bilan yo'qolib qolgan bo'lsa, birinchisiga qaytamiz.
    const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? 'lessons';

    const openNewLesson = () => {
        setEditingLesson(null);
        setLessonModalOpen(true);
    };

    const confirmDeleteLesson = async () => {
        if (!deletingLesson) return;
        try {
            await deleteLesson.mutateAsync({
                id: deletingLesson.id,
                force: lessonCascadeWarnings.length > 0,
            });
            toast.success("Dars o'chirildi");
            setDeletingLesson(null);
            setLessonCascadeWarnings([]);
        } catch (cause) {
            const response = (cause as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
            const detail = response?.data?.detail;
            if (
                response?.status === 409
                && detail
                && typeof detail === 'object'
                && (detail as { requires_confirmation?: boolean }).requires_confirmation
            ) {
                setLessonCascadeWarnings((detail as { warnings?: string[] }).warnings ?? []);
                return;
            }
            toast.error(typeof detail === 'string' ? detail : "Darsni o'chirishda xatolik");
        }
    };

    const renderLesson = (lesson: Lesson, index: number) => {
        const video = lesson.resources?.find((resource) => resource.resource_type === 'video');
        const isYoutube = isYoutubeUrl(video?.link_url);
        return (
            // Qator <button> emas: ichida tahrirlash/o'chirish tugmalari bor,
            // ichma-ich <button> esa yaroqsiz HTML.
            <div
                key={lesson.id}
                className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card px-3 py-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_6px_16px_-6px_rgba(16,24,40,0.18)] sm:px-4"
            >
                {/* Chap chetdagi urg'u chizig'i — faqat hover'da chiqadi va
                    qatorni ro'yxat ichida ajratib ko'rsatadi. */}
                <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-200 group-hover:scale-y-100"
                />
                <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60 sm:block" />
                <button
                    type="button"
                    onClick={() => navigate(`/lessons/${lesson.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                {/* Tartib raqami: dumaloq va kontrastli — ro'yxatda ko'z avval
                    shunga tushadi, hover'da esa to'liq primary rangga o'tadi. */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary ring-1 ring-inset ring-primary/20 transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary">
                    {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">{lesson.topic}</span>
                {video && (
                    <span className={`hidden shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset sm:inline-flex ${
                        isYoutube
                            ? 'bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400'
                            : 'bg-primary/10 text-primary ring-primary/20'
                    }`}>
                        {isYoutube ? 'YouTube' : 'Video dars'}
                    </span>
                )}
                {lesson.duration_minutes && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        {lesson.duration_minutes} daq
                    </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
                {canUpdateLessons && (
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Darsni tahrirlash"
                        onClick={() => {
                            setEditingLesson(lesson);
                            setLessonModalOpen(true);
                        }}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                )}
                {canDeleteLessons && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Darsni o'chirish"
                        onClick={() => setDeletingLesson(lesson)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-5">
            <Button variant="ghost" size="sm" onClick={() => navigate('/courses')} className="-ml-2">
                <ArrowLeft className="h-4 w-4" />
                Kurslarga qaytish
            </Button>

            <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <BookOpen className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap gap-2">
                            {course.groups.map((group) => (
                                <span key={group.id} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                    {group.name}
                                </span>
                            ))}
                        </div>
                        <h1 className="page-title">{course.name}</h1>
                        {isArchived && (
                            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                Arxivda — EPOS yuklamasida bu kurs yo'q
                            </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{course.teacher?.full_name || course.teacher?.username}</span>
                            {course.kafedra?.name && <><span>·</span><span>{course.kafedra.name}</span></>}
                            {courseTypeLabel(course.course_type) && (
                                <><span>·</span><span>{courseTypeLabel(course.course_type)}</span></>
                            )}
                            {course.semester_number && <><span>·</span><span className="capitalize">{semesterLabel(course.semester_number)}</span></>}
                            <><span>·</span><span>{lessons.length} ta dars</span></>
                        </div>
                    </div>
                </div>
            </section>

            <TabBar tabs={tabs} active={activeTab} onChange={setTab} />

            {activeTab === 'lessons' && canReadLessons && (
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3 px-0.5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Darslar</h2>
                        {canCreateLessons && (
                            <CardAction
                                onClick={openNewLesson}
                                icon={<Plus className="h-4 w-4" />}
                                label="Dars qo'shish"
                            />
                        )}
                    </div>

                    {lessonsQuery.isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 rounded-2xl" />)}
                        </div>
                    ) : lessonsQuery.isError ? (
                        <ErrorState onRetry={() => { void lessonsQuery.refetch(); }} />
                    ) : lessons.length === 0 ? (
                        <div className="rounded-2xl border border-border/60 bg-card py-8">
                            <EmptyState
                                icon={<BookOpen className="h-6 w-6" />}
                                title="Darslar yo'q"
                                description="Birinchi darsni qo'shing — ular o'tilgan sana bo'yicha tartiblanadi."
                            />
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {lessons.map(renderLesson)}
                        </div>
                    )}
                </section>
            )}

            {activeTab === 'attendance' && canReadAttendance && (
                <section className="space-y-3">
                    <h2 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Davomat jurnali</h2>
                    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                        <CourseAttendanceJournal courseId={course.id} />
                    </div>
                </section>
            )}

            {activeTab === 'library' && canReadLessons && (
                <section className="space-y-3">
                    <h2 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Kurs kutubxonasi
                    </h2>
                    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                        <CourseFileLibrary courseId={course.id} />
                    </div>
                </section>
            )}

            <CourseLessonModal
                isOpen={lessonModalOpen}
                onClose={() => { setLessonModalOpen(false); setEditingLesson(null); }}
                course={course}
                lesson={editingLesson}
            />
            <ConfirmDialog
                isOpen={Boolean(deletingLesson)}
                onClose={() => { setDeletingLesson(null); setLessonCascadeWarnings([]); }}
                onConfirm={() => void confirmDeleteLesson()}
                title="Darsni o'chirish"
                description={
                    lessonCascadeWarnings.length > 0
                        ? `${lessonCascadeWarnings.join('; ')}. Baribir o'chirilsinmi?`
                        : `"${deletingLesson?.topic ?? ''}" darsi o'chiriladi. Unga biriktirilgan resurslar va uy vazifasi ham yo'qoladi. Testlar o'chmaydi — ular darsdan uziladi va faolligi so'ndiriladi, natijalar saqlanib qoladi.`
                }
                confirmText={lessonCascadeWarnings.length > 0 ? "Ha, o'chirilsin" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
}
