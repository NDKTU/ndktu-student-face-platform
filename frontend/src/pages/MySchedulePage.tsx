import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CalendarX2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MonthCalendar } from '@/components/schedule/MonthCalendar';
import { WeekCalendar } from '@/components/schedule/WeekCalendar';
import { WeekList } from '@/components/schedule/WeekList';
import { MonthNav, ViewToggle, WeekNav } from '@/components/schedule/ScheduleControls';
import { useScheduleView } from '@/hooks/useScheduleView';
import {
    buildWeek,
    monthStartOf,
    mondayOf,
    toIsoDate,
    viewRange,
} from '@/components/schedule/scheduleUtils';
import { useMySchedule } from '@/hooks/useHemisSchedule';
import { formatDate, formatDayMonth } from '@/utils/date';

/**
 * «Dars jadvali» — HEMIS jadvali: haftalik ro'yxat, haftalik setka yoki oy.
 *
 * Kim ekanligini bekend login bo'yicha aniqlaydi: o'qituvchi —
 * `employee_id_number`, talaba — HEMIS guruhi. Login mos kelmasa ro'yxat
 * shunchaki bo'sh keladi.
 */
const MySchedulePage = () => {
    const { t } = useTranslation();
    const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
    const [monthStart, setMonthStart] = useState(() => monthStartOf(new Date()));
    const [view, setView] = useScheduleView('schedule:view');

    const [dateFrom, dateTo] = viewRange(view, weekStart, monthStart);
    const { data, isLoading, isError, refetch, isFetching } = useMySchedule(dateFrom, dateTo);

    const today = toIsoDate(new Date());
    const isTeacher = data?.as_role === 'teacher';
    const days = useMemo(() => buildWeek(data?.items ?? [], weekStart, isTeacher), [data, weekStart, isTeacher]);
    const totalLessons =
        view === 'month' ? (data?.items.length ?? 0) : days.reduce((sum, day) => sum + day.lessons.length, 0);
    const show = isTeacher ? 'groups' : 'teacher';

    const renderBody = () => {
        if (isLoading) {
            return (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-48 rounded-2xl" />
                    ))}
                </div>
            );
        }
        if (isError) {
            return <ErrorState onRetry={() => refetch()} />;
        }
        if (data && data.as_role === null) {
            return (
                <EmptyState
                    icon={<CalendarX2 className="h-8 w-8" />}
                    title={t('Dars jadvali mavjud emas')}
                    description={t("Jadval faqat o'qituvchi va talabalar uchun ko'rsatiladi")}
                />
            );
        }
        // Bo'sh oy ham setka bo'lib chiqadi: qaysi oy ekanini ko'rish foydali.
        if (view === 'month') {
            return (
                <div className={isFetching ? 'opacity-60' : ''}>
                    <MonthCalendar
                        key={toIsoDate(monthStart)}
                        monthStart={monthStart}
                        items={data?.items ?? []}
                        today={today}
                        show={show}
                        merge={isTeacher}
                    />
                </div>
            );
        }
        if (totalLessons === 0) {
            return (
                <EmptyState
                    icon={<CalendarX2 className="h-8 w-8" />}
                    title={t("Bu haftada dars yo'q")}
                    description={t('HEMIS jadvalida tanlangan hafta uchun darslar topilmadi')}
                />
            );
        }
        return (
            <div className={isFetching ? 'opacity-60' : ''}>
                {view === 'week' ? (
                    <WeekCalendar days={days} today={today} show={show} />
                ) : (
                    <WeekList days={days} today={today} show={show} />
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('Dars jadvali')}
                description={t('HEMIS jadvali asosida')}
                actions={
                    <>
                        <ViewToggle view={view} onChange={setView} />
                        {view === 'month' ? (
                            <MonthNav monthStart={monthStart} onChange={setMonthStart} />
                        ) : (
                            <WeekNav weekStart={weekStart} onChange={setWeekStart} />
                        )}
                    </>
                }
            />
            {view !== 'month' && (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    <span className="font-medium text-foreground tabular-nums">
                        {formatDayMonth(dateFrom)} – {formatDate(dateTo)}
                    </span>
                    {totalLessons > 0 && <span>· {t('{{count}} ta dars', { count: totalLessons })}</span>}
                </div>
            )}
            {renderBody()}
        </div>
    );
};

export default MySchedulePage;
