import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { formatDayMonth } from '@/utils/date';
import { hhmm, trainingTone, type DayLesson, type WeekDay } from './scheduleUtils';

interface WeekCalendarProps {
    days: WeekDay[];
    today: string;
    /** O'qituvchiga — guruh(lar), talabaga — o'qituvchi. */
    show: 'groups' | 'teacher';
}

/** «5» → 5. Raqam bo'lmagan juftlik oxiriga tushadi, lekin yo'qolmaydi. */
const pairOrder = (pair: string) => {
    const value = Number.parseInt(pair, 10);
    return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
};

/**
 * Haftalik kalendar: qatorlar — juftliklar, ustunlar — kunlar.
 *
 * Qatorlar shu haftada uchragan juftliklardan yig'iladi, butun setkadan emas:
 * talabada odatda 3–4 juftlik bo'ladi, 7 ta bo'sh qator esa jadvalni
 * cho'zib, kerakli joyni pastga surardi. Vaqt qatorning birinchi darsidan
 * olinadi — HEMIS'da juftlik vaqti o'quv yili bo'yicha bitta.
 */
export const WeekCalendar = ({ days, today, show }: WeekCalendarProps) => {
    const { t } = useTranslation();

    const pairs = new Map<string, { start: string; end: string }>();
    for (const day of days) {
        for (const { lesson } of day.lessons) {
            if (!pairs.has(lesson.lesson_pair)) {
                pairs.set(lesson.lesson_pair, { start: hhmm(lesson.start_time), end: hhmm(lesson.end_time) });
            }
        }
    }
    const rows = Array.from(pairs.entries()).sort(([a], [b]) => pairOrder(a) - pairOrder(b));

    return (
        // Telefonda olti ustun sig'maydi — jadval gorizontal suriladi,
        // juftlik ustuni esa joyida qoladi.
        <div className="overflow-x-auto rounded-2xl border border-border custom-scrollbar">
            <table className="w-full min-w-[880px] table-fixed border-collapse text-sm">
                <thead>
                    <tr className="bg-muted/40">
                        <th className="sticky left-0 z-10 w-20 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold text-muted-foreground">
                            {t('Para')}
                        </th>
                        {days.map((day) => {
                            const isToday = day.iso === today;
                            return (
                                <th
                                    key={day.iso}
                                    className={`border-b border-border px-2 py-2 text-left font-semibold ${
                                        isToday ? 'bg-primary/10 text-primary' : 'text-foreground'
                                    }`}
                                >
                                    <span className="block truncate">{t(day.name)}</span>
                                    <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                                        {formatDayMonth(day.iso)}
                                    </span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([pair, time]) => (
                        <tr key={pair} className="align-top">
                            <th className="sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-2 text-left">
                                <span className="block text-base font-bold text-primary">{pair}</span>
                                <span className="block text-[11px] font-normal leading-tight text-muted-foreground tabular-nums">
                                    {time.start}
                                    <br />
                                    {time.end}
                                </span>
                            </th>
                            {days.map((day) => {
                                const cell = day.lessons.filter(({ lesson }) => lesson.lesson_pair === pair);
                                return (
                                    <td
                                        key={day.iso}
                                        className={`border-b border-border p-1.5 ${day.iso === today ? 'bg-primary/5' : ''}`}
                                    >
                                        <div className="space-y-1.5">
                                            {cell.map(({ lesson, groups }) => (
                                                <CalendarCell
                                                    key={lesson.hemis_id}
                                                    lesson={lesson}
                                                    groups={groups}
                                                    show={show}
                                                />
                                            ))}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const CalendarCell = ({
    lesson,
    groups,
    show,
}: DayLesson & { show: WeekCalendarProps['show'] }) => {
    const who = show === 'groups' ? (groups.length ? groups : [lesson.group_name]).join(', ') : lesson.employee_name;
    const place = [lesson.auditorium_name, lesson.building_name].filter(Boolean).join(' · ');
    return (
        <div
            className="rounded-lg border border-border bg-card p-2 text-xs shadow-sm"
            // To'liq ma'lumot sichqoncha ostida: katakda faqat qisqasi sig'adi.
            title={[lesson.subject_name, lesson.training_type, place, who].filter(Boolean).join('\n')}
        >
            {lesson.training_type && (
                <span
                    className={`mb-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${trainingTone(lesson.training_type_code)}`}
                >
                    {lesson.training_type}
                </span>
            )}
            <p className="line-clamp-2 font-medium leading-snug text-foreground">{lesson.subject_name}</p>
            {place && (
                <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{place}</span>
                </p>
            )}
            {who && <p className="mt-0.5 truncate text-muted-foreground">{who}</p>}
        </div>
    );
};
