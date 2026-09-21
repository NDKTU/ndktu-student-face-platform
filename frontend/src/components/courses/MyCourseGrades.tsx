/**
 * Talabaning kursdagi baholari — mavzu (dars) bo'yicha.
 *
 * Ilgari baho mavzu qatorining chetidagi kichik yorliqda turardi
 * («Uy vazifasi: 4/5»), tafsilotlar esa faqat sichqoncha olib borilganda
 * chiqardi — telefonda umuman ko'rinmasdi. Endi har topshiriq alohida
 * kartochka: katta baho, uning so'zi (a'lo, yaxshi…), holati, muddati,
 * test natijasi va o'qituvchi izohi — hammasi matn bilan, ochiq turadi.
 * Tepada esa umumiy xulosa: o'rtacha baho va nechta topshiriq qolgani.
 */
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, CalendarClock, ChevronRight, Clock3, MessageSquareText, Minus, X } from 'lucide-react';
import { useMyCourseGrades } from '@/hooks/useCourses';
import type { MyCourseGrades as Grades, MyGradesTopic, MyHomeworkGrade, MyQuizGrade } from '@/services/courseService';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { REVIEW_CLASS, deadlineHint, isPastDeadline } from '@/components/homework/homeworkStatus';
import { GRADE_LEVELS, GRADE_TEXT, GRADE_TONE, GRADE_WORD, gradeLevel, gradeTone, gradeWord } from '@/components/courses/gradeScale';
import { formatDate, formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

/** Topshiriqning talaba uchun holati — kartochka rangi va matni shundan. */
type TaskState =
    | { kind: 'graded'; onFive: number; grade: number }
    | { kind: 'pending' }
    | { kind: 'open' }
    | { kind: 'missed' }
    | { kind: 'not-taken' };

const homeworkState = (hw: MyHomeworkGrade): TaskState => {
    if (hw.status === 'graded' && hw.grade != null) {
        return { kind: 'graded', grade: hw.grade, onFive: (hw.grade * 5) / hw.max_grade };
    }
    if (hw.status) return { kind: 'pending' };
    return isPastDeadline(hw.deadline) ? { kind: 'missed' } : { kind: 'open' };
};

const quizState = (quiz: MyQuizGrade): TaskState =>
    quiz.grade != null ? { kind: 'graded', grade: quiz.grade, onFive: quiz.grade } : { kind: 'not-taken' };

const MISSED_TONE = GRADE_TONE[2];
const OPEN_TONE = 'border-primary/30 bg-primary/10 text-primary';
const MUTED_TONE = 'border-border bg-muted/50 text-muted-foreground';

export const MyCourseGrades = ({ courseId }: { courseId: number }) => {
    const { data, isLoading, isError, refetch } = useMyCourseGrades(courseId);
    const summary = useMemo(() => (data ? summarize(data) : null), [data]);

    if (isError) return <ErrorState title="Baholarni yuklab bo'lmadi" onRetry={() => void refetch()} />;
    if (isLoading || !data || !summary) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-36 w-full rounded-2xl" />
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
            </div>
        );
    }
    if (data.topics.length === 0) {
        return (
            <EmptyState
                icon={<Award className="h-6 w-6" />}
                title="Hozircha baho yo'q"
                description="Darslar va topshiriqlar qo'shilgach, baholaringiz shu yerda mavzu bo'yicha ko'rinadi."
            />
        );
    }

    return (
        <div className="space-y-4">
            <Overview summary={summary} />
            <ScaleLegend />
            <ol className="space-y-2.5">
                {data.topics.map((topic, index) => (
                    <TopicCard key={topic.lesson_id ?? `hw-${topic.homework?.id}`} topic={topic} index={index + 1} />
                ))}
            </ol>
        </div>
    );
};

// ── Umumiy xulosa ─────────────────────────────────────────────────────────

