import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ScheduleLesson } from '@/services/hemisScheduleService';
import { formatDate } from '@/utils/date';
import { LessonCard } from './LessonCard';
import {
    WEEKDAYS,
    addDays,
    groupByDate,
    monthGrid,
    toIsoDate,
    trainingDot,
    trainingTone,
    weekdayOf,
    type DayLesson,
} from './scheduleUtils';

interface MonthCalendarProps {
    monthStart: Date;
    items: ScheduleLesson[];
    today: string;
    /** O'qituvchiga — guruh(lar), talabaga — o'qituvchi. */
    show: 'groups' | 'teacher';
    /** Oqimlarni bitta kartochkaga yig'ish (o'qituvchi ko'rinishi). */
    merge: boolean;
}

/** Katakda shunchadan ko'p plashka sig'maydi — qolgani «+N ta». */
const MAX_CHIPS = 3;

/** «Du», «Se»… — telefonda to'liq nom sig'maydi. */
const short = (name: string) => name.slice(0, 2);

/**
 * Oylik kalendar.
 *
 * Kun katagida darslar qisqa plashka: «3 · Fan nomi», rangi — mashg'ulot
 * turi. Kunga bosilsa, o'sha kunning to'liq kartochkalari oynada ochiladi:
 * katakda vaqt, auditoriya va o'qituvchi sig'maydi.
 *
 * Telefonda yetti ustun matn uchun juda tor — plashka o'rniga rangli nuqtalar,
 * tanlangan kunning darslari esa setka ostida ro'yxat bo'lib chiqadi.
 */
export const MonthCalendar = ({ monthStart, items, today, show, merge }: MonthCalendarProps) => {
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const [openDay, setOpenDay] = useState<string | null>(null);
    // Telefonda tanlangan kun: shu oy ichida bo'lsa bugun, aks holda 1-sana.
    // Oy almashganda tanlov tushib qoladi — sahifa komponentni oy bo'yicha `key` bilan chizadi.
    const [mobileDay, setMobileDay] = useState<string | null>(null);

    const byDate = useMemo(() => groupByDate(items, merge), [items, merge]);
    const { start, weeks } = monthGrid(monthStart);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    const month = monthStart.getMonth();

    const defaultMobileDay =
        cells.some((d) => toIsoDate(d) === today && d.getMonth() === month) ? today : toIsoDate(monthStart);
    const selectedMobileDay = mobileDay ?? defaultMobileDay;

    const dayLessons = (iso: string): DayLesson[] =>
        [...(byDate.get(iso) ?? [])].sort(
            (a, b) =>
                (a.lesson.start_time ?? '').localeCompare(b.lesson.start_time ?? '') ||
                // «10» satr sifatida «9» dan oldin turardi.
                a.lesson.lesson_pair.localeCompare(b.lesson.lesson_pair, undefined, { numeric: true }),
        );

    const renderLessons = (iso: string) => {
        const lessons = dayLessons(iso);
        return lessons.length ? (
            <div className="space-y-2">
                {lessons.map(({ lesson, groups }) => (
                    <LessonCard key={lesson.hemis_id} lesson={lesson} groups={groups} show={show} />
                ))}
            </div>
        ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {t("Dars yo'q")}
            </p>
        );
    };

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="grid grid-cols-7 border-b border-border bg-muted/40">
                    {WEEKDAYS.map((name) => (
                        <div
                            key={name}
                            className="px-1 py-2 text-center text-xs font-semibold text-muted-foreground sm:px-2"
                        >
                            {isMobile ? t(short(name)) : t(name)}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {cells.map((date, index) => {
                        const iso = toIsoDate(date);
                        const inMonth = date.getMonth() === month;
                        const isToday = iso === today;
                        const lessons = dayLessons(iso);
                        const isSelected = isMobile && iso === selectedMobileDay;
                        const lastColumn = index % 7 === 6;
                        const lastRow = index >= cells.length - 7;

                        return (
                            <button
                                key={iso}
                                type="button"
                                onClick={() => (isMobile ? setMobileDay(iso) : setOpenDay(iso))}
                                className={`flex flex-col gap-1 p-1 text-left transition-colors hover:bg-accent/40 sm:p-1.5 ${
                                    isMobile ? 'min-h-14' : 'min-h-28'
                                } ${lastColumn ? '' : 'border-r'} ${lastRow ? '' : 'border-b'} border-border ${
                                    inMonth ? '' : 'bg-muted/30'
                                } ${isSelected ? 'bg-primary/10' : ''}`}
                                aria-label={`${formatDate(iso)}: ${t('{{count}} ta dars', { count: lessons.length })}`}
                            >
                                <span
                                    className={`flex h-6 min-w-6 items-center justify-center self-end rounded-full px-1 text-xs tabular-nums ${
                                        isToday
                                            ? 'bg-primary font-semibold text-primary-foreground'
                                            : inMonth
                                              ? 'font-medium text-foreground'
                                              : 'text-muted-foreground/60'
                                    }`}
                                >
                                    {date.getDate()}
                                </span>

                                {isMobile ? (
                                    lessons.length > 0 && (
                                        <span className="flex flex-wrap justify-center gap-0.5">
                                            {lessons.slice(0, 4).map(({ lesson }) => (
                                                <span
                                                    key={lesson.hemis_id}
                                                    className={`h-1.5 w-1.5 rounded-full ${trainingDot(lesson.training_type_code)}`}
                                                />
                                            ))}
                                        </span>
                                    )
                                ) : (
                                    <>
                                        {lessons.slice(0, MAX_CHIPS).map(({ lesson }) => (
                                            <span
                                                key={lesson.hemis_id}
                                                className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${trainingTone(lesson.training_type_code)} ${
                                                    inMonth ? '' : 'opacity-60'
                                                }`}
                                            >
                                                {lesson.lesson_pair} · {lesson.subject_name}
                                            </span>
                                        ))}
                                        {lessons.length > MAX_CHIPS && (
                                            <span className="px-1.5 text-[11px] font-medium text-muted-foreground">
                                                {t('+{{count}} ta', { count: lessons.length - MAX_CHIPS })}
                                            </span>
                                        )}
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {isMobile && (
                <section className="space-y-2">
                    <h3 className="px-1 text-sm font-semibold text-foreground">
                        {t(weekdayOf(selectedMobileDay))}, {formatDate(selectedMobileDay)}
                    </h3>
                    {renderLessons(selectedMobileDay)}
                </section>
            )}

            <Modal
                isOpen={openDay !== null}
                onClose={() => setOpenDay(null)}
                title={openDay ? `${t(weekdayOf(openDay))}, ${formatDate(openDay)}` : ''}
            >
                {openDay && renderLessons(openDay)}
            </Modal>
        </div>
    );
};
