import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCheck, Lock, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLessonAttendance, useSaveLessonAttendance } from '@/hooks/useAttendance';
import {
    ATTENDANCE_LABELS,
    type AttendanceMarkItem,
    type AttendanceStatus,
} from '@/services/attendanceService';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';

const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
    present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
    late: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40',
    absent: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40',
    excused: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/40',
};

/**
 * Dars davomati. Belgilar avval faqat mahalliy holatda to'planadi va bitta
 * tugma bilan yuboriladi: avtosaqlashda tasodifiy bosish 30 talabaning
 * jurnalini o'zgartirardi va uni qaytarib bo'lmasdi.
 */
export const LessonAttendancePanel = ({ lessonId }: { lessonId: number }) => {
    const [groupId, setGroupId] = useState<number | undefined>(undefined);
    // Faqat o'zgartirilganlar: butun ro'yxatni yuborish har saqlashda
    // tegilmagan qatorlarning `marked_by` sini ham qayta yozardi.
    const [draft, setDraft] = useState<Record<number, AttendanceStatus | null>>({});

    const { data, isLoading, isError, refetch } = useLessonAttendance(lessonId, groupId);
    const saveMutation = useSaveLessonAttendance(lessonId);

    const groupOptions = useMemo(
        () =>
            (data?.groups ?? []).map((g) => ({
                value: String(g.id),
                label: `${g.name} — ${g.marked_count}/${g.student_count}`,
            })),
        [data?.groups]
    );

    const students = data?.students ?? [];
    const isEditable = data?.is_editable ?? true;
    const dirtyCount = Object.keys(draft).length;

    const statusOf = (studentId: number, saved: AttendanceStatus | null): AttendanceStatus | null =>
        studentId in draft ? draft[studentId] : saved;

    const setStatus = (studentId: number, saved: AttendanceStatus | null, next: AttendanceStatus) => {
        setDraft((prev) => {
            const copy = { ...prev };
            const current = studentId in copy ? copy[studentId] : saved;
            // Faol tugmani qayta bosish — belgini olib tashlash.
            const value = current === next ? null : next;
            if (value === saved) delete copy[studentId];
            else copy[studentId] = value;
            return copy;
        });
    };

    const markAllPresent = () => {
        setDraft((prev) => {
            const copy = { ...prev };
            students.forEach((row) => {
                const current = row.student_id in copy ? copy[row.student_id] : row.status;
                if (current == null) copy[row.student_id] = 'present';
            });
            return copy;
        });
    };

    const handleSave = () => {
        const items: AttendanceMarkItem[] = Object.entries(draft).map(([studentId, status]) => ({
            student_id: Number(studentId),
            status,
        }));
        if (items.length === 0) return;

        saveMutation.mutate(
            { items, groupId: data?.group_id ?? groupId },
            {
                onSuccess: () => {
                    setDraft({});
                    toast.success('Davomat saqlandi');
                },
                onError: () => toast.error("Davomatni saqlab bo'lmadi"),
            }
        );
    };

    if (isError) return <ErrorState onRetry={() => refetch()} />;

    if (isLoading && !data) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
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
                description="Bu darsning kursiga guruh biriktirilmagan, davomat olish uchun ro'yxat yo'q."
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
                            onChange={(val) => {
                                // Saqlanmagan o'zgarishlar boshqa guruhga
                                // yopishib qolmasligi kerak.
                                setDraft({});
                                setGroupId(Number(val));
                            }}
                            placeholder="Guruhni tanlang"
                        />
                    </div>
                )}

                {data && !data.group_required && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
                            Keldi: {data.present_count}
                        </span>
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                            Kechikdi: {data.late_count}
                        </span>
                        <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-700 dark:text-rose-400">
                            Kelmadi: {data.absent_count}
                        </span>
                        <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-700 dark:text-sky-400">
                            Sababli: {data.excused_count}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                            Belgilanmagan: {data.unmarked_count}
                        </span>
                    </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {isEditable && students.length > 0 && (
                        <Button variant="outline" size="sm" onClick={markAllPresent}>
                            <CheckCheck className="mr-2 h-4 w-4" />
                            Hammasi keldi
                        </Button>
                    )}
                    {isEditable && (
                        <Button size="sm" onClick={handleSave} disabled={dirtyCount === 0 || saveMutation.isPending}>
                            <Save className="mr-2 h-4 w-4" />
                            Saqlash{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
                        </Button>
                    )}
                </div>
            </div>

            {!isEditable && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>
                        Jurnal yopilgan{data?.locked_after ? ` (${data.locked_after} dan keyin)` : ''} — endi faqat
                        ko'rish mumkin.
                    </span>
                </div>
            )}

            {data?.group_required ? (
                <EmptyState
                    icon={<Users className="h-6 w-6" />}
                    title="Guruhni tanlang"
                    description="Bu dars kursning bir nechta guruhiga tegishli — davomat guruh bo'yicha olinadi."
                />
            ) : students.length === 0 ? (
                <EmptyState
                    icon={<Users className="h-6 w-6" />}
                    title="Talaba yo'q"
                    description="Bu guruhda talaba ro'yxati bo'sh."
                />
            ) : (
                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
                    {students.map((row, index) => {
                        const current = statusOf(row.student_id, row.status);
                        const changed = row.student_id in draft;
                        return (
                            <div
                                key={row.student_id}
                                className={cn(
                                    'flex flex-wrap items-center gap-3 p-3 transition-colors',
                                    changed && 'bg-primary/[0.04]'
                                )}
                            >
                                <span className="w-6 shrink-0 text-center font-mono text-xs text-muted-foreground">
                                    {index + 1}
                                </span>
                                <div
                                    className={cn(
                                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
                                        tileFor(row.student_id)
                                    )}
                                >
                                    {initialsOf(row.full_name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold">{row.full_name}</p>
                                    <p className="font-mono text-xs text-muted-foreground">
                                        {row.student_id_number || '—'}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {STATUS_ORDER.map((status) => (
                                        <button
                                            key={status}
                                            type="button"
                                            disabled={!isEditable}
                                            onClick={() => setStatus(row.student_id, row.status, status)}
                                            className={cn(
                                                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                                                current === status
                                                    ? STATUS_STYLES[status]
                                                    : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                                                !isEditable && 'cursor-not-allowed opacity-60'
                                            )}
                                        >
                                            {ATTENDANCE_LABELS[status]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
