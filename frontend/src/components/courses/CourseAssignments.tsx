import { useEffect, useState } from 'react';
import {
    BarChart3,
    BookOpen,
    ChevronDown,
    ChevronRight,
    ClipboardCheck,
    FileQuestion,
    FileSpreadsheet,
    ListChecks,
    Paperclip,
    Pencil,
    PlayCircle,
    Plus,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { CardAction } from '@/components/ui/CardAction';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SectionCard } from '@/components/ui/SectionCard';
import { useControlQuestionCounts, useControlQuestions, useMidtermExtraQuestions } from '@/hooks/useQuestions';
import {
    useActiveCourseQuizzes,
    useDeleteQuiz,
    useQuizzes,
    useRemoveMidtermQuestion,
    useUpdateQuiz,
} from '@/hooks/useQuizzes';
import { QuestionAccordionList } from '@/components/questions/QuestionAccordionList';
import { QuestionExcelUploadModal } from '@/components/questions/QuestionExcelUploadModal';
import {
    useCreateIndependentTopic,
    useDeleteIndependentTopic,
    useIndependentTopics,
    useUpdateIndependentTopic,
} from '@/hooks/useIndependentTopics';
import type { CourseGroupInfo } from '@/services/courseService';
import type { IndependentTopic } from '@/services/independentTopicService';
import type { Lesson } from '@/services/lessonService';
import { CONTROL_TYPES, type ControlType, type Question } from '@/services/questionService';
import { PROCTORING_LABELS, type Quiz, type QuizCreateRequest } from '@/services/quizService';
import { apiErrorMessage } from '@/utils/apiError';
import { IndependentTopicModal } from './IndependentTopicModal';
import { MidtermQuizModal } from './MidtermQuizModal';
import { NAZORAT_REOPEN_PARAM, readNazoratDraft } from './nazoratDraft';

interface Props {
    courseId: number;
    /** Kurs fani — «Test savollari» shu fanga yoziladi. */
    subjectId: number;
    subjectName?: string;
    lessons: Lesson[];
    groups: CourseGroupInfo[];
    /** Nazorat bloki — test va savollarni boshqara oladiganlarga. */
    canManageQuizzes: boolean;
    /** Talaba: kursning faol nazoratlarini ko'radi va shu yerdan boshlaydi. */
    canTakeQuizzes: boolean;
    /** Natijalar sahifasiga havola. */
    canSeeResults: boolean;
    /** Mavzu qo'shish/tahrirlash/o'chirish. */
    canManageTopics: boolean;
}

/** «Test savollari» dagi shu nazorat turining savol qo'shish sahifasi. */
const controlQuestionCreateUrl = (courseId: number, subjectId: number, controlType: ControlType) => {
    const returnTo = `/courses/${courseId}?tab=assignments&control=${controlType}`;
    return (
        `/questions/create?course_id=${courseId}&subject_id=${subjectId}`
        + `&control_type=${controlType}&return_to=${encodeURIComponent(returnTo)}`
    );
};

/**
 * Nazorat turiga tegishli savollar — kursning «Test savollari» dagi shu tur.
 *
 * Ular kursning shu turdagi barcha nazoratlariga (masalan, har bir guruhning
 * «1-oraliq nazorat» iga) tushadi, shuning uchun bu yerda testdan alohida
 * olib tashlanmaydi — tahrirlash va o'chirish «Test savollari» dagidek.
 */
const ControlTypeQuestions = ({
    courseId,
    controlType,
}: {
    courseId: number;
    controlType: ControlType;
}) => {
    const { data, isLoading, isError } = useControlQuestions(courseId, controlType);
    const questions = data?.questions ?? [];
    const title = CONTROL_TYPES.find((item) => item.value === controlType)?.title ?? controlType;

    return (
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                «{title}» savollari · {questions.length} ta
            </p>
            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-9 w-4/5 rounded-lg" />
                </div>
            ) : isError ? (
                <p className="text-sm text-destructive">Savollarni yuklab bo'lmadi.</p>
            ) : questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Bu nazorat uchun alohida savol yo'q — test tanlangan darslarning savollaridan tuziladi.
                </p>
            ) : (
                <QuestionAccordionList
                    questions={questions}
                    canManage
                    returnTo={`/courses/${courseId}?tab=assignments&control=${controlType}`}
                />
            )}
        </div>
    );
};

