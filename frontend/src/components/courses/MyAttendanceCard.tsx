import { CalendarCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyAttendance } from '@/hooks/useAttendance';
import { ATTENDANCE_LABELS, type AttendanceStatus } from '@/services/attendanceService';
import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/date';

const MISS_STYLES: Record<AttendanceStatus, string> = {
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
 * Talabaning o'z davomati. Kelgan darslar sanab chiqilmaydi — savol
 * «qayerda yo'qotdim», shuning uchun ro'yxatda faqat qoldirilganlari.
 */
export const MyAttendanceCard = () => {
    const { data, isLoading, isError, error, refetch } = useMyAttendance();
    const [showMisses, setShowMisses] = useState(false);

    if (isLoading) {
        return <Skeleton className="h-40 w-full rounded-2xl" />;
    }

    // 404 — «bu hisob talabaga bog'lanmagan». Bu xato emas, holat: masalan,
    // admin hisobida `student` roli ham bor. Bunday hisobga davomat tushunchasi
    // yo'q, shuning uchun blok jim yashiriladi.
    const notAStudent = isError && isAxiosError(error) && error.response?.status === 404;

    // Qolgan xatolar (500, tarmoq) — jim yutilmaydi: talaba foizini
    // ko'rmaganda buni nosozlik deb bilishi kerak, aks holda «davomatim yo'q»
    // deb o'ylardi.
    if (isError && !notAStudent) {
        return (
            <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                    <p className="text-sm text-muted-foreground">
                        Davomat ma'lumotini yuklab bo'lmadi.
                    </p>
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Qayta urinish
                    </button>
                </CardContent>
            </Card>
        );
    }

    // Hali biror dars belgilanmagan bo'lsa ham blok ko'rsatilmaydi: bo'sh
    // «0%» talabani bekorga qo'rqitardi.
    if (!data || (data.present + data.late + data.absent + data.excused) === 0) {
        return null;
    }

    return (
        <Card>
            <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
                        <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                        Davomat
                    </h2>
                    <span className={cn('font-mono text-2xl font-bold', percentColor(data.percent))}>
                        {data.percent === null ? '—' : `${data.percent}%`}
                    </span>
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
                        Keldi: {data.present}
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-700 dark:text-amber-400">
                        Kechikdi: {data.late}
                    </span>
                    <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-700 dark:text-rose-400">
                        Kelmadi: {data.absent}
                    </span>
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-700 dark:text-sky-400">
                        Sababli: {data.excused}
                    </span>
                </div>

                {data.courses.length > 0 && (
                    <div className="space-y-1.5">
                        {data.courses.map((course) => (
                            <div
                                key={course.course_id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{course.course_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {course.subject_name || '—'}
                                    </p>
                                </div>
                                <span
                                    className={cn(
                                        'shrink-0 font-mono text-sm font-semibold',
                                        percentColor(course.percent)
                                    )}
                                >
                                    {course.percent === null ? '—' : `${course.percent}%`}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {data.misses.length > 0 && (
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setShowMisses((prev) => !prev)}
                            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                            Qoldirilgan darslar ({data.misses.length})
                            {showMisses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {showMisses && (
                            <div className="space-y-1.5">
                                {data.misses.map((miss) => (
                                    <div
                                        key={miss.lesson_id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{miss.lesson_topic}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDate(miss.lesson_date)} · {miss.course_name}
                                                {miss.comment ? ` · ${miss.comment}` : ''}
                                            </p>
                                        </div>
                                        <span
                                            className={cn(
                                                'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                                MISS_STYLES[miss.status]
                                            )}
                                        >
                                            {ATTENDANCE_LABELS[miss.status]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
