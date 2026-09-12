import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Users } from 'lucide-react';
import { CardAction } from '@/components/ui/CardAction';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCourseAttendance } from '@/hooks/useAttendance';
import { ATTENDANCE_LABELS, type AttendanceStatus } from '@/services/attendanceService';
import { cn } from '@/lib/utils';

/** Katakdagi bitta harf: to'liq nom matritsani o'qib bo'lmas holga keltirardi. */
const SHORT: Record<AttendanceStatus, string> = {
    present: 'K',
    late: 'Kh',
    absent: 'Y',
    excused: 'S',
};

const CELL_STYLES: Record<AttendanceStatus, string> = {
    present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    late: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    absent: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    excused: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
};

const percentColor = (percent: number | null) => {
    if (percent === null) return 'text-muted-foreground';
    if (percent >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (percent >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
};

/**
 * Kurs jurnali: darslar × talabalar. Faqat ko'rish uchun — belgilash dars
 * sahifasida, aks holda bitta katakni bosish qaysi darsga tegishli ekani
 * matritsada osongina adashtirardi.
 */
export const CourseAttendanceJournal = ({ courseId }: { courseId: number }) => {
    const [groupId, setGroupId] = useState<number | undefined>(undefined);
    const { data, isLoading, isError, refetch } = useCourseAttendance(courseId, groupId);

    const groupOptions = useMemo(
        () =>
            (data?.groups ?? []).map((g) => ({
                value: String(g.id),
                label: `${g.name} — ${g.student_count} ta talaba`,
            })),
        [data?.groups]
    );

    const exportExcel = async () => {
        if (!data || data.students.length === 0) return;
        try {
            const { utils, writeFile } = await import('xlsx');
            const groupName = data.groups.find((g) => g.id === data.group_id)?.name ?? '';
            const header = [
                '#',
                'F.I.SH',
                'Talaba ID',
                ...data.lessons.map((lesson) => `${lesson.date} ${lesson.topic}`),
                'Keldi',
                'Kechikdi',
                'Kelmadi',
                'Sababli',
                'Davomat %',
            ];
            const rows = data.students.map((student, index) => [
                index + 1,
                student.full_name,
                student.student_id_number ?? '',
                ...data.lessons.map((lesson) => {
                    const status = student.marks[String(lesson.id)];
                    return status ? ATTENDANCE_LABELS[status] : '';
                }),
                student.stats.present,
                student.stats.late,
                student.stats.absent,
                student.stats.excused,
                student.stats.percent ?? '',
            ]);
            const sheet = utils.aoa_to_sheet([header, ...rows]);
            const book = utils.book_new();
            utils.book_append_sheet(book, sheet, 'Davomat');
            writeFile(book, `Davomat_${groupName || courseId}.xlsx`);
        } catch {
            toast.error("Faylni yuklab bo'lmadi");
        }
    };

    if (isError) return <ErrorState onRetry={() => refetch()} />;

    if (isLoading && !data) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full rounded-xl" />
                ))}
            </div>
        );
    }

    if ((data?.groups.length ?? 0) === 0) {
        return (
            <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Guruh yo'q"
                description="Kursga guruh biriktirilmagan — jurnal uchun ro'yxat yo'q."
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                {(data?.groups.length ?? 0) > 1 && (
                    <div className="w-full sm:w-[280px]">
                        <Combobox
                            options={groupOptions}
                            value={groupId ? String(groupId) : ''}
                            onChange={(val) => setGroupId(Number(val))}
                            placeholder="Guruhni tanlang"
                        />
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">K</span>
                    keldi
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-400">Kh</span>
                    kechikdi
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-700 dark:text-rose-400">Y</span>
                    kelmadi
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-semibold text-sky-700 dark:text-sky-400">S</span>
                    sababli
                </div>
                {(data?.students.length ?? 0) > 0 && (
                    <CardAction
                        variant="outline"
                        className="ml-auto"
                        onClick={exportExcel}
                        icon={<Download className="h-4 w-4" />}
                        label="Excel"
                    />
                )}
            </div>

            {data?.group_required ? (
                <EmptyState
                    icon={<Users className="h-6 w-6" />}
                    title="Guruhni tanlang"
                    description="Kursda bir nechta guruh bor — jurnal guruh bo'yicha ochiladi."
                />
            ) : (data?.lessons.length ?? 0) === 0 ? (
                <EmptyState
                    icon={<Users className="h-6 w-6" />}
                    title="Dars yo'q"
                    description="Bu guruhga dars yaratilmagan — jurnalda ustun yo'q."
                />
            ) : (data?.students.length ?? 0) === 0 ? (
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
                                <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-bold">
                                    Talaba
                                </th>
                                {data!.lessons.map((lesson) => (
                                    <th
                                        key={lesson.id}
                                        title={`${lesson.topic} — ${lesson.date}`}
                                        className="px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground whitespace-nowrap"
                                    >
                                        {lesson.date.slice(5)}
                                    </th>
                                ))}
                                <th className="px-3 py-2 text-right text-xs font-bold whitespace-nowrap">Davomat</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data!.students.map((student) => (
                                <tr key={student.student_id} className="border-t border-border/50">
                                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium whitespace-nowrap">
                                        {student.full_name}
                                    </td>
                                    {data!.lessons.map((lesson) => {
                                        const status = student.marks[String(lesson.id)];
                                        return (
                                            <td key={lesson.id} className="px-2 py-2 text-center">
                                                {status ? (
                                                    <span
                                                        title={ATTENDANCE_LABELS[status]}
                                                        className={cn(
                                                            'inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold',
                                                            CELL_STYLES[status]
                                                        )}
                                                    >
                                                        {SHORT[status]}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground/50">·</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td
                                        className={cn(
                                            'px-3 py-2 text-right font-mono text-xs font-semibold',
                                            percentColor(student.stats.percent)
                                        )}
                                    >
                                        {student.stats.percent === null ? '—' : `${student.stats.percent}%`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
