import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Loader2, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { QuestionAccordionList } from '@/components/questions/QuestionAccordionList';
import { QuestionExcelUploadModal } from '@/components/questions/QuestionExcelUploadModal';
import { useControlQuestions, useLessonQuestionCounts } from '@/hooks/useQuestions';
import { useCreateQuiz, useUpdateQuiz } from '@/hooks/useQuizzes';
import type { CourseGroupInfo } from '@/services/courseService';
import type { Lesson } from '@/services/lessonService';
import { CONTROL_TYPES, type ControlType } from '@/services/questionService';
import type { ProctoringMode, Quiz, QuizCreateRequest } from '@/services/quizService';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/date';
import { NAZORAT_REOPEN_PARAM, clearNazoratDraft, readNazoratDraft, saveNazoratDraft } from './nazoratDraft';

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    courseId: number;
    /** Kurs fani — «Savol qo'shish» shu fanga yozadi. */
    subjectId: number;
    subjectName?: string;
    lessons: Lesson[];
    groups: CourseGroupInfo[];
    /** Yangi nazorat uchun taklif qilinadigan tur — kursda hali yo'q birinchisi. */
    defaultControlType: ControlType;
    /** Kursda allaqachon bor turlar — ro'yxatda belgilanadi. */
    usedControlTypes: ControlType[];
    /** Berilgan bo'lsa — tahrirlash rejimi. */
    quiz?: Quiz | null;
    /** Savol formasidan qaytildi — holat qoralamadan tiklanadi. */
    restoreDraft?: boolean;
}

/**
 * Kurs nazorati oynasi.
 *
 * Nom yozilmaydi — u nazorat turidan (1-oraliq, 1-joriy, yakuniy...)
 * serverda yasaladi. Savollar ikki manbadan: o'qituvchi tanlagan darslar
 * (faqat savoli borlari ko'rsatiladi) va kursning «Test savollari» dagi
 * shu turdagi savollar. Shu turga savolni oynaning o'zidan qo'shish
 * mumkin: Excel — joyida, bittalab — savol formasida (oyna holati
 * qoralamada saqlanib, qaytganda tiklanadi).
 *
 * Fan va ma'ruzachi so'ralmaydi — bekend ularni kursdan oladi.
 */
