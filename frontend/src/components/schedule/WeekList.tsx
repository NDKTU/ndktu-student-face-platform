import { useTranslation } from 'react-i18next';
import { formatDate } from '@/utils/date';
import { LessonCard } from './LessonCard';
import type { WeekDay } from './scheduleUtils';

interface WeekListProps {
    days: WeekDay[];
    today: string;
    /** O'qituvchiga — guruh(lar), talabaga — o'qituvchi. */
    show: 'groups' | 'teacher';
}

/** Haftaning kunlari kartochkalar bo'lib: har kunda o'sha kungi darslar. */
export const WeekList = ({ days, today, show }: WeekListProps) => {
    const { t } = useTranslation();
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {days.map((day) => {
                const isToday = day.iso === today;
                return (
                    <section
                        key={day.iso}
                        className={`rounded-2xl border bg-card/50 p-3 ${
                            isToday ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'
                        }`}
                    >
                        <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
                            <h2 className={`font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                                {t(day.name)}
                                {isToday && (
                                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                        {t('Bugun')}
                                    </span>
                                )}
                            </h2>
                            <span className="text-xs text-muted-foreground tabular-nums">{formatDate(day.iso)}</span>
                        </header>
                        {day.lessons.length ? (
                            <div className="space-y-2">
                                {day.lessons.map(({ lesson, groups }) => (
                                    <LessonCard key={lesson.hemis_id} lesson={lesson} groups={groups} show={show} />
                                ))}
                            </div>
                        ) : (
                            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                                {t("Dars yo'q")}
                            </p>
                        )}
                    </section>
                );
            })}
        </div>
    );
};
