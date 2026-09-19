/**
 * Talabaning kursdagi baholari — mavzu (dars) bo'yicha.
 *
 * Ilgari talaba bahosini bilish uchun har darsni birma-bir ochishi kerak
 * edi. Bu yerda butun kurs bitta ro'yxatda: har mavzuda uy vazifasi va
 * testlar bahosi, tepada esa umumiy xulosa. Mavzuni bosganda — darsning
 * o'ziga o'tadi (topshirish yoki qayta ko'rish uchun).
 */
import { useMemo, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Award, ChevronRight, ClipboardCheck, ListChecks } from 'lucide-react';
import { useMyCourseGrades } from '@/hooks/useCourses';
import type { MyCourseGrades as Grades, MyGradesTopic, MyHomeworkGrade, MyQuizGrade } from '@/services/courseService';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LATE_CLASS, REVIEW_CLASS, isPastDeadline } from '@/components/homework/homeworkStatus';
import { formatDate, formatDayMonth } from '@/utils/date';
import { cn } from '@/lib/utils';

const CHIP = 'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium';
const MUTED_CHIP = 'border-border bg-muted/50 text-muted-foreground';
const OPEN_CHIP = 'border-primary/25 bg-primary/10 text-primary';

/** 5 balli shkalada rang: 4–5 yaxshi, 3 o'rta, undan pasti — past. */
const gradeClass = (onFive: number) =>
    onFive >= 4 ? REVIEW_CLASS.graded : onFive >= 3 ? REVIEW_CLASS.pending : LATE_CLASS;

export const MyCourseGrades = ({ courseId }: { courseId: number }) => {
    const { data, isLoading, isError, refetch } = useMyCourseGrades(courseId);
    const summary = useMemo(() => (data ? summarize(data) : null), [data]);

    if (isError) return <ErrorState title="Baholarni yuklab bo'lmadi" onRetry={() => void refetch()} />;
    if (isLoading || !data || !summary) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile
                    icon={Award}
                    label="O'rtacha baho"
                    value={summary.average != null ? summary.average.toFixed(1) : '—'}
                    hint="5 balli shkalada"
                />
                <SummaryTile
                    icon={ClipboardCheck}
                    label="Uy vazifalari"
                    value={`${summary.homeworkGraded} / ${summary.homeworkTotal}`}
                    hint="baholangan"
                />
                <SummaryTile
                    icon={ListChecks}
                    label="Testlar"
                    value={`${summary.quizTaken} / ${summary.quizTotal}`}
                    hint="ishlangan"
                />
                <SummaryTile
                    icon={AlertCircle}
                    label="Topshirilmagan"
                    value={String(summary.missed)}
                    hint="muddati o'tgan vazifa"
                    danger={summary.missed > 0}
                />
            </div>

            <ol className="space-y-2">
                {data.topics.map((topic, index) => (
                    <TopicRow key={topic.lesson_id ?? `hw-${topic.homework?.id}`} topic={topic} index={index + 1} />
                ))}
            </ol>
        </div>
    );
};

function TopicRow({ topic, index }: { topic: MyGradesTopic; index: number }) {
    const navigate = useNavigate();
    const hasTasks = Boolean(topic.homework) || topic.quizzes.length > 0;
    const open = topic.lesson_id ? () => navigate(`/lessons/${topic.lesson_id}`) : undefined;

    return (
        <li>
            <div
                role={open ? 'button' : undefined}
                tabIndex={open ? 0 : undefined}
                onClick={open}
                onKeyDown={(event) => {
                    if (open && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        open();
                    }
                }}
                className={cn(
                    'flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-3.5',
                    open && 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
            >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 text-xs font-semibold text-primary tabular-nums">
                        {index}
                    </span>
                    <div className="min-w-0">
                        <p className="break-words text-sm font-medium leading-snug">{topic.topic}</p>
                        <p className="text-[11px] text-muted-foreground">
                            {topic.date ? formatDate(topic.date) : 'Kurs topshirig\'i'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pl-11 sm:justify-end sm:pl-0">
                    {!hasTasks && <span className={cn(CHIP, MUTED_CHIP)}>Baholanadigan topshiriq yo'q</span>}
                    {topic.homework && <HomeworkChip homework={topic.homework} />}
                    {topic.quizzes.map((quiz) => <QuizChip key={quiz.id} quiz={quiz} />)}
                </div>
                {open && <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />}
            </div>
        </li>
    );
}

function HomeworkChip({ homework }: { homework: MyHomeworkGrade }) {
    let text: string;
    let tone: string;
    if (homework.status === 'graded' && homework.grade != null) {
        text = `Uy vazifasi: ${homework.grade}/${homework.max_grade}`;
        tone = gradeClass((homework.grade * 5) / homework.max_grade);
    } else if (homework.status) {
        text = 'Uy vazifasi: tekshirilmoqda';
        tone = REVIEW_CLASS.pending;
    } else if (isPastDeadline(homework.deadline)) {
        text = 'Uy vazifasi: topshirilmagan';
        tone = LATE_CLASS;
    } else {
        text = `Uy vazifasi: ${formatDayMonth(homework.deadline)} gacha`;
        tone = OPEN_CHIP;
    }
    return (
        <span className={cn(CHIP, tone)} title={homework.title}>
            <span className="truncate">{text}</span>
            {homework.late && <span className="opacity-80">· kech</span>}
        </span>
    );
}

function QuizChip({ quiz }: { quiz: MyQuizGrade }) {
    const taken = quiz.grade != null;
    const details = taken
        ? `${quiz.correct_answers ?? 0} to'g'ri, ${quiz.wrong_answers ?? 0} xato${quiz.attempts > 1 ? ` · ${quiz.attempts} urinish, oxirgisi` : ''}`
        : 'Hali ishlanmagan';
    return (
        <span className={cn(CHIP, taken ? gradeClass(quiz.grade!) : MUTED_CHIP)} title={`${quiz.title} — ${details}`}>
            <span className="max-w-[9rem] truncate">{quiz.title}</span>
            <span className="font-semibold tabular-nums">: {taken ? quiz.grade : '—'}</span>
        </span>
    );
}

function SummaryTile({
    icon: Icon,
    label,
    value,
    hint,
    danger = false,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: string;
    hint: string;
    danger?: boolean;
}) {
    return (
        <div className="min-w-0 rounded-xl border border-border/60 bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', danger && 'text-destructive')} />
                <span className="truncate">{label}</span>
            </div>
            <p className={cn('mt-1 text-xl font-semibold tabular-nums', danger && 'text-destructive')}>{value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
    );
}

function summarize(data: Grades) {
    const onFive: number[] = [];
    let homeworkTotal = 0;
    let homeworkGraded = 0;
    let quizTotal = 0;
    let quizTaken = 0;
    let missed = 0;
    for (const topic of data.topics) {
        const hw = topic.homework;
        if (hw) {
            homeworkTotal += 1;
            if (hw.status === 'graded' && hw.grade != null) {
                homeworkGraded += 1;
                // Uy vazifasi shkalasi turlicha bo'lishi mumkin — 5 ga keltiriladi.
                onFive.push((hw.grade * 5) / hw.max_grade);
            }
            if (!hw.status && isPastDeadline(hw.deadline)) missed += 1;
        }
        for (const quiz of topic.quizzes) {
            quizTotal += 1;
            if (quiz.grade != null) {
                quizTaken += 1;
                onFive.push(quiz.grade);
            }
        }
    }
    const average = onFive.length ? onFive.reduce((a, b) => a + b, 0) / onFive.length : null;
    return { average, homeworkTotal, homeworkGraded, quizTotal, quizTaken, missed };
}