function Overview({ summary }: { summary: Summary }) {
    const navigate = useNavigate();
    const { average, gradedCount, pending, open, missed, total, nextOpen } = summary;
    const done = gradedCount + pending;
    const percent = (value: number) => (total ? `${(value / total) * 100}%` : '0%');

    return (
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-5 md:flex-row md:items-center">
                <div className="flex items-center gap-4 md:w-72 md:shrink-0 md:border-r md:border-border/60 md:pr-5">
                    <div
                        className={cn(
                            'flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border',
                            average != null ? gradeTone(average) : MUTED_TONE,
                        )}
                    >
                        <span className="text-3xl leading-none font-bold tabular-nums">
                            {average != null ? average.toFixed(1) : '—'}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold opacity-80">5 dan</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">O'rtacha baho</p>
                        <p className={cn('text-lg font-bold', average != null ? GRADE_TEXT[gradeLevel(average)] : 'text-muted-foreground')}>
                            {average != null ? gradeWord(average) : "Hali baho yo'q"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            {average != null
                                ? `${gradedCount} ta baho bo'yicha, 5 balli shkalada`
                                : "Birinchi baho qo'yilgach shu yerda ko'rinadi"}
                        </p>
                    </div>
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    {total === 0 ? (
                        <p className="text-sm text-muted-foreground">Bu kursda hozircha baholanadigan topshiriq yo'q.</p>
                    ) : (
                        <>
                            <div className="flex items-baseline justify-between gap-3">
                                <p className="text-sm font-semibold">Topshiriqlar</p>
                                <p className="text-sm tabular-nums text-muted-foreground">
                                    <b className="text-foreground">{done}</b> / {total} bajarildi
                                </p>
                            </div>
                            <div
                                className="flex h-2 overflow-hidden rounded-full bg-muted"
                                role="img"
                                aria-label={`${total} ta topshiriqdan ${gradedCount} tasi baholangan, ${pending} tasi tekshirilmoqda`}
                            >
                                <span className="bg-emerald-500" style={{ width: percent(gradedCount) }} />
                                <span className="bg-amber-400" style={{ width: percent(pending) }} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <StatPill dot="bg-emerald-500" label="Baholangan" value={gradedCount} />
                                <StatPill dot="bg-amber-400" label="Tekshirilmoqda" value={pending} />
                                <StatPill dot="bg-primary" label="Topshirish kerak" value={open} />
                                <StatPill dot="bg-rose-500" label="Topshirilmagan" value={missed} danger />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Eng yaqin muddat — talaba nima qilishi kerakligini darhol ko'rsin. */}
            {nextOpen && (
                <div className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 sm:flex-row sm:items-center">
                    <p className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                            <b className="font-semibold">Topshirish kerak:</b> «{nextOpen.homework.title}» —{' '}
                            {formatDateTime(nextOpen.homework.deadline)} gacha
                            <span className="text-muted-foreground"> · {deadlineHint(nextOpen.homework.deadline)}</span>
                        </span>
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate(nextOpen.lessonId ? `/lessons/${nextOpen.lessonId}` : '/homework')}
                        className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
                    >
                        Topshirish <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </section>
    );
}

function StatPill({ dot, label, value, danger = false }: { dot: string; label: string; value: number; danger?: boolean }) {
    return (
        <div className="min-w-0 rounded-xl border border-border/60 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                <span className="truncate">{label}</span>
            </p>
            <p
                className={cn(
                    'mt-0.5 text-lg font-semibold tabular-nums',
                    value === 0 && 'text-muted-foreground/60',
                    danger && value > 0 && 'text-destructive',
                )}
            >
                {value}
            </p>
        </div>
    );
}

function ScaleLegend() {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 text-xs text-muted-foreground">
            <span>Baholash shkalasi:</span>
            {GRADE_LEVELS.map((level) => (
                <span key={level} className="inline-flex items-center gap-1.5">
                    <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold', GRADE_TONE[level])}>
                        {level}
                    </span>
                    {GRADE_WORD[level].toLowerCase()}
                </span>
            ))}
        </div>
    );
}

// ── Mavzu kartochkasi ─────────────────────────────────────────────────────

function TopicCard({ topic, index }: { topic: MyGradesTopic; index: number }) {
    const navigate = useNavigate();
    const taskCount = (topic.homework ? 1 : 0) + topic.quizzes.length;
    const openLesson = topic.lesson_id ? () => navigate(`/lessons/${topic.lesson_id}`) : undefined;

    const header = (
        <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary ring-1 ring-primary/20 ring-inset">
                {index}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug font-semibold break-words">{topic.topic}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {topic.date ? formatDate(topic.date) : "Kurs topshirig'i"}
                    {' · '}
                    {taskCount > 0 ? `${taskCount} ta topshiriq` : "baholanadigan topshiriq yo'q"}
                </span>
            </span>
            {openLesson && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
        </>
    );

    return (
        <li className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {openLesson ? (
                <button
                    type="button"
                    onClick={openLesson}
                    title="Darsni ochish"
                    className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:px-4"
                >
                    {header}
                </button>
            ) : (
                <div className="flex items-center gap-3 px-3 py-3 sm:px-4">{header}</div>
            )}

            {taskCount > 0 && (
                <div className="grid items-start gap-2 border-t border-border/50 bg-muted/20 p-2.5 sm:grid-cols-2 sm:p-3 xl:grid-cols-3">
                    {topic.homework && (
                        <HomeworkTile
                            homework={topic.homework}
                            onSubmit={() => navigate(topic.lesson_id ? `/lessons/${topic.lesson_id}` : '/homework')}
                        />
                    )}
                    {topic.quizzes.map((quiz) => <QuizTile key={quiz.id} quiz={quiz} />)}
                </div>
            )}
        </li>
    );
}

function HomeworkTile({ homework, onSubmit }: { homework: MyHomeworkGrade; onSubmit: () => void }) {
    const state = homeworkState(homework);
    const submitted = homework.submitted_at ? `Topshirilgan: ${formatDateTime(homework.submitted_at)}` : null;

    let status: ReactNode;
    let details: (string | null)[] = [];
    if (state.kind === 'graded') {
        status = <span className={GRADE_TEXT[gradeLevel(state.onFive)]}>{gradeWord(state.onFive)} — {state.grade} / {homework.max_grade}</span>;
        details = [submitted];
    } else if (state.kind === 'pending') {
        status = <span className="text-amber-700 dark:text-amber-400">Tekshirilmoqda</span>;
        details = [submitted, "O'qituvchi hali baholamadi"];
    } else if (state.kind === 'missed') {
        status = <span className={GRADE_TEXT[2]}>Topshirilmagan</span>;
        details = [`Muddat ${formatDateTime(homework.deadline)} da tugagan`];
    } else {
        status = <span className="text-primary">Topshirish kerak</span>;
        details = [`Muddat: ${formatDateTime(homework.deadline)} gacha`, deadlineHint(homework.deadline)];
    }

    return (
        <TaskTile
            label="Uy vazifasi"
            title={homework.title}
            state={state}
            status={status}
            details={details}
            warning={homework.late ? 'Muddatdan kech topshirilgan' : null}
            feedback={homework.feedback}
            action={state.kind === 'open' && (
                <button
                    type="button"
                    onClick={onSubmit}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Topshirish <ChevronRight className="h-3.5 w-3.5" />
                </button>
            )}
        />
    );
}

function QuizTile({ quiz }: { quiz: MyQuizGrade }) {
    const state = quizState(quiz);
    if (state.kind !== 'graded') {
        return (
            <TaskTile
                label="Test"
                title={quiz.title}
                state={state}
                status={<span className="text-muted-foreground">Ishlanmagan</span>}
                details={['Bu test bo\'yicha natija yo\'q']}
            />
        );
    }
    const correct = quiz.correct_answers ?? 0;
    const questions = correct + (quiz.wrong_answers ?? 0);
    return (
        <TaskTile
            label="Test"
            title={quiz.title}
            state={state}
            status={<span className={GRADE_TEXT[gradeLevel(state.onFive)]}>{gradeWord(state.onFive)}</span>}
            details={[
                `${correct} / ${questions} to'g'ri javob`,
                quiz.attempts > 1 ? `${quiz.attempts} ta urinish — oxirgisi hisoblangan` : null,
            ]}
        />
    );
}

function TaskTile({
    label,
    title,
    state,
    status,
    details,
    warning = null,
    feedback = null,
    action = null,
}: {
    label: string;
    title: string;
    state: TaskState;
    status: ReactNode;
    details: (string | null)[];
    warning?: string | null;
    feedback?: string | null;
    action?: ReactNode;
}) {
    return (
        <div className="flex min-w-0 gap-3 rounded-xl border border-border/60 bg-card p-3">
            <GradeBox state={state} />
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{label}</p>
                <p className="line-clamp-2 text-sm font-medium break-words" title={title}>{title}</p>
                <p className="mt-1 text-xs font-semibold">{status}</p>
                {details.filter(Boolean).map((line) => (
                    <p key={line} className="text-[11px] text-muted-foreground">{line}</p>
                ))}
                {warning && <p className="text-[11px] font-medium text-destructive">{warning}</p>}
                {feedback && (
                    <div className="mt-2 rounded-lg border-l-2 border-primary/50 bg-muted/50 px-2.5 py-1.5 text-xs">
                        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                            <MessageSquareText className="h-3 w-3" /> O'qituvchi izohi
                        </p>
                        <p className="break-words whitespace-pre-line text-foreground/90">{feedback}</p>
                    </div>
                )}
                {action}
            </div>
        </div>
    );
}

function GradeBox({ state }: { state: TaskState }) {
    const box = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border';
    switch (state.kind) {
        case 'graded':
            return <span className={cn(box, 'text-xl font-bold tabular-nums', gradeTone(state.onFive))}>{state.grade}</span>;
        case 'pending':
            return <span className={cn(box, REVIEW_CLASS.pending)} aria-hidden><Clock3 className="h-5 w-5" /></span>;
        case 'missed':
            return <span className={cn(box, MISSED_TONE)} aria-hidden><X className="h-5 w-5" /></span>;
        case 'open':
            return <span className={cn(box, OPEN_TONE)} aria-hidden><CalendarClock className="h-5 w-5" /></span>;
        default:
            return <span className={cn(box, MUTED_TONE)} aria-hidden><Minus className="h-5 w-5" /></span>;
    }
}

// ── Hisob-kitob ───────────────────────────────────────────────────────────

interface Summary {
    average: number | null;
    gradedCount: number;
    pending: number;
    open: number;
    missed: number;
    total: number;
    /** Muddati eng yaqin, hali topshirilmagan vazifa. */
    nextOpen: { homework: MyHomeworkGrade; lessonId?: number | null } | null;
}

function summarize(data: Grades): Summary {
    const onFive: number[] = [];
    let pending = 0;
    let open = 0;
    let missed = 0;
    let total = 0;
    let nextOpen: Summary['nextOpen'] = null;
    for (const topic of data.topics) {
        const states: TaskState[] = topic.quizzes.map(quizState);
        if (topic.homework) {
            const state = homeworkState(topic.homework);
            states.push(state);
            if (
                state.kind === 'open'
                && (!nextOpen || new Date(topic.homework.deadline) < new Date(nextOpen.homework.deadline))
            ) {
                nextOpen = { homework: topic.homework, lessonId: topic.lesson_id };
            }
        }
        for (const state of states) {
            total += 1;
            // Uy vazifasi shkalasi turlicha bo'lishi mumkin — hammasi 5 ga keltiriladi.
            if (state.kind === 'graded') onFive.push(state.onFive);
            else if (state.kind === 'pending') pending += 1;
            else if (state.kind === 'missed') missed += 1;
            // Ishlanmagan test ham hali qilinishi kerak bo'lgan ish — hisoblagichlar
            // yig'indisi «jami» ga teng bo'lib tursin.
            else open += 1;
        }
    }
    const average = onFive.length ? onFive.reduce((a, b) => a + b, 0) / onFive.length : null;
    return { average, gradedCount: onFive.length, pending, open, missed, total, nextOpen };
}
