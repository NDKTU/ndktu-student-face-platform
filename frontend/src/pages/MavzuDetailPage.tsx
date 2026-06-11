import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    BookOpen,
    Clock,
    ExternalLink,
    FileText,
    Image as ImageIcon,
    Link2,
    Loader2,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { useSinf } from '@/hooks/useSinf';
import { useModules } from '@/hooks/useCourseStructure';
import { useDeleteLesson, useLessons } from '@/hooks/useLessons';
import { useDeleteResource, useResources } from '@/hooks/useResources';
import { LessonFormModal } from '@/components/LessonFormModal';
import { LessonResourceModal } from '@/components/LessonResourceModal';
import type { Lesson, LessonType } from '@/services/lessonService';
import type { ResourceResponse } from '@/services/resourceService';

const LESSON_TYPE_LABEL: Record<LessonType, string> = {
    lecture: 'Maʼruza',
    seminar: 'Seminar',
    independent: 'Mustaqil',
    lab: 'Laboratoriya',
};
const LESSON_TYPE_COLOR: Record<LessonType, string> = {
    lecture: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    seminar: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    independent: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    lab: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
};

export default function MavzuDetailPage() {
    const { sinfId, topicId } = useParams<{ sinfId: string; topicId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const sinfIdNum = sinfId ? parseInt(sinfId, 10) : undefined;
    const topicIdNum = topicId ? parseInt(topicId, 10) : undefined;

    const isAdmin = user?.roles?.some((r) => r.name.toLowerCase() === 'admin');
    const isTeacher = user?.roles?.some((r) => r.name.toLowerCase() === 'teacher');
    const canManage = !!(isAdmin || isTeacher);

    const { data: sinf, isLoading: isSinfLoading } = useSinf(sinfIdNum);
    const { data: modulesData, isLoading: isStructureLoading } = useModules(sinfIdNum ?? 0);

    const parentModule = useMemo(
        () => (modulesData?.modules ?? []).find((m) => m.topics.some((tp) => tp.id === topicIdNum)) ?? null,
        [modulesData, topicIdNum],
    );
    const topic = useMemo(
        () => parentModule?.topics.find((tp) => tp.id === topicIdNum) ?? null,
        [parentModule, topicIdNum],
    );

    const sinfGroupOptions = useMemo(
        () => (sinf?.groups ?? []).map((g) => ({ value: g.id.toString(), label: g.name })),
        [sinf],
    );
    const sinfGroupIds = useMemo(() => new Set((sinf?.groups ?? []).map((g) => g.id)), [sinf]);

    const { data: lessonsData } = useLessons({
        sinf_id: sinfIdNum,
        topic_id: topicIdNum,
        page: 1,
        limit: 100,
    });
    const lessons = lessonsData?.lessons ?? [];

    const { data: resourcesData } = useResources(
        1,
        50,
        undefined,
        undefined,
        undefined,
        undefined,
        topicIdNum,
    );
    const topicResources = resourcesData?.resources ?? [];

    const deleteLesson = useDeleteLesson();
    const deleteResource = useDeleteResource();

    const [lessonModalOpen, setLessonModalOpen] = useState(false);
    const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
    const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);

    const [resourceModalOpen, setResourceModalOpen] = useState(false);
    const [editingResource, setEditingResource] = useState<ResourceResponse | null>(null);
    const [resourceToDelete, setResourceToDelete] = useState<ResourceResponse | null>(null);

    if (isSinfLoading || isStructureLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    if (!sinf || !sinfIdNum) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-destructive">Sinf topilmadi.</p>
                <Button variant="outline" onClick={() => navigate('/sinfs')}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Sinflar ro'yxati
                </Button>
            </div>
        );
    }
    if (!topic || !topicIdNum) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-destructive">Mavzu topilmadi.</p>
                <Button variant="outline" onClick={() => navigate(`/sinfs/${sinfIdNum}`)}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Sinfga qaytish
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Link to="/sinfs" className="hover:underline">Sinflar</Link>
                    <span>/</span>
                    <Link to={`/sinfs/${sinfIdNum}`} className="hover:underline truncate max-w-[200px]">
                        {sinf.name}
                    </Link>
                    <span>/</span>
                    {parentModule && <span className="truncate max-w-[200px]">{parentModule.name}</span>}
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/sinfs/${sinfIdNum}`)}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Orqaga
                    </Button>
                    <h1 className="text-xl font-semibold tracking-tight">{topic.name}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pl-2">
                    {topic.hours != null && (
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {topic.hours} soat
                        </span>
                    )}
                    {parentModule && (
                        <span className="inline-flex items-center gap-1">
                            <BookOpen className="h-3 w-3" /> {parentModule.name}
                        </span>
                    )}
                </div>
                {topic.description && (
                    <p className="text-sm text-foreground/80 pl-2">{topic.description}</p>
                )}
                {topic.learning_outcomes && (
                    <p className="text-xs text-muted-foreground pl-2">
                        <span className="font-medium">O'quv natijalari: </span>
                        {topic.learning_outcomes}
                    </p>
                )}
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Darslar</CardTitle>
                    {canManage && (
                        <Button
                            size="sm"
                            onClick={() => {
                                setEditingLesson(null);
                                setLessonModalOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Yangi dars
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {lessons.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Bu mavzuga hali dars qo'shilmagan.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {lessons.map((lesson) => (
                                <div
                                    key={lesson.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(`/lessons/${lesson.id}`)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            navigate(`/lessons/${lesson.id}`);
                                        }
                                    }}
                                    className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3 hover:border-primary/30 hover:shadow-sm hover:bg-accent/20 transition duration-300 cursor-pointer"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-medium truncate">{lesson.topic}</p>
                                            {lesson.lesson_type && (
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-[10px] ${LESSON_TYPE_COLOR[lesson.lesson_type]}`}
                                                >
                                                    {LESSON_TYPE_LABEL[lesson.lesson_type]}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {lesson.date}
                                            {lesson.group?.name && ` · ${lesson.group.name}`}
                                        </p>
                                        {lesson.description && (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                {lesson.description}
                                            </p>
                                        )}
                                    </div>
                                    {canManage && (
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingLesson(lesson);
                                                    setLessonModalOpen(true);
                                                }}
                                                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                                title="Tahrirlash"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setLessonToDelete(lesson);
                                                }}
                                                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                title="O'chirish"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Mavzu resurslari</CardTitle>
                    {canManage && (
                        <Button
                            size="sm"
                            onClick={() => {
                                setEditingResource(null);
                                setResourceModalOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Resurs qo'shish
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {topicResources.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Bu mavzuga hali resurs biriktirilmagan.
                        </p>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                            {topicResources.map((res) => (
                                <div
                                    key={res.id}
                                    className="rounded-xl border border-border/60 bg-card p-4 flex flex-col gap-2 hover:shadow-sm hover:border-primary/20 transition-all duration-300"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm flex-1 whitespace-pre-wrap">{res.main_text}</p>
                                        {canManage && (
                                            <div className="flex shrink-0 gap-1">
                                                <button
                                                    onClick={() => {
                                                        setEditingResource(res);
                                                        setResourceModalOpen(true);
                                                    }}
                                                    className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground"
                                                    title="Tahrirlash"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setResourceToDelete(res)}
                                                    className="rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                                    title="O'chirish"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {res.links.length > 0 && (
                                        <div className="flex flex-col gap-1">
                                            {res.links.map((l, i) => (
                                                <a
                                                    key={i}
                                                    href={l.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-primary hover:underline flex items-center gap-1.5"
                                                >
                                                    <Link2 className="h-3 w-3" />
                                                    <span className="truncate">{l.title || l.url}</span>
                                                    <ExternalLink className="h-3 w-3 opacity-60" />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                    {(res.files ?? []).length > 0 && (
                                        <div className="flex flex-col gap-1 mt-1">
                                            {(res.files ?? []).map((f, i) => (
                                                <a
                                                    key={i}
                                                    href={f.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-primary hover:underline flex items-center gap-1.5"
                                                >
                                                    {f.type === 'image' ? (
                                                        <ImageIcon className="h-3 w-3 shrink-0" />
                                                    ) : (
                                                        <FileText className="h-3 w-3 shrink-0" />
                                                    )}
                                                    <span className="truncate">{f.name}</span>
                                                    <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <LessonFormModal
                isOpen={lessonModalOpen}
                onClose={() => {
                    setLessonModalOpen(false);
                    setEditingLesson(null);
                }}
                sinfId={sinfIdNum}
                sinfGroupOptions={sinfGroupOptions}
                sinfGroupIds={sinfGroupIds}
                presetTopicId={topicIdNum}
                editing={editingLesson}
            />

            <LessonResourceModal
                isOpen={resourceModalOpen}
                onClose={() => {
                    setResourceModalOpen(false);
                    setEditingResource(null);
                }}
                target={{ kind: 'topic', topicId: topicIdNum, sinfId: sinfIdNum }}
                editing={editingResource}
            />

            <ConfirmDialog
                isOpen={!!lessonToDelete}
                onClose={() => setLessonToDelete(null)}
                onConfirm={() => {
                    if (!lessonToDelete) return;
                    deleteLesson.mutate(lessonToDelete.id, {
                        onSuccess: () => setLessonToDelete(null),
                    });
                }}
                title="Darsni o'chirish"
                description={`"${lessonToDelete?.topic}" darsini o'chirmoqchimisiz?`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />

            <ConfirmDialog
                isOpen={!!resourceToDelete}
                onClose={() => setResourceToDelete(null)}
                onConfirm={() => {
                    if (!resourceToDelete) return;
                    deleteResource.mutate(resourceToDelete.id, {
                        onSuccess: () => setResourceToDelete(null),
                    });
                }}
                title="Resursni o'chirish"
                description="Ushbu resursni o'chirmoqchimisiz?"
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
}
