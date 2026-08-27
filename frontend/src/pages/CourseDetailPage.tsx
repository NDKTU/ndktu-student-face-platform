import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowLeft,
    BookOpen,
    ChevronDown,
    ChevronRight,
    Clock3,
    GripVertical,
    Pencil,
    Plus,
    Trash2,
    UserRound,
} from 'lucide-react';
import { useCourse } from '@/hooks/useCourses';
import { useDeleteLesson, useLessons } from '@/hooks/useLessons';
import { useCourseTopics, useDeleteCourseTopic } from '@/hooks/useCourseTopics';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CourseLessonModal } from '@/components/courses/CourseLessonModal';
import { CourseTopicModal } from '@/components/courses/CourseTopicModal';
import type { CourseTopic } from '@/services/courseTopicService';
import type { Lesson } from '@/services/lessonService';

export default function CourseDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const courseId = id ? Number.parseInt(id, 10) : undefined;
    const canReadLessons = hasPermission('read:lesson');
    const canCreateLessons = hasPermission('create:lesson');
    const canUpdateLessons = hasPermission('update:lesson');
    const canDeleteLessons = hasPermission('delete:lesson');

    const [topicModalOpen, setTopicModalOpen] = useState(false);
    const [lessonModalOpen, setLessonModalOpen] = useState(false);
    const [selectedTopicId, setSelectedTopicId] = useState<number>();
    const [editingTopic, setEditingTopic] = useState<CourseTopic | null>(null);
    const [deletingTopic, setDeletingTopic] = useState<CourseTopic | null>(null);
    const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
    const [deletingLesson, setDeletingLesson] = useState<Lesson | null>(null);
    const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());

    const courseQuery = useCourse(courseId);
    const topicsQuery = useCourseTopics(courseId, canReadLessons);
    const lessonsQuery = useLessons(
        courseId ? { course_id: courseId, page: 1, limit: 500 } : undefined,
        Boolean(courseId && canReadLessons),
    );
    const deleteTopic = useDeleteCourseTopic();
    const deleteLesson = useDeleteLesson();

    const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
    const lessons = lessonsQuery.data?.lessons ?? [];

    useEffect(() => {
        if (topics.length === 0) return;
        setExpandedTopics((current) => current.size > 0 ? current : new Set([topics[0].id]));
    }, [topics]);

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

    const toggleTopic = (topicId: number) => {
        setExpandedTopics((current) => {
            const next = new Set(current);
            if (next.has(topicId)) next.delete(topicId);
            else next.add(topicId);
            return next;
        });
    };

    const openNewTopic = () => {
        setEditingTopic(null);
        setTopicModalOpen(true);
    };

    const openNewLesson = (topicId: number) => {
        setEditingLesson(null);
        setSelectedTopicId(topicId);
        setLessonModalOpen(true);
    };

    const confirmDeleteLesson = async () => {
        if (!deletingLesson) return;
        try {
            await deleteLesson.mutateAsync(deletingLesson.id);
            toast.success("Dars o'chirildi");
            setDeletingLesson(null);
        } catch (cause) {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.error(detail || "Darsni o'chirishda xatolik");
        }
    };

    const confirmDeleteTopic = async () => {
        if (!deletingTopic) return;
        try {
            await deleteTopic.mutateAsync(deletingTopic.id);
            toast.success("Mavzu o'chirildi");
            setDeletingTopic(null);
        } catch {
            toast.error("Mavzuni o'chirishda xatolik yuz berdi");
        }
    };

    const lessonsForTopic = (topicId: number) => lessons.filter((lesson) => lesson.topic_id === topicId);
    const orphanLessons = lessons.filter((lesson) => !lesson.topic_id);

    const renderLesson = (lesson: Lesson, index: number) => {
        const video = lesson.resources?.find((resource) => resource.resource_type === 'video');
        const isYoutube = Boolean(video?.link_url && /youtu(?:\.be|be\.com)/i.test(video.link_url));
        return (
            // Qator <button> emas: ichida tahrirlash/o'chirish tugmalari bor,
            // ichma-ich <button> esa yaroqsiz HTML.
            <div
                key={lesson.id}
                className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.02] sm:px-4"
            >
                <GripVertical className="hidden h-4 w-4 shrink-0 text-muted-foreground/40 sm:block" />
                <button
                    type="button"
                    onClick={() => navigate(`/lessons/${lesson.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{lesson.topic}</span>
                {video && (
                    <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                        isYoutube ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-primary/10 text-primary'
                    }`}>
                        {isYoutube ? 'YouTube' : 'Video dars'}
                    </span>
                )}
                {lesson.duration_minutes && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        {lesson.duration_minutes} daq
                    </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                </button>
                {canUpdateLessons && (
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Darsni tahrirlash"
                        onClick={() => {
                            setEditingLesson(lesson);
                            setSelectedTopicId(lesson.topic_id ?? undefined);
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
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{course.teacher?.full_name || course.teacher?.username}</span>
                            {course.kafedra?.name && <><span>·</span><span>{course.kafedra.name}</span></>}
                            {course.semester_number && <><span>·</span><span>{course.semester_number}-semestr</span></>}
                            <><span>·</span><span>{lessons.length} ta dars</span></>
                        </div>
                    </div>
                </div>
            </section>

            {canReadLessons && (
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3 px-0.5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mavzular</h2>
                        {canCreateLessons && (
                            <Button onClick={openNewTopic}>
                                <Plus className="h-4 w-4" /> Mavzu qo'shish
                            </Button>
                        )}
                    </div>

                    {topicsQuery.isLoading || lessonsQuery.isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}
                        </div>
                    ) : topicsQuery.isError || lessonsQuery.isError ? (
                        <ErrorState onRetry={() => { void topicsQuery.refetch(); void lessonsQuery.refetch(); }} />
                    ) : topics.length === 0 && orphanLessons.length === 0 ? (
                        <div className="rounded-2xl border border-border/60 bg-card py-8">
                            <EmptyState
                                icon={<BookOpen className="h-6 w-6" />}
                                title="Mavzular yo'q"
                                description="Avval mavzu yarating, keyin uning ichiga darslar qo'shing."
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {topics.map((topic, topicIndex) => {
                                const topicLessons = lessonsForTopic(topic.id);
                                const expanded = expandedTopics.has(topic.id);
                                return (
                                    <article key={topic.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                                            <button type="button" onClick={() => toggleTopic(topic.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                                                    {topic.order_index || topicIndex + 1}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold text-foreground">{topic.title}</span>
                                                    <span className="text-xs text-muted-foreground">{topicLessons.length} ta dars</span>
                                                </span>
                                                {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                            </button>
                                            {canUpdateLessons && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Mavzuni tahrirlash"
                                                    onClick={() => { setEditingTopic(topic); setTopicModalOpen(true); }}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canDeleteLessons && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label="Mavzuni o'chirish"
                                                    onClick={() => setDeletingTopic(topic)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        {expanded && (
                                            <div className="space-y-2 border-t border-border/50 bg-muted/20 px-4 py-3 sm:pl-10">
                                                {topicLessons.length === 0 && (
                                                    <p className="py-2 text-sm text-muted-foreground">Bu mavzuda hali dars yo'q.</p>
                                                )}
                                                {topicLessons.map(renderLesson)}
                                                {canCreateLessons && (
                                                    <Button variant="outline" size="sm" className="border-dashed text-primary" onClick={() => openNewLesson(topic.id)}>
                                                        <Plus className="h-4 w-4" /> Dars qo'shish
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}

                            {orphanLessons.length > 0 && (
                                <article className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
                                    <div className="px-5 py-4">
                                        <p className="text-sm font-semibold">Boshqa darslar</p>
                                        <p className="text-xs text-muted-foreground">{orphanLessons.length} ta dars</p>
                                    </div>
                                    <div className="space-y-2 border-t border-border/50 bg-muted/20 px-4 py-3 sm:pl-10">
                                        {orphanLessons.map(renderLesson)}
                                    </div>
                                </article>
                            )}
                        </div>
                    )}
                </section>
            )}

            <CourseTopicModal
                isOpen={topicModalOpen}
                onClose={() => { setTopicModalOpen(false); setEditingTopic(null); }}
                courseId={course.id}
                nextOrder={(topics.at(-1)?.order_index ?? 0) + 1}
                topic={editingTopic}
            />
            <CourseLessonModal
                isOpen={lessonModalOpen}
                onClose={() => { setLessonModalOpen(false); setEditingLesson(null); }}
                course={course}
                topicId={selectedTopicId}
                lesson={editingLesson}
            />
            <ConfirmDialog
                isOpen={Boolean(deletingLesson)}
                onClose={() => setDeletingLesson(null)}
                onConfirm={() => void confirmDeleteLesson()}
                title="Darsni o'chirish"
                description={`"${deletingLesson?.topic ?? ''}" darsi o'chiriladi. Unga biriktirilgan resurslar ham yo'qoladi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
            <ConfirmDialog
                isOpen={Boolean(deletingTopic)}
                onClose={() => setDeletingTopic(null)}
                onConfirm={() => void confirmDeleteTopic()}
                title="Mavzuni o'chirish"
                description={`"${deletingTopic?.title ?? ''}" mavzusi o'chiriladi. Ichidagi darslar "Boshqa darslar" bo'limida saqlanadi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
}
