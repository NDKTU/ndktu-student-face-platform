/**
 * Kurs baholash jurnali: qatorda — guruh talabasi, ustunda — kursning barcha
 * darslari. Har dars ostida uning uy vazifasi va testlari, oxirida — darsga
 * bog'lanmagan kurs topshiriqlari va o'rtacha baho.
 *
 * Ilgari o'qituvchi baholarni faqat dars ichida, bittalab ko'rardi. Bu yerda
 * butun kurs bitta jadvalda — qog'oz jurnal kabi guruh bo'yicha. Tekshirilmagan
 * ishni bosganda to'g'ridan-to'g'ri tekshirish sahifasiga o'tadi.
 */
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, BookOpen, Download, Search, Users } from 'lucide-react';
import { useCourseGradebook } from '@/hooks/useCourses';
import type { CourseGradebook as Gradebook, CourseGradebookRow } from '@/services/courseService';
import type { GradebookHomework, GradebookQuiz } from '@/services/lessonService';
import { CardAction } from '@/components/ui/CardAction';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { LATE_CLASS, REVIEW_CLASS, isPastDeadline } from '@/components/homework/homeworkStatus';
import { GRADE_LEVELS, GRADE_TONE, GRADE_WORD, gradeTone as gradeClass } from '@/components/courses/gradeScale';
import { formatDayMonth } from '@/utils/date';
import { cn } from '@/lib/utils';

type Column =
    | { kind: 'homework'; key: string; label: string; homework: GradebookHomework }
    | { kind: 'quiz'; key: string; label: string; quiz: GradebookQuiz }
    // Topshirig'i yo'q dars ham jurnalda turadi — o'qituvchi uni ko'rsin.
    | { kind: 'none'; key: string; label: string };

interface ColumnGroup {
    key: string;
    lessonId?: number;
    heading: string;
    topic: string;
    columns: Column[];
}

const BADGE = 'inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-md border px-1 text-[11px] font-bold tabular-nums';

