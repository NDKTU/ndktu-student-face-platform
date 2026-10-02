import { useState } from 'react';
import {
    BarChart3,
    BookOpen,
    ChevronDown,
    ChevronRight,
    ClipboardCheck,
    ListChecks,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useMidtermExtraQuestions } from '@/hooks/useQuestions';
import { useDeleteQuiz, useQuizzes, useRemoveMidtermQuestion, useUpdateQuiz } from '@/hooks/useQuizzes';
import { QuestionAccordionList } from '@/components/questions/QuestionAccordionList';
import {
    useCreateIndependentTopic,
    useDeleteIndependentTopic,
    useIndependentTopics,
    useUpdateIndependentTopic,
} from '@/hooks/useIndependentTopics';
import type { CourseGroupInfo } from '@/services/courseService';
import type { IndependentTopic } from '@/services/independentTopicService';
import type { Lesson } from '@/services/lessonService';
import type { Question } from '@/services/questionService';
import type { Quiz, QuizCreateRequest } from '@/services/quizService';
import { apiErrorMessage } from '@/utils/apiError';
import { IndependentTopicModal } from './IndependentTopicModal';
import { MidtermQuizModal } from './MidtermQuizModal';

interface Props {
    courseId: number;
    lessons: Lesson[];
    groups: CourseGroupInfo[];
    /** Oraliq nazorat bloki — test va savollarni boshqara oladiganlarga. */
    canManageQuizzes: boolean;
    /** Natijalar sahifasiga havola. */
    canSeeResults: boolean;
    /** Mavzu qo'shish/tahrirlash/o'chirish. */
    canManageTopics: boolean;
}

/**
 * Oraliq nazoratga alohida qo'shilgan savollar — kartochka ochilganda so'raladi.
 *
 * Darslardan kelgan savollar bu yerda ko'rsatilmaydi: ular dars
 * sahifasida turadi va tahrirlanadi, bu yerda faqat soni ko'rinadi.
 */
const MidtermExtraQuestions = ({ quiz, courseId }: { quiz: Quiz; courseId: number }) => {
    const navigate = useNavigate();
    const { data, isLoading, isError } = useMidtermExtraQuestions(quiz.id);
    const removeQuestion = useRemoveMidtermQuestion();
    const [toRemove, setToRemove] = useState<Question | null>(null);
    const questions = data?.questions ?? [];
    const returnTo = `/courses/${courseId}?tab=assignments`;

    return (
        <div className="space-y-3 border-t border-border/60 bg-muted/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Testga alohida qo'shilgan savollar
                </p>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    disabled={!quiz.subject_id}
                    onClick={() =>
                        navigate(
                            `/questions/create?quiz_id=${quiz.id}&subject_id=${quiz.subject_id}`
                            + `&return_to=${encodeURIComponent(returnTo)}`,
                        )
                    }
                >
                    <Plus className="h-4 w-4" />
                    <span>Savol qo'shish</span>
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-9 w-4/5 rounded-lg" />
                </div>
            ) : isError ? (
                <p className="text-sm text-destructive">Savollarni yuklab bo'lmadi.</p>
            ) : questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Alohida savol yo'q — test faqat tanlangan darslarning savollaridan tuziladi.
                </p>
            ) : (
                <QuestionAccordionList
                    questions={questions}
                    canManage
                    returnTo={returnTo}
                    onRemove={setToRemove}
                    removeLabel="Testdan olib tashlash"
                />
            )}

            <ConfirmDialog
                isOpen={toRemove !== null}
                onClose={() => setToRemove(null)}
                onConfirm={() => {
                    if (!toRemove) return;
                    removeQuestion.mutate(
                        { quizId: quiz.id, questionId: toRemove.id },
                        {
                            onSuccess: () => {
                                toast.success('Savol testdan olib tashlandi');
                                setToRemove(null);
                            },
                            onError: (error) =>
                                toast.error(apiErrorMessage(error, 'Savolni olib tashlab bo‘lmadi')),
                        },
                    );
                }}
                title="Savolni olib tashlash"
                description="Savol bu oraliq nazoratdan olib tashlanadi."
                confirmText="Olib tashlash"
                isLoading={removeQuestion.isPending}
                variant="danger"
            />
        </div>
    );
};

/**
 * «Oraliq nazorat» — kurs testlari: savollar tanlangan darslardan va
 * testning o'ziga qo'shilgan savollardan yig'iladi.
 */
