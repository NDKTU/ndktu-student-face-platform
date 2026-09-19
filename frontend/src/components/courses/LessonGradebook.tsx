/**
 * Dars baholash jurnali: qatorda — talaba, ustunda — uy vazifasi va har
 * bir test. O'qituvchi bitta jadvalda kim topshirgani, kim baholangani va
 * kim qolib ketganini ko'radi; baho qo'yish uchun uy vazifasi katagidan
 * to'g'ridan-to'g'ri tekshirish sahifasiga o'tadi.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardCheck, Download, ListChecks, Search, Users } from 'lucide-react';
import { useLessonGradebook } from '@/hooks/useLessons';
import type { GradebookHomework, GradebookRow, LessonGradebook as Gradebook } from '@/services/lessonService';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { LATE_CLASS, REVIEW_CLASS, isPastDeadline } from '@/components/homework/homeworkStatus';
import { cn } from '@/lib/utils';

/** Test bahosi 2–5 shkalada (`quiz_process/attempt.py::grade_for`). */
const QUIZ_GRADE_CLASS = (grade: number) =>
    grade >= 4 ? REVIEW_CLASS.graded : grade === 3 ? REVIEW_CLASS.pending : LATE_CLASS;

export const LessonGradebook = ({ lessonId, onCreateTask }: { lessonId: number; onCreateTask?: () => void }) => {
    const navigate = useNavigate();
    const { data, isLoading, isError, refetch } = useLessonGradebook(lessonId);
    const [search, setSearch] = useState('');
    const [group, setGroup] = useState<string>('');

    const groups = useMemo(
        () => [...new Set((data?.students ?? []).map((s) => s.group_name).filter(Boolean) as string[])],
        [data],
    );

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return (data?.students ?? []).filter(
            (row) =>
                (!group || row.group_name === group) &&
                (!needle || row.full_name.toLowerCase().includes(needle)),
        );
    }, [data, search, group]);

    if (isError) return <ErrorState title="Jurnalni yuklab bo'lmadi" onRetry={() => void refetch()} />;
    if (isLoading || !data) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
            </div>
        );
    }

    const { homework, quizzes } = data;

    if (!homework && quizzes.length === 0) {
        return (
            <EmptyState
                icon={<ListChecks className="h-6 w-6" />}
                title="Baholanadigan topshiriq yo'q"
                description="Jurnal uy vazifasi va testlar natijasidan tuziladi. Avval «Topshiriqlar» bo'limida ulardan birini yarating."
                action={onCreateTask && <Button size="sm" onClick={onCreateTask}>Topshiriqlarga o'tish</Button>}
            />
        );
    }
    if (data.students.length === 0) {
        return (
            <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Talaba yo'q"
                description="Bu dars guruhlarida talaba ro'yxati bo'sh."
            />
        );
    }

    const summary = summarize(data);

    return (
        <div className="space-y-4">
            {/* Qisqa xulosa: nima qilish kerakligi darhol ko'rinsin. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="text-muted-foreground">
                    Talabalar: <b className="text-foreground tabular-nums">{data.students.length}</b>
                </span>
                {homework && (
                    <span className="text-muted-foreground">
                        Uy vazifasi: <b className="text-foreground tabular-nums">{summary.submitted}</b> topshirdi,{' '}
                        <b className="text-foreground tabular-nums">{summary.graded}</b> baholandi
                    </span>
                )}
                {quizzes.length > 0 && (
                    <span className="text-muted-foreground">
                        Test ishlaganlar: <b className="text-foreground tabular-nums">{summary.tookQuiz}</b>
                    </span>
                )}
                {homework && (
                    <Button
                        size="sm"
                        variant={summary.pending > 0 ? 'primary' : 'outline'}
                        className="ml-auto"
                        onClick={() => navigate(`/homework/${homework.id}/submissions`)}
                    >
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        {summary.pending > 0 ? `Ishlarni tekshirish (${summary.pending})` : "Uy vazifasi ishlari"}
                    </Button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Talaba ismi"
                        className="h-9 pl-9 text-sm"
                    />
                </div>
                {groups.length > 1 && (
                    <select
                        value={group}
                        onChange={(event) => setGroup(event.target.value)}
                        aria-label="Guruh"
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                        <option value="">Barcha guruhlar</option>
                        {groups.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                )}
                <Button size="sm" variant="outline" onClick={() => void exportExcel(data)}>
                    <Download className="mr-2 h-4 w-4" /> Excel
                </Button>
            </div>

            {/* Keng jadval — o'z ichida gorizontal aylanadi, sahifa emas. */}
            <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="bg-muted/40">
                        <tr>
                            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-bold">Talaba</th>
                            {homework && (
                                <th className="px-3 py-2 text-center text-xs font-bold whitespace-nowrap" title={homework.title}>
                                    Uy vazifasi
                                    <span className="block text-[11px] font-normal text-muted-foreground">1–{homework.max_grade} ball</span>
                                </th>
                            )}
                            {quizzes.map((quiz) => (
                                <th key={quiz.id} className="max-w-[10rem] px-3 py-2 text-center text-xs font-bold" title={quiz.title}>
                                    <span className="block truncate">{quiz.title}</span>
                                    <span className="block text-[11px] font-normal text-muted-foreground">Test · 2–5</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.student_id} className="border-t border-border/50">
                                <td className="sticky left-0 z-10 border-t border-border/50 bg-card px-3 py-2 whitespace-nowrap">
                                    <span className="font-medium">{row.full_name}</span>
                                    {groups.length > 1 && row.group_name && (
                                        <span className="block text-[11px] text-muted-foreground">{row.group_name}</span>
                                    )}
                                </td>
                                {homework && (
                                    <td className="border-t border-border/50 px-3 py-2 text-center">
                                        <HomeworkCell
                                            row={row}
                                            homework={homework}
                                            onOpen={() => navigate(`/homework/${homework.id}/submissions`)}
                                        />
                                    </td>
                                )}
                                {quizzes.map((quiz) => (
                                    <td key={quiz.id} className="border-t border-border/50 px-3 py-2 text-center">
                                        <QuizCell cell={row.quizzes.find((item) => item.quiz_id === quiz.id)} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">Qidiruvga mos talaba topilmadi.</p>
                )}
            </div>

            <p className="text-xs text-muted-foreground">
                «—» — hali topshirilmagan. Testda bir necha urinish bo'lsa, oxirgisining bahosi ko'rsatiladi.
            </p>
        </div>
    );
};

function HomeworkCell({ row, homework, onOpen }: { row: GradebookRow; homework: GradebookHomework; onOpen: () => void }) {
    const cell = row.homework;
    if (!cell) {
        return isPastDeadline(homework.deadline) ? (
            <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', LATE_CLASS)}>
                Topshirmagan
            </span>
        ) : (
            <span className="text-muted-foreground/60">—</span>
        );
    }
    const graded = cell.status === 'graded';
    return (
        <button
            type="button"
            onClick={onOpen}
            title={graded ? "Bahoni o'zgartirish" : 'Tekshirish va baho qo\'yish'}
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-0.5 hover:bg-muted/60"
        >
            <span
                className={cn(
                    'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                    graded ? REVIEW_CLASS.graded : REVIEW_CLASS.pending,
                )}
            >
                {graded ? `${cell.grade} / ${homework.max_grade}` : 'Tekshirilmagan'}
            </span>
            {cell.late && <span className="text-[10px] font-medium text-destructive">kech topshirilgan</span>}
        </button>
    );
}

function QuizCell({ cell }: { cell?: GradebookRow['quizzes'][number] }) {
    if (!cell || cell.grade == null) return <span className="text-muted-foreground/60">—</span>;
    const details = [
        `${cell.correct_answers ?? 0} to'g'ri, ${cell.wrong_answers ?? 0} xato`,
        cell.attempts > 1 ? `${cell.attempts} urinish` : null,
        cell.cheating_detected ? "ko'chirish aniqlangan" : null,
    ].filter(Boolean).join(' · ');
    return (
        <span className="inline-flex flex-col items-center gap-0.5" title={details}>
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums', QUIZ_GRADE_CLASS(cell.grade))}>
                {cell.cheating_detected && <AlertTriangle className="h-3 w-3" />}
                {cell.grade}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
                {cell.correct_answers ?? 0}/{(cell.correct_answers ?? 0) + (cell.wrong_answers ?? 0)}
            </span>
        </span>
    );
}

function summarize(data: Gradebook) {
    let submitted = 0;
    let graded = 0;
    let tookQuiz = 0;
    for (const row of data.students) {
        if (row.homework) {
            submitted += 1;
            if (row.homework.status === 'graded') graded += 1;
        }
        if (row.quizzes.some((cell) => cell.grade != null)) tookQuiz += 1;
    }
    return { submitted, graded, pending: submitted - graded, tookQuiz };
}

async function exportExcel(data: Gradebook) {
    try {
        const { utils, writeFile } = await import('xlsx');
        const header = [
            '#',
            'F.I.SH',
            'Guruh',
            ...(data.homework ? [`Uy vazifasi (1–${data.homework.max_grade})`] : []),
            ...data.quizzes.map((quiz) => `${quiz.title} (test)`),
        ];
        const rows = data.students.map((row, index) => [
            index + 1,
            row.full_name,
            row.group_name ?? '',
            ...(data.homework
                ? [row.homework ? (row.homework.status === 'graded' ? row.homework.grade ?? '' : 'Tekshirilmagan') : '']
                : []),
            ...data.quizzes.map((quiz) => row.quizzes.find((cell) => cell.quiz_id === quiz.id)?.grade ?? ''),
        ]);
        const sheet = utils.aoa_to_sheet([header, ...rows]);
        const book = utils.book_new();
        utils.book_append_sheet(book, sheet, 'Baholar');
        writeFile(book, `Baholash_jurnali_dars_${data.lesson_id}.xlsx`);
    } catch {
        toast.error("Faylni yuklab bo'lmadi");
    }
}
