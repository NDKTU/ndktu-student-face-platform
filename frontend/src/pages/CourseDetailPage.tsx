import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Award,
    BookOpen,
    ChevronRight,
    ClipboardCheck,
    FileStack,
    FolderOpen,
    Clock3,
    Info,
    ListChecks,
    MessagesSquare,
    Pencil,
    Play,
    Plus,
    Search,
    Trash2,
    UserRound,
} from 'lucide-react';
import { useCourse } from '@/hooks/useCourses';
import { useDeleteLesson, useLessons } from '@/hooks/useLessons';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CourseLessonModal } from '@/components/courses/CourseLessonModal';
import { CourseAttendanceJournal } from '@/components/courses/CourseAttendanceJournal';
import { MyCourseGrades } from '@/components/courses/MyCourseGrades';
import { CourseGradebook } from '@/components/courses/CourseGradebook';
import { ATTENDANCE_ENABLED } from '@/constants/features';
import { TabBar, type TabDef } from '@/components/ui/TabBar';
import { CourseFileLibrary } from '@/components/courses/CourseFileLibrary';
import { CourseChat } from '@/components/courses/CourseChat';
import type { Lesson } from '@/services/lessonService';
import { semesterLabel } from '@/utils/semester';
import { isYoutubeUrl } from '@/utils/youtube';
import { courseTypeLabel } from '@/services/courseTypes';
import { initialsOf } from '@/lib/avatarTiles';
import './CourseDetailPage.css';

type CourseTab = 'lessons' | 'grades' | 'gradebook' | 'attendance' | 'library' | 'documents' | 'chat';