/**
 * Nazoratning o'ziga alohida qo'shilgan savollar — kartochka ochilganda so'raladi.
 *
 * Darslardan kelgan savollar bu yerda ko'rsatilmaydi: ular dars
 * sahifasida turadi va tahrirlanadi, bu yerda faqat soni ko'rinadi.
 *
 * `legacyOnly` — turi bor nazorat: yangi savol «Test savollari» ga
 * qo'shiladi, bu yerda faqat avval testga yozilganlari (bo'lsa) ko'rinadi.
 */
const MidtermExtraQuestions = ({
    quiz,
    courseId,
    legacyOnly = false,
}: {
    quiz: Quiz;
    courseId: number;
    legacyOnly?: boolean;
}) => {
    const navigate = useNavigate();
    const { data, isLoading, isError } = useMidtermExtraQuestions(quiz.id);
    const removeQuestion = useRemoveMidtermQuestion();
    const [toRemove, setToRemove] = useState<Question | null>(null);
    const questions = data?.questions ?? [];
    const returnTo = `/courses/${courseId}?tab=assignments`;

    if (legacyOnly && (isLoading || isError || questions.length === 0)) return null;

    return (
        <div className="space-y-3 border-t border-border/60 bg-muted/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Testga alohida qo'shilgan savollar
                </p>
                {!legacyOnly && <Button
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
                </Button>}
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
                description="Savol bu nazoratdan olib tashlanadi."
                confirmText="Olib tashlash"
                isLoading={removeQuestion.isPending}
                variant="danger"
            />
        </div>
    );
};

/**
 * «Nazorat» — kurs testlari (1-oraliq, 1-joriy, yakuniy...): savollar
 * tanlangan darslardan va «Test savollari» dagi shu turdagi savollardan
 * yig'iladi.
 */