const MidtermQuizzes = ({
    courseId,
    lessons,
    groups,
    canSeeResults,
}: {
    courseId: number;
    lessons: Lesson[];
    groups: CourseGroupInfo[];
    canSeeResults: boolean;
}) => {
    const navigate = useNavigate();
    const quizzesQuery = useQuizzes({ course_id: courseId, quiz_type: 'MIDTERM', limit: 100, sort_dir: 'asc' });
    const updateQuiz = useUpdateQuiz();
    const deleteQuiz = useDeleteQuiz();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Quiz | null>(null);
    const [openId, setOpenId] = useState<number | null>(null);
    const [toDelete, setToDelete] = useState<Quiz | null>(null);
    const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const quizzes = quizzesQuery.data?.quizzes ?? [];
    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const groupName = (id?: number | null) => groups.find((group) => group.id === id)?.name;

    const toggleActive = (quiz: Quiz) => {
        setTogglingId(quiz.id);
        const payload: QuizCreateRequest = {
            title: quiz.title,
            quiz_type: 'MIDTERM',
            course_id: courseId,
            group_id: quiz.group_id ?? null,
            question_number: quiz.question_number,
            duration: quiz.duration,
            pin: quiz.pin,
            proctoring_mode: quiz.proctoring_mode,
            is_active: !quiz.is_active,
        };
        updateQuiz.mutate(
            { id: quiz.id, data: payload },
            {
                onSettled: () => setTogglingId(null),
                onSuccess: () =>
                    toast.success(payload.is_active ? 'Test faollashtirildi' : "Test faol emas holatga o'tkazildi"),
                onError: (error) => toast.error(apiErrorMessage(error, 'Test holatini yangilashda xatolik yuz berdi')),
            },
        );
    };

    const confirmDelete = () => {
        if (!toDelete) return;
        deleteQuiz.mutate(
            { id: toDelete.id, force: deleteWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Oraliq nazorat o'chirildi");
                    setToDelete(null);
                    setDeleteWarnings([]);
                },
                onError: (error) => {
                    // Natijasi bor testni bekend 409 bilan to'xtatadi va nima
                    // yo'qolishini aytadi — ikkinchi bosishda `force` ketadi.
                    const response = (error as { response?: { status?: number; data?: { detail?: unknown } } })
                        ?.response;
                    const detail = response?.data?.detail as { requires_confirmation?: boolean; warnings?: string[] };
                    if (response?.status === 409 && detail?.requires_confirmation) {
                        setDeleteWarnings(detail.warnings ?? []);
                        return;
                    }
                    toast.error(apiErrorMessage(error, "Testni o'chirib bo'lmadi"));
                },
            },
        );
    };

    return (
        <section className="rounded-2xl border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <ClipboardCheck className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold">Oraliq nazorat</h2>
                        <p className="text-xs text-muted-foreground">
                            Savollar tanlangan darslardan va testga alohida qo'shilganlaridan yig'iladi
                        </p>
                    </div>
                </div>
                <Button
                    size="sm"
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="h-9 gap-1.5"
                >
                    <Plus className="h-4 w-4" />
                    <span>Oraliq nazorat</span>
                </Button>
            </header>

            {quizzesQuery.isLoading ? (
                <div className="space-y-2 p-4">
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                </div>
            ) : quizzesQuery.isError ? (
                <p className="p-4 text-sm text-destructive">Testlarni yuklab bo'lmadi.</p>
            ) : quizzes.length === 0 ? (
                <EmptyState
                    icon={<ClipboardCheck className="h-6 w-6" />}
                    title="Oraliq nazorat yo'q"
                    description="Oraliq nazorat yarating: qaysi darslarning savollari kirishini tanlang va kerak bo'lsa alohida savol qo'shing."
                    className="py-8"
                />
            ) : (
                <ul className="divide-y divide-border/60">
                    {quizzes.map((quiz) => {
                        const isOpen = openId === quiz.id;
                        const sourceLessons = (quiz.lesson_ids ?? [])
                            .map((id) => lessonById.get(id))
                            .filter((lesson): lesson is Lesson => Boolean(lesson));
                        return (
                            <li key={quiz.id} className="group/item">
                                <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={() => setOpenId(isOpen ? null : quiz.id)}
                                        aria-expanded={isOpen}
                                        className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {isOpen ? (
                                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold">{quiz.title}</span>
                                            <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                                                {quiz.question_number} savol · {quiz.duration} daqiqa · PIN: {quiz.pin}
                                                {' · '}
                                                {groupName(quiz.group_id) ?? 'Barcha guruhlar'}
                                            </span>
                                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                                <span
                                                    className={
                                                        (quiz.linked_question_count ?? 0) < quiz.question_number
                                                            ? 'font-medium text-amber-600 dark:text-amber-400'
                                                            : 'text-muted-foreground'
                                                    }
                                                >
                                                    Testda {quiz.linked_question_count ?? 0} ta savol
                                                </span>
                                                <span className="text-muted-foreground">·</span>
                                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                                    <BookOpen className="h-3.5 w-3.5" />
                                                    {sourceLessons.length > 0
                                                        ? `${sourceLessons.length} ta dars`
                                                        : 'Dars tanlanmagan'}
                                                </span>
                                            </span>
                                        </span>
                                    </button>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <Switch
                                            checked={quiz.is_active}
                                            onCheckedChange={() => toggleActive(quiz)}
                                            disabled={togglingId === quiz.id || updateQuiz.isPending}
                                            aria-label={quiz.is_active ? "Testni o'chirish" : 'Testni faollashtirish'}
                                        />
                                        <span className={quiz.is_active ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400' : 'text-xs text-muted-foreground'}>
                                            {quiz.is_active ? 'Faol' : 'Faol emas'}
                                        </span>
                                    </div>
                                    {canSeeResults && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 gap-1.5"
                                            onClick={() =>
                                                navigate(
                                                    `/quizzes/${quiz.id}?return_to=${encodeURIComponent(`/courses/${courseId}?tab=assignments`)}`,
                                                )
                                            }
                                        >
                                            <BarChart3 className="h-4 w-4" />
                                            <span>Natijalar</span>
                                        </Button>
                                    )}
                                    <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover/item:opacity-100">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Testni tahrirlash"
                                            onClick={() => { setEditing(quiz); setModalOpen(true); }}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Testni o'chirish"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => { setDeleteWarnings([]); setToDelete(quiz); }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {isOpen && (
                                    <>
                                        <div className="space-y-2 border-t border-border/60 px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Savollar olinadigan darslar
                                            </p>
                                            {sourceLessons.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Dars tanlanmagan. Tahrirlash orqali darslarni tanlang.
                                                </p>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {sourceLessons.map((lesson) => (
                                                        <button
                                                            key={lesson.id}
                                                            type="button"
                                                            onClick={() => navigate(`/lessons/${lesson.id}`)}
                                                            className="max-w-full truncate rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-xs hover:border-primary/40 hover:text-primary"
                                                            title="Darsga o'tish — savollar dars sahifasida"
                                                        >
                                                            {lesson.topic}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <MidtermExtraQuestions quiz={quiz} courseId={courseId} />
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <MidtermQuizModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                courseId={courseId}
                lessons={lessons}
                groups={groups}
                defaultTitle={`${quizzes.length + 1}-oraliq nazorat`}
                quiz={editing}
            />

            <ConfirmDialog
                isOpen={toDelete !== null}
                onClose={() => { setToDelete(null); setDeleteWarnings([]); }}
                onConfirm={confirmDelete}
                title="Oraliq nazoratni o'chirish"
                description={
                    deleteWarnings.length > 0
                        ? `${deleteWarnings.join('. ')}. Baribir o'chirilsinmi?`
                        : `«${toDelete?.title ?? ''}» o'chiriladi. Darslardagi savollar joyida qoladi.`
                }
                confirmText="O'chirish"
                isLoading={deleteQuiz.isPending}
                variant="danger"
            />
        </section>
    );
};

/**
 * «Fan topshiriqlari» — oraliq nazorat va mustaqil ish mavzulari.
 *
 * Ilgari bu yerda darslar bo'yicha savollar ro'yxati turardi. U dars
 * sahifasini takrorlardi; savollar dars sahifasida qo'shiladi va
 * ko'rinadi, bu yerda esa ulardan oraliq nazorat yig'iladi.
 */
export const CourseAssignments = ({
    courseId,
    lessons,
    groups,
    canManageQuizzes,
    canSeeResults,
    canManageTopics,
}: Props) => {
    const [topicModalOpen, setTopicModalOpen] = useState(false);
    const [editingTopic, setEditingTopic] = useState<IndependentTopic | null>(null);
    const [topicToDelete, setTopicToDelete] = useState<IndependentTopic | null>(null);

    const topicsQuery = useIndependentTopics(courseId);
    const createTopic = useCreateIndependentTopic(courseId);
    const updateTopic = useUpdateIndependentTopic(courseId);
    const deleteTopic = useDeleteIndependentTopic(courseId);
    const topics = topicsQuery.data?.topics ?? [];

    return (
        <div className="space-y-6">
            {canManageQuizzes && (
                <MidtermQuizzes
                    courseId={courseId}
                    lessons={lessons}
                    groups={groups}
                    canSeeResults={canSeeResults}
                />
            )}

            <section className="rounded-2xl border border-border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <ListChecks className="h-[18px] w-[18px]" />
                        </span>
                        <div>
                            <h2 className="text-sm font-semibold">Mustaqil ishlar mavzulari</h2>
                            <p className="text-xs text-muted-foreground">
                                Talaba mustaqil o'rganadigan mavzular ro'yxati
                            </p>
                        </div>
                    </div>
                    {canManageTopics && (
                        <Button
                            size="sm"
                            onClick={() => { setEditingTopic(null); setTopicModalOpen(true); }}
                            className="h-9 gap-1.5"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Mavzu qo'shish</span>
                        </Button>
                    )}
                </header>

                {topicsQuery.isLoading ? (
                    <div className="space-y-2 p-4">
                        <Skeleton className="h-12 w-full rounded-xl" />
                        <Skeleton className="h-12 w-full rounded-xl" />
                    </div>
                ) : topics.length === 0 ? (
                    <EmptyState
                        icon={<ListChecks className="h-6 w-6" />}
                        title="Mavzu yo'q"
                        description={
                            canManageTopics
                                ? "Mustaqil ish mavzularini qo'shing — talaba ularni shu yerda ko'radi."
                                : "O'qituvchi hali mustaqil ish mavzularini e'lon qilmagan."
                        }
                        className="py-8"
                    />
                ) : (
                    <ol className="divide-y divide-border/60">
                        {topics.map((topic, index) => (
                            <li key={topic.id} className="group/t flex items-start gap-3 px-4 py-3">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                                    {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium leading-snug">{topic.title}</p>
                                    {topic.description && (
                                        <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                                            {topic.description}
                                        </p>
                                    )}
                                </div>
                                {canManageTopics && (
                                    <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover/t:opacity-100">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Mavzuni tahrirlash"
                                            onClick={() => { setEditingTopic(topic); setTopicModalOpen(true); }}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Mavzuni o'chirish"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => setTopicToDelete(topic)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <IndependentTopicModal
                isOpen={topicModalOpen}
                onClose={() => setTopicModalOpen(false)}
                topic={editingTopic}
                isSubmitting={createTopic.isPending || updateTopic.isPending}
                onSubmit={(values) => {
                    const onDone = {
                        onSuccess: () => {
                            toast.success(editingTopic ? 'Mavzu yangilandi' : "Mavzu qo'shildi");
                            setTopicModalOpen(false);
                        },
                        onError: (error: unknown) =>
                            toast.error(apiErrorMessage(error, 'Mavzuni saqlab bo‘lmadi')),
                    };
                    if (editingTopic) {
                        updateTopic.mutate({ id: editingTopic.id, data: values }, onDone);
                    } else {
                        createTopic.mutate(values, onDone);
                    }
                }}
            />

            <ConfirmDialog
                isOpen={topicToDelete !== null}
                onClose={() => setTopicToDelete(null)}
                onConfirm={() => {
                    if (!topicToDelete) return;
                    deleteTopic.mutate(topicToDelete.id, {
                        onSuccess: () => {
                            toast.success("Mavzu o'chirildi");
                            setTopicToDelete(null);
                        },
                        onError: (error) =>
                            toast.error(apiErrorMessage(error, 'Mavzuni o‘chirib bo‘lmadi')),
                    });
                }}
                title="Mavzuni o'chirish"
                description={`«${topicToDelete?.title ?? ''}» mavzusi ro'yxatdan olib tashlanadi.`}
                confirmText="O'chirish"
                isLoading={deleteTopic.isPending}
                variant="danger"
            />
        </div>
    );
};