export default function CourseDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const courseId = id ? Number.parseInt(id, 10) : undefined;
    const canReadLessons = hasPermission('read:lesson');
    // Jurnal o'qituvchi va adminniki: talabada `read:attendance` yo'q.
    const canReadAttendance = ATTENDANCE_ENABLED && hasPermission('read:attendance');
    // «Baholarim» — faqat talabaga: o'qituvchida ham `create:submission` bor,
    // lekin u vazifa beradi, topshirmaydi (dars sahifasidagi qoida bilan bir xil).
    const isStudent = hasPermission('create:submission') && !hasPermission('create:homework');
    // Baholash jurnali — baho qo'yadiganlarga (dars sahifasidagi jurnal bilan
    // bir xil huquq). Kimning kursi ekanini bekend tekshiradi.
    const canSeeGradebook = hasPermission('update:submission');
    const canReadCourse = hasPermission('read:course');

    // Ochilganda doim darslar: kursga kirgan o'qituvchi avval nima o'tilganini
    // ko'rishi kerak, jurnal esa alohida qadam.
    const [tab, setTab] = useState<CourseTab>('lessons');
    const [lessonModalOpen, setLessonModalOpen] = useState(false);
    const [lessonSearch, setLessonSearch] = useState('');
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
    const visibleLessons = lessons
        .map((lesson, index) => ({ lesson, index }))
        .filter(({ lesson }) => lesson.topic.toLocaleLowerCase().includes(lessonSearch.trim().toLocaleLowerCase()));

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
    const courseTitle = course.subject?.name || course.name;
    const teacherName = course.teacher?.full_name || course.teacher?.username || "O'qituvchi ko'rsatilmagan";

    // Arxivdagi kurs faqat o'qish uchun: jurnal va materiallar joyida qoladi,
    // lekin unga yangi dars qo'shish ma'nosiz — u yuklamada endi yo'q.
    const isArchived = !course.is_active;
    const canCreateLessons = hasPermission('create:lesson') && !isArchived;
    const canUpdateLessons = hasPermission('update:lesson') && !isArchived;
    const canDeleteLessons = hasPermission('delete:lesson') && !isArchived;
    const canAddLibraryFiles = hasPermission('create:resource') && !isArchived;
    const canEditLibraryFiles = hasPermission('update:resource') && !isArchived;
    const canRemoveLibraryFiles = hasPermission('delete:resource') && !isArchived;

    // ── Tablar ───────────────────────────────────────────────────────────
    //
    // Ilgari darslar va davomat jurnali ketma-ket turardi: uzun kursda jurnal
    // ekran pastida qolib, uni topish uchun butun dars ro'yxatini aylanish
    // kerak bo'lardi. Huquqi bo'lmagan tab chizilmaydi (talabada jurnal yo'q),
    // bitta tab qolganda esa panel umuman ko'rinmaydi.
    const tabs: TabDef<CourseTab>[] = [
        ...(canReadLessons
            ? [{ id: 'lessons' as const, label: 'Darslar', icon: <BookOpen className="h-4 w-4" /> }]
            : []),
        ...(isStudent
            ? [{ id: 'grades' as const, label: 'Baholarim', icon: <Award className="h-4 w-4" /> }]
            : []),
        ...(canSeeGradebook
            ? [{ id: 'gradebook' as const, label: 'Baholash jurnali', icon: <ListChecks className="h-4 w-4" /> }]
            : []),
        ...(canReadAttendance
            ? [{ id: 'attendance' as const, label: 'Davomat jurnali', icon: <ClipboardCheck className="h-4 w-4" /> }]
            : []),
        // Kutubxona darslar bilan bir huquqda: u kursning materiali va
        // kursni ko'ra oladigan har kimga (talabaga ham) ochiq.
        ...(canReadLessons
            ? [{ id: 'library' as const, label: 'Kutubxona', icon: <FolderOpen className="h-4 w-4" /> }]
            : []),
        // Fan hujjatlari (o'quv dastur, sillabus) — kutubxona bilan bir huquqda.
        ...(canReadLessons
            ? [{ id: 'documents' as const, label: 'Fan hujjatlari', icon: <FileStack className="h-4 w-4" /> }]
            : []),
        // Muloqot kursni ko'ra oladigan hammaga: o'qituvchi, assistent va
        // kurs guruhlari talabalari. Kimning kursi ekanini bekend tekshiradi.
        ...(canReadCourse
            ? [{ id: 'chat' as const, label: 'Muloqot', icon: <MessagesSquare className="h-4 w-4" /> }]
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
        const lessonType = lesson.lesson_type === 'independent'
            ? "Mustaqil ta'lim"
            : courseTypeLabel(lesson.lesson_type ?? course.course_type) ?? 'Dars';
        return (
            <div
                key={lesson.id}
                className="course-lesson-row group"
            >
                <button
                    type="button"
                    onClick={() => navigate(`/lessons/${lesson.id}`)}
                    className="course-lesson-link"
                >
                    <span className="course-lesson-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="course-lesson-text">
                        <span className="course-lesson-title">{lesson.topic}</span>
                        <span className="course-lesson-subtitle">{lessonType} · {String(index + 1).padStart(2, '0')}-mavzu</span>
                    </span>
                    <span className="course-lesson-badges">
                        <span className="course-lesson-type">{lessonType}</span>
                        {video && (
                            <span className={`course-lesson-video ${isYoutube ? 'is-youtube' : ''}`}>
                                <Play aria-hidden="true" size={10} fill="currentColor" />
                                Video
                            </span>
                        )}
                        {lesson.duration_minutes && (
                            <span className="course-lesson-duration"><Clock3 size={12} />{lesson.duration_minutes} daq</span>
                        )}
                    </span>
                    <ChevronRight className="course-lesson-chevron" size={18} />
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
        <div className="course-detail-page">
            <nav aria-label="Kurs yo'li" className="course-breadcrumb">
                <button type="button" onClick={() => navigate('/courses')}>Kurslar</button>
                <ChevronRight size={14} aria-hidden="true" />
                <span aria-current="page">{courseTitle}</span>
            </nav>

            <section className="course-hero" aria-labelledby="course-title">
                <svg className="course-hero-art" viewBox="0 0 470 220" fill="none" aria-hidden="true">
                    <path d="M8 142 108 87l91 45 74-85 105 37 71-70M108 87l15 117 76-72 120 50 59-98 71 86M273 47l46 135 130-12" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="199" cy="132" r="31" stroke="currentColor" />
                    <circle cx="378" cy="84" r="24" stroke="currentColor" />
                    <g fill="currentColor" stroke="none"><circle cx="108" cy="87" r="6"/><circle cx="199" cy="132" r="5"/><circle cx="273" cy="47" r="6"/><circle cx="319" cy="182" r="5"/><circle cx="378" cy="84" r="7"/><circle cx="449" cy="170" r="4"/></g>
                </svg>
                <div className="course-hero-content">
                    <span className="course-hero-eyebrow"><span />Fan kursi{course.semester_number ? ` · ${semesterLabel(course.semester_number)}` : ''}</span>
                    <h1 id="course-title">{courseTitle}</h1>
                    <p>{course.description || `${courseTitle} bo'yicha darslar va o'quv materiallari.`}</p>
                    <div className="course-hero-meta">
                        {course.semester_number && <span><Clock3 size={13} />{semesterLabel(course.semester_number)}</span>}
                        {courseTypeLabel(course.course_type) && <span><BookOpen size={13} />{courseTypeLabel(course.course_type)}</span>}
                        <span><ListChecks size={13} />{lessonsQuery.data?.total ?? course.lesson_count} ta dars</span>
                        {isArchived && <span>Arxivda</span>}
                    </div>
                </div>
            </section>

            <div className="course-detail-grid">
                <div className="course-detail-main">
                    <TabBar tabs={tabs} active={activeTab} onChange={setTab} className="course-detail-tabs" />

                    {activeTab === 'lessons' && canReadLessons && (
                        <section className="course-lessons-section">
                            <div className="course-section-heading">
                                <h2>Darslar</h2>
                                <p>Kursdagi barcha mavzular bir joyda</p>
                            </div>
                            <div className="course-lesson-toolbar">
                                <label className="course-lesson-search">
                                    <Search size={18} aria-hidden="true" />
                                    <input
                                        type="search"
                                        value={lessonSearch}
                                        onChange={(event) => setLessonSearch(event.target.value)}
                                        placeholder="Mavzu nomi bo'yicha qidirish..."
                                        aria-label="Darslarni mavzu bo'yicha qidirish"
                                    />
                                </label>
                                {canCreateLessons && (
                                    <Button onClick={openNewLesson} className="course-add-lesson">
                                        <Plus size={18} />Dars qo'shish
                                    </Button>
                                )}
                            </div>
                            {lessonsQuery.isLoading ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[76px] rounded-2xl" />)}
                                </div>
                            ) : lessonsQuery.isError ? (
                                <ErrorState onRetry={() => { void lessonsQuery.refetch(); }} />
                            ) : lessons.length === 0 ? (
                                <div className="course-lessons-empty">
                                    <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Darslar yo'q" description="Birinchi darsni qo'shing — ular o'tilgan sana bo'yicha tartiblanadi." />
                                </div>
                            ) : visibleLessons.length === 0 ? (
                                <div className="course-lessons-empty">
                                    <EmptyState icon={<Search className="h-6 w-6" />} title="Dars topilmadi" description="Boshqa mavzu nomi bilan qidirib ko'ring." />
                                </div>
                            ) : (
                                <div className="course-lesson-list">
                                    {visibleLessons.map(({ lesson, index }) => renderLesson(lesson, index))}
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

            {activeTab === 'grades' && isStudent && (
                <section className="space-y-3">
                    <h2 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Mavzular bo'yicha baholarim
                    </h2>
                    <MyCourseGrades courseId={course.id} />
                </section>
            )}

            {activeTab === 'gradebook' && canSeeGradebook && (
                <section className="space-y-3">
                    <h2 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Baholash jurnali — barcha darslar bo'yicha
                    </h2>
                    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                        <CourseGradebook courseId={course.id} />
                    </div>
                </section>
            )}

            {activeTab === 'library' && canReadLessons && (
                <section className="space-y-3">
                    <h2 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Kurs kutubxonasi
                    </h2>
                    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                        <CourseFileLibrary
                            courseId={course.id}
                            canAdd={canAddLibraryFiles}
                            canEdit={canEditLibraryFiles}
                            canRemove={canRemoveLibraryFiles}
                        />
                    </div>
                </section>
            )}

            {activeTab === 'documents' && canReadLessons && (
                <section className="space-y-3">
                    <h2 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Fan hujjatlari
                    </h2>
                    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                        <CourseFileLibrary
                            courseId={course.id}
                            category="document"
                            canAdd={canAddLibraryFiles}
                            canEdit={canEditLibraryFiles}
                            canRemove={canRemoveLibraryFiles}
                        />
                    </div>
                </section>
            )}

            {activeTab === 'chat' && canReadCourse && (
                <section className="space-y-3">
                    <h2 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Kurs bo'yicha muloqot
                    </h2>
                    <CourseChat courseId={course.id} readOnly={isArchived} />
                </section>
            )}
                </div>

                <aside className="course-detail-aside" aria-label="Kurs ma'lumotlari">
                    <section className="course-info-card">
                        <h2>Kurs haqida</h2>
                        <div className="course-teacher-label">
                            <span className="course-info-icon"><UserRound size={17} /></span>
                            <strong>O'qituvchi</strong>
                        </div>
                        <div className="course-teacher-detail">
                            <span className="course-teacher-avatar" aria-hidden="true">{initialsOf(teacherName)}</span>
                            <span><strong>{teacherName}</strong>{course.kafedra?.name && <small>{course.kafedra.name}</small>}</span>
                        </div>
                    </section>
                    {course.groups.length > 0 && (
                        <section className="course-info-card">
                            <h2>Biriktirilgan guruhlar</h2>
                            <div className="course-group-list">
                                {course.groups.map((group) => (
                                    <div key={group.id} className="course-group-row"><strong>{group.name}</strong>{courseTypeLabel(course.course_type) && <span>{courseTypeLabel(course.course_type)}</span>}</div>
                                ))}
                            </div>
                        </section>
                    )}
                    <div className="course-aside-note">
                        <Info size={18} aria-hidden="true" />
                        <div><strong>Kurs materiallari</strong><p>Darslar, baholar va fayllarni yuqoridagi bo'limlar orqali ko'rishingiz mumkin.</p></div>
                    </div>
                </aside>
            </div>

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