const MidtermQuizzes = ({
    courseId,
    subjectId,
    subjectName,
    lessons,
    groups,
    canSeeResults,
}: {
    courseId: number;
    subjectId: number;
    subjectName?: string;
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
    const [restoreDraft, setRestoreDraft] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const reopen = searchParams.get(NAZORAT_REOPEN_PARAM);

    const quizzes = quizzesQuery.data?.quizzes ?? [];

    // Oynadan savol formasiga o'tilgan bo'lsa — qaytganda oyna qoralama
    // bilan qayta ochiladi. Tahrirlash rejimi uchun ro'yxat kerak.
    useEffect(() => {
        if (!reopen || !quizzesQuery.isSuccess) return;
        const draft = readNazoratDraft(courseId);
        const target = draft?.quizId ? quizzesQuery.data.quizzes.find((quiz) => quiz.id === draft.quizId) : null;
        setEditing(target ?? null);
        setRestoreDraft(Boolean(draft) && (draft?.quizId == null || Boolean(target)));
        setModalOpen(true);
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete(NAZORAT_REOPEN_PARAM);
                return next;
            },
            { replace: true },
        );
    }, [reopen, quizzesQuery.isSuccess, quizzesQuery.data, courseId, setSearchParams]);
    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const groupName = (id?: number | null) => groups.find((group) => group.id === id)?.name;
    const usedControlTypes = quizzes
        .map((quiz) => quiz.control_type)
        .filter((value): value is ControlType => Boolean(value));
    // «Boshqa» bir necha bo'lishi mumkin, qolganlari odatda bittadan.
    const defaultControlType =
        CONTROL_TYPES.find((item) => item.value !== 'OTHER' && !usedControlTypes.includes(item.value))?.value
        ?? 'OTHER';

    const toggleActive = (quiz: Quiz) => {
        setTogglingId(quiz.id);
        const payload: QuizCreateRequest = {
            quiz_type: 'MIDTERM',
            control_type: quiz.control_type ?? undefined,
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
                    toast.success("Nazorat o'chirildi");
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
        <SectionCard
            icon={<ClipboardCheck className="h-[18px] w-[18px]" />}
            tone="blue"
            title="Nazorat"
            description={
                quizzes.length > 0
                    ? `${quizzes.length} ta test`
                    : "Savollar tanlangan darslardan va «Test savollari» dagi shu nazorat savollaridan yig'iladi"
            }
            action={
                <CardAction
                    onClick={() => { setEditing(null); setRestoreDraft(false); setModalOpen(true); }}
                    icon={<Plus className="h-4 w-4" />}
                    label="Nazorat"
                />
            }
        >
            {quizzesQuery.isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                </div>
            ) : quizzesQuery.isError ? (
                <p className="text-sm text-destructive">Testlarni yuklab bo'lmadi.</p>
            ) : quizzes.length === 0 ? (
                <EmptyState
                    icon={<ClipboardCheck className="h-6 w-6" />}
                    title="Nazorat yo'q"
                    description="Nazorat yarating: turini tanlang, qaysi darslarning savollari kirishini belgilang va kerak bo'lsa shu nazorat uchun alohida savol qo'shing."
                    className="py-8"
                />
            ) : (
                <ul className="space-y-3">
                    {quizzes.map((quiz) => {
                        const isOpen = openId === quiz.id;
                        const sourceLessons = (quiz.lesson_ids ?? [])
                            .map((id) => lessonById.get(id))
                            .filter((lesson): lesson is Lesson => Boolean(lesson));
                        return (
                            <li
                                key={quiz.id}
                                className="group/item overflow-hidden rounded-xl border border-border/60 transition-colors duration-200 hover:border-primary/40"
                            >
                                <div className="flex flex-wrap items-center gap-3 p-3.5">
                                    <button
                                        type="button"
                                        onClick={() => setOpenId(isOpen ? null : quiz.id)}
                                        aria-expanded={isOpen}
                                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {isOpen ? (
                                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                                    {quiz.control_type && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 gap-1.5"
                                            title="Savol shu nazorat uchun «Test savollari» ga qo'shiladi"
                                            onClick={() =>
                                                navigate(controlQuestionCreateUrl(courseId, subjectId, quiz.control_type!))
                                            }
                                        >
                                            <Plus className="h-4 w-4" />
                                            <span>Savol qo'shish</span>
                                        </Button>
                                    )}
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
                                            onClick={() => { setEditing(quiz); setRestoreDraft(false); setModalOpen(true); }}
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
                                        {quiz.control_type ? (
                                            <>
                                                <ControlTypeQuestions courseId={courseId} controlType={quiz.control_type} />
                                                <MidtermExtraQuestions quiz={quiz} courseId={courseId} legacyOnly />
                                            </>
                                        ) : (
                                            <MidtermExtraQuestions quiz={quiz} courseId={courseId} />
                                        )}
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
                subjectId={subjectId}
                subjectName={subjectName}
                lessons={lessons}
                groups={groups}
                defaultControlType={defaultControlType}
                usedControlTypes={usedControlTypes}
                quiz={editing}
                restoreDraft={restoreDraft}
            />

            <ConfirmDialog
                isOpen={toDelete !== null}
                onClose={() => { setToDelete(null); setDeleteWarnings([]); }}
                onConfirm={confirmDelete}
                title="Nazoratni o'chirish"
                description={
                    deleteWarnings.length > 0
                        ? `${deleteWarnings.join('. ')}. Baribir o'chirilsinmi?`
                        : `«${toDelete?.title ?? ''}» o'chiriladi. Darslardagi savollar joyida qoladi.`
                }
                confirmText="O'chirish"
                isLoading={deleteQuiz.isPending}
                variant="danger"
            />
        </SectionCard>
    );
};

/**
 * Talaba uchun «Nazorat» — kursning faol nazoratlari va «Boshlash».
 *
 * Ro'yxat `/quiz/active` dan: server uni talabaning guruhi bo'yicha
 * cheklaydi (guruhsiz nazorat — kursning barcha guruhlariga). Savollar va
 * PIN bu yerda ko'rinmaydi — PIN'ni o'qituvchi aytadi, test sahifasida
 * so'raladi.
 */
const StudentCourseQuizzes = ({ courseId }: { courseId: number }) => {
    const navigate = useNavigate();
    const { data, isLoading, isError } = useActiveCourseQuizzes(courseId);
    const quizzes = data?.quizzes ?? [];

    return (
        <SectionCard
            icon={<ClipboardCheck className="h-[18px] w-[18px]" />}
            tone="blue"
            title="Nazorat"
            description={quizzes.length > 0 ? `${quizzes.length} ta faol test` : undefined}
        >
            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-16 w-full rounded-xl" />
                </div>
            ) : isError ? (
                <p className="text-sm text-destructive">Testlarni yuklab bo'lmadi.</p>
            ) : quizzes.length === 0 ? (
                <EmptyState
                    icon={<ClipboardCheck className="h-6 w-6" />}
                    title="Faol nazorat yo'q"
                    description="O'qituvchi nazoratni faollashtirganda shu yerda ko'rinadi."
                    className="py-8"
                />
            ) : (
                <ul className="space-y-3">
                    {quizzes.map((quiz) => (
                        <li
                            key={quiz.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3.5 transition-colors duration-200 hover:border-primary/40"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <ClipboardCheck className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{quiz.title}</p>
                                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                                    {quiz.question_number} savol · {quiz.duration} daqiqa
                                    {quiz.proctoring_mode !== 'standard' && ` · ${PROCTORING_LABELS[quiz.proctoring_mode]}`}
                                    {quiz.strict_mode && " · Qat'iy rejim"}
                                </p>
                            </div>
                            {/* Test sahifasi testni o'z ro'yxatidan qidiradi, u esa
                                sahifalangan — shuning uchun test `state` da uzatiladi
                                (dars sahifasidagidek). */}
                            <Button
                                size="sm"
                                className="shrink-0 gap-1.5"
                                onClick={() => navigate(`/quiz-test?quizId=${quiz.id}`, { state: { quiz } })}
                            >
                                <PlayCircle className="h-4 w-4" />
                                <span>Boshlash</span>
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
};

/**
 * «Test savollari» — kursning savollar banki nazorat turlari bo'yicha.
 *
 * O'qituvchi savollarni oldindan ON1, ON2, JN1, JN2, YN va boshqa
 * nazoratlarga ajratib to'playdi. Ular hech qaysi darsga tegishli emas,
 * shuning uchun dars sahifasida emas, shu yerda turadi.
 */
const ControlQuestions = ({
    courseId,
    subjectId,
    subjectName,
}: {
    courseId: number;
    subjectId: number;
    subjectName?: string;
}) => {
    const navigate = useNavigate();
    // Savol formasidan qaytganda o'sha nazorat ochiq turishi kerak —
    // `return_to` unga `control=` ni qo'shib yuboradi.
    const [searchParams] = useSearchParams();
    const [active, setActive] = useState<ControlType>(() => {
        const fromUrl = searchParams.get('control');
        return CONTROL_TYPES.some((item) => item.value === fromUrl) ? (fromUrl as ControlType) : 'ON1';
    });
    const [excelOpen, setExcelOpen] = useState(false);
    const countsQuery = useControlQuestionCounts(courseId);
    const questionsQuery = useControlQuestions(courseId, active);
    const counts = countsQuery.data;
    const total = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0;
    const activeInfo = CONTROL_TYPES.find((item) => item.value === active)!;
    const questions = questionsQuery.data?.questions ?? [];
    const returnTo = `/courses/${courseId}?tab=assignments&control=${active}`;

    return (
        <SectionCard
            icon={<FileQuestion className="h-[18px] w-[18px]" />}
            tone="purple"
            title="Test savollari"
            description={
                total > 0
                    ? `${total} ta savol · nazoratlar bo'yicha`
                    : "Savollarni ON1, ON2, JN1, JN2, YN va boshqa nazoratlar bo'yicha qo'shing"
            }
            action={
                <div className="flex shrink-0 gap-2">
                    <CardAction
                        variant="outline"
                        onClick={() => setExcelOpen(true)}
                        icon={<FileSpreadsheet className="h-4 w-4" />}
                        label="Excel'dan yuklash"
                    />
                    <CardAction
                        onClick={() =>
                            navigate(
                                `/questions/create?course_id=${courseId}&subject_id=${subjectId}`
                                + `&control_type=${active}&return_to=${encodeURIComponent(returnTo)}`,
                            )
                        }
                        icon={<Plus className="h-4 w-4" />}
                        label="Savol qo'shish"
                    />
                </div>
            }
        >
            <div role="tablist" aria-label="Nazorat turi" className="flex flex-wrap gap-2">
                {CONTROL_TYPES.map((item) => {
                    const selected = item.value === active;
                    const count = counts?.[item.value] ?? 0;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            title={item.title}
                            onClick={() => setActive(item.value)}
                            className={
                                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors '
                                + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring '
                                + (selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border/60 bg-background text-foreground hover:border-primary/40 hover:text-primary')
                            }
                        >
                            {item.label}
                            <span
                                className={
                                    'min-w-[1.25rem] rounded-md px-1.5 text-center text-[11px] font-semibold tabular-nums '
                                    + (selected ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')
                                }
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {questionsQuery.isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-10 w-4/5 rounded-lg" />
                </div>
            ) : questionsQuery.isError ? (
                <p className="text-sm text-destructive">Savollarni yuklab bo'lmadi.</p>
            ) : questions.length === 0 ? (
                <EmptyState
                    icon={<FileQuestion className="h-6 w-6" />}
                    title={`${activeInfo.title} savollari yo'q`}
                    description="Savolni qo'lda qo'shing yoki Excel'dan yuklang."
                    className="py-8"
                />
            ) : (
                <QuestionAccordionList questions={questions} canManage returnTo={returnTo} />
            )}

            <QuestionExcelUploadModal
                isOpen={excelOpen}
                onClose={() => setExcelOpen(false)}
                subjects={[]}
                defaultSubjectId={subjectId}
                subjectName={subjectName}
                lockSubject
                control={{ course_id: courseId, control_type: active }}
                targetHint={`Savollar «${activeInfo.title}» bo'limiga yuklanadi.`}
            />
        </SectionCard>
    );
};

/**
 * «Fan topshiriqlari» — nazoratlar, mustaqil ish mavzulari va
 * nazoratlar bo'yicha test savollari.
 *
 * Ilgari bu yerda darslar bo'yicha savollar ro'yxati turardi. U dars
 * sahifasini takrorlardi; savollar dars sahifasida qo'shiladi va
 * ko'rinadi, bu yerda esa ulardan nazorat yig'iladi.
 */
export const CourseAssignments = ({
    courseId,
    subjectId,
    subjectName,
    lessons,
    groups,
    canManageQuizzes,
    canTakeQuizzes,
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
            {!canManageQuizzes && canTakeQuizzes && <StudentCourseQuizzes courseId={courseId} />}

            {canManageQuizzes && (
                <MidtermQuizzes
                    courseId={courseId}
                    subjectId={subjectId}
                    subjectName={subjectName}
                    lessons={lessons}
                    groups={groups}
                    canSeeResults={canSeeResults}
                />
            )}

            <SectionCard
                icon={<ListChecks className="h-[18px] w-[18px]" />}
                tone="orange"
                title="Mustaqil ishlar mavzulari"
                description={
                    topics.length > 0
                        ? `${topics.length} ta mavzu`
                        : "Talaba mustaqil o'rganadigan mavzular ro'yxati"
                }
                action={
                    canManageTopics && (
                        <CardAction
                            onClick={() => { setEditingTopic(null); setTopicModalOpen(true); }}
                            icon={<Plus className="h-4 w-4" />}
                            label="Mavzu qo'shish"
                        />
                    )
                }
            >
                {topicsQuery.isLoading ? (
                    <div className="space-y-2">
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
                    <ol className="space-y-3">
                        {topics.map((topic, index) => (
                            <li
                                key={topic.id}
                                className="group/t flex items-start gap-3 rounded-xl border border-border/60 p-3.5 transition-colors duration-200 hover:border-primary/40"
                            >
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
                                    {(topic.attachments?.length ?? 0) > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {topic.attachments!.map((file) => (
                                                <a
                                                    key={file.url}
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-xs hover:border-primary/40 hover:text-primary"
                                                >
                                                    <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{file.name}</span>
                                                </a>
                                            ))}
                                        </div>
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
            </SectionCard>

            {canManageQuizzes && (
                <ControlQuestions courseId={courseId} subjectId={subjectId} subjectName={subjectName} />
            )}

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