export const MidtermQuizModal = ({
    isOpen,
    onClose,
    courseId,
    subjectId,
    subjectName,
    lessons,
    groups,
    defaultControlType,
    usedControlTypes,
    quiz,
    restoreDraft = false,
}: Props) => {
    const navigate = useNavigate();
    const createMut = useCreateQuiz();
    const updateMut = useUpdateQuiz();
    const lessonCountsQuery = useLessonQuestionCounts(courseId, isOpen);
    const lessonCounts = lessonCountsQuery.data;
    const [excelOpen, setExcelOpen] = useState(false);

    // Eski, nomi tanilmagan testda tur bo'sh — o'qituvchi tanlaydi.
    const [controlType, setControlType] = useState<ControlType | ''>('');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    // Oyna ochilgandagi tanlov: savollari o'chib ketgan dars ham ro'yxatda
    // qolishi kerak, aks holda u tanlovdan jimgina tushib ketardi.
    const [initialIds, setInitialIds] = useState<Set<number>>(new Set());
    const [lessonSearch, setLessonSearch] = useState('');
    const [groupId, setGroupId] = useState('');
    const [questionNumber, setQuestionNumber] = useState('20');
    const [duration, setDuration] = useState('40');
    const [pin, setPin] = useState('');
    const [proctoringMode, setProctoringMode] = useState<ProctoringMode>('standard');
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState('');
    const controlQuestionsQuery = useControlQuestions(courseId, isOpen ? controlType : '');
    const controlQuestions = controlQuestionsQuery.data?.questions ?? [];

    useEffect(() => {
        if (!isOpen) return;
        const draft = restoreDraft ? readNazoratDraft(courseId) : null;
        if (draft && draft.quizId === (quiz?.id ?? null)) {
            setControlType(draft.controlType);
            setSelected(new Set(draft.lessonIds));
            // Tanlangan darslar savolsiz bo'lib qolsa ham ko'rinib tursin.
            setInitialIds(new Set([...(quiz?.lesson_ids ?? []), ...draft.lessonIds]));
            setLessonSearch('');
            setGroupId(draft.groupId);
            setQuestionNumber(draft.questionNumber);
            setDuration(draft.duration);
            setPin(draft.pin);
            setProctoringMode(draft.proctoringMode);
            setIsActive(draft.isActive);
            setError('');
            return;
        }
        setControlType(quiz ? (quiz.control_type ?? '') : defaultControlType);
        setSelected(new Set(quiz?.lesson_ids ?? []));
        setInitialIds(new Set(quiz?.lesson_ids ?? []));
        setLessonSearch('');
        setGroupId(quiz?.group_id ? String(quiz.group_id) : '');
        setQuestionNumber(String(quiz?.question_number ?? 20));
        setDuration(String(quiz?.duration ?? 40));
        setPin(quiz?.pin ?? Math.random().toString().slice(2, 6));
        setProctoringMode(quiz?.proctoring_mode ?? 'standard');
        setIsActive(quiz?.is_active ?? false);
        setError('');
        // `defaultControlType` ataylab kuzatilmaydi: ro'yxat yangilanganda
        // o'qituvchi tanlagan tur ustidan yozilib ketmasin.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, quiz]);

    const close = () => {
        clearNazoratDraft(courseId);
        onClose();
    };

    /** Savol formasiga o'tadi; qaytganda oyna shu holatda qayta ochiladi. */
    const goAddQuestion = () => {
        if (!controlType) return;
        saveNazoratDraft(courseId, {
            quizId: quiz?.id ?? null,
            controlType,
            lessonIds: [...selected],
            groupId,
            questionNumber,
            duration,
            pin,
            proctoringMode,
            isActive,
        });
        const returnTo = `/courses/${courseId}?tab=assignments&${NAZORAT_REOPEN_PARAM}=1`;
        navigate(
            `/questions/create?course_id=${courseId}&subject_id=${subjectId}`
            + `&control_type=${controlType}&return_to=${encodeURIComponent(returnTo)}`,
        );
    };

    const questionCount = (lessonId: number) => lessonCounts?.[lessonId] ?? 0;

    /** Savoli bor darslar — savolsiz dars testga hech narsa bermaydi. */
    const availableLessons = useMemo(
        () => lessons.filter((lesson) => (lessonCounts?.[lesson.id] ?? 0) > 0 || initialIds.has(lesson.id)),
        [lessons, lessonCounts, initialIds],
    );

    const visibleLessons = useMemo(() => {
        const needle = lessonSearch.trim().toLocaleLowerCase();
        return needle
            ? availableLessons.filter((lesson) => lesson.topic.toLocaleLowerCase().includes(needle))
            : availableLessons;
    }, [availableLessons, lessonSearch]);

    const controlInfo = CONTROL_TYPES.find((item) => item.value === controlType);
    const fromLessons = availableLessons
        .filter((lesson) => selected.has(lesson.id))
        .reduce((sum, lesson) => sum + questionCount(lesson.id), 0);
    const fromBank = controlType ? controlQuestions.length : 0;
    const pool = fromLessons + fromBank;
    const wanted = parseInt(questionNumber, 10) || 0;

    const toggleLesson = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allVisibleSelected = visibleLessons.length > 0 && visibleLessons.every((lesson) => selected.has(lesson.id));
    const toggleAllVisible = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const lesson of visibleLessons) {
                if (allVisibleSelected) next.delete(lesson.id);
                else next.add(lesson.id);
            }
            return next;
        });
    };

    const handleSubmit = () => {
        const questions = parseInt(questionNumber, 10);
        const minutes = parseInt(duration, 10);
        if (!controlType) {
            setError('Nazorat turini tanlang');
            return;
        }
        if (!questions || questions < 1) {
            setError("Savollar soni musbat son bo'lishi kerak");
            return;
        }
        if (!minutes || minutes < 1) {
            setError("Davomiylik musbat son bo'lishi kerak");
            return;
        }
        if (pin.trim().length < 4) {
            setError("PIN kamida 4 belgidan iborat bo'lsin");
            return;
        }

        setError('');
        const payload: QuizCreateRequest = {
            // Nomni server turidan yasaydi.
            quiz_type: 'MIDTERM',
            control_type: controlType,
            course_id: courseId,
            // Kurs tartibida (sana bo'yicha) yuboriladi. Tanlangan, lekin
            // ro'yxatda yo'q dars bo'lmaydi: savolsiz darslar faqat oyna
            // ochilganda tanlangan bo'lsa ko'rinadi.
            lesson_ids: availableLessons.filter((lesson) => selected.has(lesson.id)).map((lesson) => lesson.id),
            group_id: groupId ? Number(groupId) : null,
            question_number: questions,
            duration: minutes,
            pin: pin.trim(),
            is_active: isActive,
            proctoring_mode: proctoringMode,
        };

        const onError = (cause: unknown) => setError(apiErrorMessage(cause, 'Testni saqlashda xatolik yuz berdi'));

        if (quiz) {
            updateMut.mutate({ id: quiz.id, data: payload }, {
                onSuccess: () => {
                    toast.success('Nazorat yangilandi');
                    close();
                },
                onError,
            });
        } else {
            createMut.mutate(payload, {
                onSuccess: () => {
                    toast.success('Nazorat yaratildi');
                    close();
                },
                onError,
            });
        }
    };

    const isPending = createMut.isPending || updateMut.isPending;

    return (
        <Modal
            isOpen={isOpen}
            onClose={close}
            title={quiz ? 'Nazoratni tahrirlash' : 'Nazorat'}
            className="md:max-w-2xl"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="control-type">Nazorat</label>
                    <select
                        id="control-type"
                        className={selectClassName}
                        value={controlType}
                        onChange={(e) => setControlType(e.target.value as ControlType)}
                    >
                        {!controlType && <option value="" disabled>Nazorat turini tanlang</option>}
                        {CONTROL_TYPES.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.title}
                                {usedControlTypes.includes(item.value) && item.value !== quiz?.control_type
                                    ? ' — kursda bor'
                                    : ''}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-muted-foreground">Test nomi turidan avtomatik qo'yiladi.</p>
                </div>

                {controlInfo && (
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-sm font-medium">
                                «{controlInfo.title}» savollari
                                <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                                    {controlQuestions.length} ta
                                </span>
                            </label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5"
                                    onClick={() => setExcelOpen(true)}
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    <span>Excel'dan yuklash</span>
                                </Button>
                                <Button type="button" size="sm" className="h-8 gap-1.5" onClick={goAddQuestion}>
                                    <Plus className="h-4 w-4" />
                                    <span>Savol qo'shish</span>
                                </Button>
                            </div>
                        </div>
                        {controlQuestionsQuery.isLoading ? (
                            <div className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Savollar yuklanmoqda…
                            </div>
                        ) : controlQuestionsQuery.isError ? (
                            <p className="rounded-xl border border-border/60 p-3 text-sm text-destructive">
                                Savollarni yuklab bo'lmadi.
                            </p>
                        ) : controlQuestions.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border/80 p-3 text-sm text-muted-foreground">
                                Bu nazorat uchun alohida savol yo'q. Qo'shilgan savollar kursning «Test savollari»
                                bo'limida ham turadi va shu turdagi barcha nazoratlarga tushadi.
                            </p>
                        ) : (
                            <div className="max-h-56 overflow-y-auto">
                                <QuestionAccordionList questions={controlQuestions} />
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-medium">Savollar olinadigan darslar</label>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {availableLessons.filter((lesson) => selected.has(lesson.id)).length}
                            {' / '}
                            {availableLessons.length} tanlandi
                        </span>
                    </div>
                    {lessonCountsQuery.isLoading ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Darslar yuklanmoqda…
                        </div>
                    ) : lessonCountsQuery.isError ? (
                        <p className="rounded-xl border border-border/60 p-3 text-sm text-destructive">
                            Darslardagi savollar sonini yuklab bo'lmadi.
                        </p>
                    ) : availableLessons.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border/80 p-3 text-sm text-muted-foreground">
                            Darslarda hali savol yo'q. Savollar «Test savollari» dan olinadi.
                        </p>
                    ) : (
                        <div className="rounded-xl border border-border/60">
                            <div className="flex items-center gap-2 border-b border-border/60 p-2">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={lessonSearch}
                                        onChange={(e) => setLessonSearch(e.target.value)}
                                        placeholder="Mavzu bo'yicha qidirish"
                                        className="h-9 pl-8"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAllVisible}
                                    disabled={visibleLessons.length === 0}
                                >
                                    {allVisibleSelected ? 'Bekor qilish' : 'Hammasini tanlash'}
                                </Button>
                            </div>
                            <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
                                {visibleLessons.map((lesson) => (
                                    <li key={lesson.id}>
                                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/40">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 shrink-0 accent-primary"
                                                checked={selected.has(lesson.id)}
                                                onChange={() => toggleLesson(lesson.id)}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm">{lesson.topic}</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {formatDate(lesson.date)}
                                                </span>
                                            </span>
                                            {questionCount(lesson.id) > 0 ? (
                                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                    {questionCount(lesson.id)} savol
                                                </span>
                                            ) : (
                                                <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                                                    Savol yo'q
                                                </span>
                                            )}
                                        </label>
                                    </li>
                                ))}
                                {visibleLessons.length === 0 && (
                                    <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                                        Mos dars topilmadi
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Tanlangan darslarga va «Test savollari» ga keyin qo'shilgan savollar ham testga avtomatik tushadi.
                    </p>
                    <p
                        className={
                            'text-xs tabular-nums '
                            + (wanted > pool ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground')
                        }
                    >
                        Testga {pool} ta savol tushadi: darslardan {fromLessons}, «Test savollari» dan {fromBank}.
                        {wanted > pool && ` Faollashtirish uchun kamida ${wanted} ta kerak.`}
                    </p>
                </div>

                {groups.length > 1 && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Guruh</label>
                        <select className={selectClassName} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                            <option value="">Kursning barcha guruhlari</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Savollar soni</label>
                        <Input type="number" min={1} value={questionNumber} onChange={(e) => setQuestionNumber(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Davomiyligi (daqiqa)</label>
                        <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">PIN</label>
                        <Input value={pin} onChange={(e) => setPin(e.target.value)} />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Proktoring</label>
                    <select
                        className={selectClassName}
                        value={proctoringMode}
                        onChange={(e) => setProctoringMode(e.target.value as ProctoringMode)}
                    >
                        <option value="standard">Oddiy</option>
                        <option value="face">Yuz nazorati</option>
                    </select>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                    <div>
                        <p className="text-sm font-medium">Faol</p>
                        <p className="text-xs text-muted-foreground">
                            Faol testda «Savollar soni»dan kam bo'lmagan savol bo'lishi shart.
                        </p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>

                {controlInfo && (
                    // Oyna ichida: Radix ichma-ich dialoglarni shu tarzda
                    // to'g'ri qatlamlaydi, nazorat oynasi esa yopilmaydi.
                    <QuestionExcelUploadModal
                        isOpen={excelOpen}
                        onClose={() => setExcelOpen(false)}
                        subjects={[]}
                        defaultSubjectId={subjectId}
                        subjectName={subjectName}
                        lockSubject
                        control={{ course_id: courseId, control_type: controlInfo.value }}
                        targetHint={`Savollar «${controlInfo.title}» bo'limiga yuklanadi.`}
                    />
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={close} disabled={isPending}>Bekor qilish</Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {quiz ? 'Saqlash' : 'Yaratish'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