export const CourseGradebook = ({ courseId }: { courseId: number }) => {
    const navigate = useNavigate();
    const [groupId, setGroupId] = useState<number | undefined>(undefined);
    const [search, setSearch] = useState('');
    const { data, isLoading, isError, refetch } = useCourseGradebook(courseId, groupId);

    const columnGroups = useMemo(() => (data ? buildColumns(data) : []), [data]);
    const columns = useMemo(() => columnGroups.flatMap((group) => group.columns), [columnGroups]);

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return (data?.students ?? []).filter((row) => !needle || row.full_name.toLowerCase().includes(needle));
    }, [data, search]);

    const groupOptions = useMemo(
        () => (data?.groups ?? []).map((g) => ({ value: String(g.id), label: `${g.name} — ${g.student_count} ta talaba` })),
        [data?.groups],
    );

    if (isError) return <ErrorState title="Jurnalni yuklab bo'lmadi" onRetry={() => void refetch()} />;
    if (isLoading || !data) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
            </div>
        );
    }
    if (data.groups.length === 0) {
        return (
            <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Guruh yo'q"
                description="Kursga guruh biriktirilmagan — jurnal uchun ro'yxat yo'q."
            />
        );
    }

    const groupName = data.groups.find((g) => g.id === data.group_id)?.name ?? '';
    const taskCount = columns.filter((column) => column.kind !== 'none').length;
    const pending = countPending(data);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                {data.groups.length > 1 && (
                    <div className="w-full sm:w-[280px]">
                        <Combobox
                            options={groupOptions}
                            value={data.group_id ? String(data.group_id) : ''}
                            onChange={(value) => {
                                // Tanlangan guruhni qayta bosish Combobox da «tanlovni
                                // bekor qilish» (`''`) — jurnal esa guruhsiz ochilmaydi
                                // va bekend birinchi guruhga qaytarib yuborardi.
                                if (!value) return;
                                setGroupId(Number(value));
                                // Oldingi guruhda yozilgan ism yangi guruhda topilmaydi
                                // va butun ro'yxatni yashirib qo'yardi.
                                setSearch('');
                            }}
                            placeholder="Guruhni tanlang"
                        />
                    </div>
                )}
                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Talaba ismi"
                        className="h-9 pl-9 text-sm"
                    />
                </div>
                {data.students.length > 0 && taskCount > 0 && (
                    <CardAction
                        variant="outline"
                        className="ml-auto"
                        onClick={() => void exportExcel(data, columnGroups, groupName)}
                        icon={<Download className="h-4 w-4" />}
                        label="Excel"
                    />
                )}
            </div>

            {/* Qisqa xulosa: nima qilish kerakligi darhol ko'rinsin. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span>Talabalar: <b className="text-foreground tabular-nums">{data.students.length}</b></span>
                <span>Darslar: <b className="text-foreground tabular-nums">{data.lessons.length}</b></span>
                <span>Baholanadigan topshiriqlar: <b className="text-foreground tabular-nums">{taskCount}</b></span>
                {pending > 0 && (
                    <span className="text-amber-700 dark:text-amber-400">
                        Tekshirilmagan ishlar: <b className="tabular-nums">{pending}</b>
                    </span>
                )}
            </div>

            {/* Darsi yo'q guruhda ham ro'yxat ko'rinadi: ilgari bu holatda jadval
                o'rniga «Dars yo'q» chiqib, guruh tanlangandan keyin uning
                talabalari umuman ko'rinmasdi. */}
            {columnGroups.length === 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Bu guruhga hali dars yaratilmagan — baholar darslar qo'shilgach shu jadvalda paydo bo'ladi.</span>
                </div>
            )}

            {data.students.length === 0 ? (
                <EmptyState
                    icon={<Users className="h-6 w-6" />}
                    title="Talaba yo'q"
                    description="Bu guruhda talaba ro'yxati bo'sh."
                />
            ) : (
                /* Keng jadval — o'z ichida gorizontal aylanadi, sahifa emas. */
                <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                        <thead className="bg-muted/40">
                            <tr>
                                {/* Yopishqoq ustun shaffof bo'lmasligi kerak: karta rangi ustiga
                                    sarlavhaning muted/40 qatlami — qolgan sarlavha bilan bir xil. */}
                                <th rowSpan={2} className="sticky left-0 z-10 bg-card bg-linear-to-r from-muted/40 to-muted/40 px-3 py-2 text-left align-bottom text-xs font-bold">
                                    Talaba
                                </th>
                                {columnGroups.map((group) => (
                                    <th
                                        key={group.key}
                                        colSpan={group.columns.length}
                                        className="border-l border-border/60 px-2 pt-2 pb-1 text-left align-top"
                                    >
                                        {group.lessonId ? (
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/lessons/${group.lessonId}`)}
                                                title={`${group.topic} — darsni ochish`}
                                                className="block max-w-[11rem] min-w-[4.5rem] rounded text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <span className="block text-[11px] font-bold tabular-nums whitespace-nowrap text-primary">{group.heading}</span>
                                                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-muted-foreground">
                                                    {group.topic}
                                                </span>
                                            </button>
                                        ) : (
                                            <span className="block text-[11px] font-bold whitespace-nowrap text-primary">{group.heading}</span>
                                        )}
                                    </th>
                                ))}
                                <th rowSpan={2} className="border-l border-border/60 px-3 py-2 text-center align-bottom text-xs font-bold whitespace-nowrap">
                                    O'rtacha
                                </th>
                            </tr>
                            <tr>
                                {columnGroups.map((group) =>
                                    group.columns.map((column, index) => (
                                        <th
                                            key={column.key}
                                            title={columnTitle(column)}
                                            className={cn(
                                                'px-2 pb-2 text-center text-[10px] font-semibold whitespace-nowrap text-muted-foreground',
                                                index === 0 && 'border-l border-border/60',
                                            )}
                                        >
                                            <span className="block max-w-[7rem] truncate">{column.label}</span>
                                        </th>
                                    )),
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => {
                                const average = rowAverage(row, columns);
                                return (
                                    <tr key={row.student_id}>
                                        <td className="sticky left-0 z-10 border-t border-border/50 bg-card px-3 py-2 whitespace-nowrap">
                                            <span className="mr-2 text-[11px] tabular-nums text-muted-foreground">{rowIndex + 1}</span>
                                            <span className="font-medium">{row.full_name}</span>
                                        </td>
                                        {columnGroups.map((group) => (
                                            <Fragment key={group.key}>
                                                {group.columns.map((column, index) => (
                                                    <td
                                                        key={column.key}
                                                        className={cn(
                                                            'border-t border-border/50 px-2 py-2 text-center',
                                                            index === 0 && 'border-l border-border/60',
                                                        )}
                                                    >
                                                        <GradeCell
                                                            row={row}
                                                            column={column}
                                                            onOpenHomework={(id) => navigate(`/homework/${id}/submissions`)}
                                                        />
                                                    </td>
                                                ))}
                                            </Fragment>
                                        ))}
                                        <td className="border-t border-l border-border/60 px-3 py-2 text-center">
                                            {average ? (
                                                <span
                                                    title={`${average.count} ta baho bo'yicha, 5 balli shkalada`}
                                                    className={cn(BADGE, 'px-1.5', gradeClass(average.value))}
                                                >
                                                    {average.value.toFixed(1)}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/60">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {rows.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">Qidiruvga mos talaba topilmadi.</p>
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {GRADE_LEVELS.map((level) => (
                    <span key={level} className="inline-flex items-center gap-1.5">
                        <span className={cn(BADGE, GRADE_TONE[level])}>{level}</span> {GRADE_WORD[level].toLowerCase()}
                    </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                    <span className={cn(BADGE, REVIEW_CLASS.pending)}>?</span> tekshirilmagan — bosib baholang
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className={cn(BADGE, LATE_CLASS)}>✕</span> muddati o'tgan, topshirilmagan
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="text-muted-foreground/60">·</span> hali topshirilmagan
                </span>
                <span>Testda bir necha urinish bo'lsa — oxirgisi. O'rtacha 5 balli shkalada.</span>
            </div>
        </div>
    );
};

function GradeCell({
    row,
    column,
    onOpenHomework,
}: {
    row: CourseGradebookRow;
    column: Column;
    onOpenHomework: (homeworkId: number) => void;
}) {
    if (column.kind === 'none') return <span className="text-muted-foreground/30">·</span>;

    if (column.kind === 'quiz') {
        const cell = row.quizzes[String(column.quiz.id)];
        if (!cell || cell.grade == null) return <span className="text-muted-foreground/60">·</span>;
        const details = [
            column.quiz.title,
            `${cell.correct_answers ?? 0} to'g'ri, ${cell.wrong_answers ?? 0} xato`,
            cell.attempts > 1 ? `${cell.attempts} urinish, oxirgisi` : null,
            cell.cheating_detected ? "ko'chirish aniqlangan" : null,
        ].filter(Boolean).join(' · ');
        return (
            <span title={details} className={cn(BADGE, gradeClass(cell.grade))}>
                {cell.cheating_detected && <AlertTriangle className="h-3 w-3" />}
                {cell.grade}
            </span>
        );
    }

    const { homework } = column;
    const cell = row.homeworks[String(homework.id)];
    if (!cell) {
        return isPastDeadline(homework.deadline) ? (
            <span title={`${homework.title} — topshirilmagan`} className={cn(BADGE, LATE_CLASS)}>✕</span>
        ) : (
            <span title={`${homework.title} — muddat ${formatDayMonth(homework.deadline)}`} className="text-muted-foreground/60">·</span>
        );
    }
    const graded = cell.status === 'graded' && cell.grade != null;
    return (
        <button
            type="button"
            onClick={() => onOpenHomework(homework.id)}
            title={[
                homework.title,
                graded ? `${cell.grade} / ${homework.max_grade}` : 'tekshirilmagan',
                cell.late ? 'kech topshirilgan' : null,
            ].filter(Boolean).join(' · ')}
            className={cn(
                BADGE,
                'relative transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                graded ? gradeClass((cell.grade! * 5) / homework.max_grade) : REVIEW_CLASS.pending,
            )}
        >
            {graded ? cell.grade : '?'}
            {/* Kechikish holatdan emas, vaqtdan — baholangandan keyin ham ko'rinsin. */}
            {cell.late && <span aria-hidden className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />}
        </button>
    );
}

function buildColumns(data: Gradebook): ColumnGroup[] {
    const groups: ColumnGroup[] = data.lessons.map((lesson, index) => {
        const columns: Column[] = [
            ...(lesson.homework
                ? [{ kind: 'homework' as const, key: `h${lesson.homework.id}`, label: 'Vazifa', homework: lesson.homework }]
                : []),
            ...lesson.quizzes.map((quiz, quizIndex) => ({
                kind: 'quiz' as const,
                key: `q${quiz.id}`,
                label: lesson.quizzes.length > 1 ? `Test ${quizIndex + 1}` : 'Test',
                quiz,
            })),
        ];
        return {
            key: `l${lesson.id}`,
            lessonId: lesson.id,
            heading: `${index + 1}-dars · ${formatDayMonth(lesson.date)}`,
            topic: lesson.topic,
            columns: columns.length > 0 ? columns : [{ kind: 'none', key: `n${lesson.id}`, label: '—' }],
        };
    });
    if (data.course_homeworks.length > 0) {
        groups.push({
            key: 'course',
            heading: 'Kurs topshiriqlari',
            topic: '',
            columns: data.course_homeworks.map((homework) => ({
                kind: 'homework' as const,
                key: `h${homework.id}`,
                label: homework.title,
                homework,
            })),
        });
    }
    return groups;
}

function columnTitle(column: Column): string {
    if (column.kind === 'homework') return `Uy vazifasi: ${column.homework.title} (1–${column.homework.max_grade})`;
    if (column.kind === 'quiz') return `Test: ${column.quiz.title} (2–5)`;
    return "Baholanadigan topshiriq yo'q";
}

/** Barcha baholar 5 balli shkalaga keltirilib o'rtachasi — talabaning «Baholarim» dagi qoida. */
function rowAverage(row: CourseGradebookRow, columns: Column[]) {
    const onFive: number[] = [];
    for (const column of columns) {
        if (column.kind === 'homework') {
            const cell = row.homeworks[String(column.homework.id)];
            if (cell?.status === 'graded' && cell.grade != null) onFive.push((cell.grade * 5) / column.homework.max_grade);
        } else if (column.kind === 'quiz') {
            const grade = row.quizzes[String(column.quiz.id)]?.grade;
            if (grade != null) onFive.push(grade);
        }
    }
    if (onFive.length === 0) return null;
    return { value: onFive.reduce((a, b) => a + b, 0) / onFive.length, count: onFive.length };
}

function countPending(data: Gradebook): number {
    let pending = 0;
    for (const row of data.students) {
        for (const cell of Object.values(row.homeworks)) if (cell.status !== 'graded') pending += 1;
    }
    return pending;
}

async function exportExcel(data: Gradebook, groups: ColumnGroup[], groupName: string) {
    try {
        const { utils, writeFile } = await import('xlsx');
        const columns = groups.flatMap((group) =>
            group.columns
                .filter((column) => column.kind !== 'none')
                .map((column) => ({ group, column })),
        );
        const header = [
            '#',
            'F.I.SH',
            'Talaba ID',
            ...columns.map(({ group, column }) => {
                const prefix = group.lessonId ? `${group.heading} — ` : '';
                if (column.kind === 'homework') return `${prefix}Uy vazifasi: ${column.homework.title}`;
                return column.kind === 'quiz' ? `${prefix}Test: ${column.quiz.title}` : prefix;
            }),
            "O'rtacha (5 balli)",
        ];
        const allColumns = columns.map(({ column }) => column);
        const rows = data.students.map((row, index) => {
            const average = rowAverage(row, allColumns);
            return [
                index + 1,
                row.full_name,
                row.student_id_number ?? '',
                ...allColumns.map((column) => {
                    if (column.kind === 'quiz') return row.quizzes[String(column.quiz.id)]?.grade ?? '';
                    if (column.kind !== 'homework') return '';
                    const cell = row.homeworks[String(column.homework.id)];
                    if (!cell) return isPastDeadline(column.homework.deadline) ? 'Topshirmagan' : '';
                    return cell.status === 'graded' ? cell.grade ?? '' : 'Tekshirilmagan';
                }),
                average ? Number(average.value.toFixed(2)) : '',
            ];
        });
        const sheet = utils.aoa_to_sheet([header, ...rows]);
        const book = utils.book_new();
        utils.book_append_sheet(book, sheet, 'Baholar');
        writeFile(book, `Baholash_jurnali_${groupName || data.course_id}.xlsx`);
    } catch {
        toast.error("Faylni yuklab bo'lmadi");
    }
}
