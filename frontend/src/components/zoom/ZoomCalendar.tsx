import { useMemo, useState } from 'react';
import { courseTypeLabel } from '@/services/courseTypes';
import { useNavigate } from 'react-router-dom';
import { Radio, UsersRound } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { WEEKDAYS, addDays, monthGrid, toIsoDate, weekdayOf } from '@/components/schedule/scheduleUtils';
import type { ZoomSession, ZoomSessionStatus } from '@/services/zoomSessionService';
import { formatDate, formatDayMonth, formatTime } from '@/utils/date';
import { cn } from '@/lib/utils';

/**
 * Zoom seanslari kalendari — hafta va oy.
 *
 * HEMIS jadvalidagi `WeekCalendar`/`MonthCalendar` juftlik va `hemis_id` ga
 * bog'langan, Zoom seansi esa ixtiyoriy vaqtda: shuning uchun setka o'xshash,
 * lekin kun ichida seanslar vaqt bo'yicha ketma-ket turadi.
 *
 * Seans kuni — Toshkent bo'yicha: API vaqtni `+05:00` bilan beradi, sana
 * satrning boshidan olinadi (brauzer zonasiga o'tkazilmaydi).
 */

const sessionDay = (session: ZoomSession) => session.starts_at.slice(0, 10);

const byDay = (sessions: ZoomSession[]) => {
    const days = new Map<string, ZoomSession[]>();
    for (const session of [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
        const list = days.get(sessionDay(session)) ?? [];
        list.push(session);
        days.set(sessionDay(session), list);
    }
    return days;
};

/** Holat rangi: hozir — yashil, keyingi — asosiy, tugagan — xira. */
const TONE: Record<ZoomSessionStatus, string> = {
    open: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    upcoming: 'border-primary/30 bg-primary/10 text-primary',
    closed: 'border-border bg-muted text-muted-foreground',
};

const DOT: Record<ZoomSessionStatus, string> = {
    open: 'bg-emerald-500',
    upcoming: 'bg-primary',
    closed: 'bg-muted-foreground/60',
};

/** «Fizika · Amaliyot» — kalendar katagida sarlavha o'rniga (u uzun). */
const sessionLabel = (session: ZoomSession) =>
    session.subject_name
        ? [session.subject_name, courseTypeLabel(session.training_type)].filter(Boolean).join(' · ')
        : session.title;

/** Kun ichidagi seans kartochkasi — bosilsa seans sahifasi. */
const SessionCard = ({ session }: { session: ZoomSession }) => {
    const navigate = useNavigate();
    return (
        <button
            type="button"
            onClick={() => navigate(`/zoom/${session.id}`)}
            className={cn(
                'block w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors hover:brightness-95',
                TONE[session.status],
                !session.is_active && 'opacity-50',
            )}
            title={[session.title, session.teacher_name, session.groups.map((g) => g.name).join(', ')].filter(Boolean).join('\n')}
        >
            <span className="flex items-center gap-1 font-semibold tabular-nums">
                {session.status === 'open' && <Radio className="h-3 w-3 shrink-0" />}
                {formatTime(session.starts_at)}–{formatTime(session.ends_at)}
            </span>
            <span className="mt-0.5 line-clamp-2 font-medium leading-snug text-foreground">{sessionLabel(session)}</span>
            {session.groups.length > 0 && (
                <span className="mt-0.5 flex items-center gap-1 truncate text-muted-foreground">
                    <UsersRound className="h-3 w-3 shrink-0" />
                    <span className="truncate">{session.groups.map((g) => g.name).join(', ')}</span>
                </span>
            )}
        </button>
    );
};

const DayList = ({ sessions }: { sessions: ZoomSession[] }) =>
    sessions.length ? (
        <div className="space-y-1.5">
            {sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
            ))}
        </div>
    ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Seans yo'q
        </p>
    );

/**
 * Hafta: yetti ustun (dushanbadan). Yakshanba bo'sh bo'lsa ko'rsatilmaydi.
 * Telefonda ustunlar sig'maydi — kunlar ketma-ket ro'yxat, faqat seansli kunlar va bugun.
 */
export const ZoomWeekCalendar = ({
    weekStart,
    sessions,
    today,
}: {
    weekStart: Date;
    sessions: ZoomSession[];
    today: string;
}) => {
    const isMobile = useIsMobile();
    const days = useMemo(() => {
        const grouped = byDay(sessions);
        return WEEKDAYS.map((name, index) => {
            const iso = toIsoDate(addDays(weekStart, index));
            return { name, iso, sessions: grouped.get(iso) ?? [] };
        }).filter((day, index) => index < 6 || day.sessions.length > 0);
    }, [sessions, weekStart]);

    if (isMobile) {
        const visible = days.filter((day) => day.sessions.length > 0 || day.iso === today);
        return (
            <div className="space-y-4">
                {visible.map((day) => (
                    <section key={day.iso} className="space-y-2">
                        <h3 className={cn('px-1 text-sm font-semibold', day.iso === today ? 'text-primary' : 'text-foreground')}>
                            {day.name}, {formatDayMonth(day.iso)}
                        </h3>
                        <DayList sessions={day.sessions} />
                    </section>
                ))}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card custom-scrollbar">
            <div className="grid min-w-[880px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((day, index) => {
                    const isToday = day.iso === today;
                    return (
                        <div key={day.iso} className={cn('flex min-h-64 flex-col', index < days.length - 1 && 'border-r border-border')}>
                            <div className={cn('border-b border-border px-2 py-2', isToday ? 'bg-primary/10' : 'bg-muted/40')}>
                                <span className={cn('block truncate text-sm font-semibold', isToday ? 'text-primary' : 'text-foreground')}>
                                    {day.name}
                                </span>
                                <span className="block text-xs text-muted-foreground tabular-nums">{formatDayMonth(day.iso)}</span>
                            </div>
                            <div className={cn('flex-1 space-y-1.5 p-1.5', isToday && 'bg-primary/5')}>
                                {day.sessions.map((session) => (
                                    <SessionCard key={session.id} session={session} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/** Katakda shunchadan ko'p plashka sig'maydi — qolgani «+N ta». */
const MAX_CHIPS = 3;

/**
 * Oy: kun katagida «09:30 Fan» plashkalari, rangi — holat. Kunga bosilsa,
 * o'sha kunning seanslari oynada; telefonda — rangli nuqtalar va setka ostida ro'yxat.
 */
export const ZoomMonthCalendar = ({
    monthStart,
    sessions,
    today,
}: {
    monthStart: Date;
    sessions: ZoomSession[];
    today: string;
}) => {
    const isMobile = useIsMobile();
    const [openDay, setOpenDay] = useState<string | null>(null);
    const [mobileDay, setMobileDay] = useState<string | null>(null);
    const grouped = useMemo(() => byDay(sessions), [sessions]);
    const { start, weeks } = monthGrid(monthStart);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    const month = monthStart.getMonth();
    const selectedMobileDay =
        mobileDay ?? (cells.some((d) => toIsoDate(d) === today && d.getMonth() === month) ? today : toIsoDate(monthStart));

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="grid grid-cols-7 border-b border-border bg-muted/40">
                    {WEEKDAYS.map((name) => (
                        <div key={name} className="px-1 py-2 text-center text-xs font-semibold text-muted-foreground sm:px-2">
                            {isMobile ? name.slice(0, 2) : name}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {cells.map((date, index) => {
                        const iso = toIsoDate(date);
                        const inMonth = date.getMonth() === month;
                        const isToday = iso === today;
                        const daySessions = grouped.get(iso) ?? [];
                        return (
                            <button
                                key={iso}
                                type="button"
                                onClick={() => (isMobile ? setMobileDay(iso) : setOpenDay(iso))}
                                className={cn(
                                    'flex flex-col gap-1 border-border p-1 text-left transition-colors hover:bg-accent/40 sm:p-1.5',
                                    isMobile ? 'min-h-14' : 'min-h-28',
                                    index % 7 !== 6 && 'border-r',
                                    index < cells.length - 7 && 'border-b',
                                    !inMonth && 'bg-muted/30',
                                    isMobile && iso === selectedMobileDay && 'bg-primary/10',
                                )}
                                aria-label={`${formatDate(iso)}: ${daySessions.length} ta seans`}
                            >
                                <span
                                    className={cn(
                                        'flex h-6 min-w-6 items-center justify-center self-end rounded-full px-1 text-xs tabular-nums',
                                        isToday
                                            ? 'bg-primary font-semibold text-primary-foreground'
                                            : inMonth
                                              ? 'font-medium text-foreground'
                                              : 'text-muted-foreground/60',
                                    )}
                                >
                                    {date.getDate()}
                                </span>
                                {isMobile ? (
                                    daySessions.length > 0 && (
                                        <span className="flex flex-wrap justify-center gap-0.5">
                                            {daySessions.slice(0, 4).map((session) => (
                                                <span key={session.id} className={cn('h-1.5 w-1.5 rounded-full', DOT[session.status])} />
                                            ))}
                                        </span>
                                    )
                                ) : (
                                    <>
                                        {daySessions.slice(0, MAX_CHIPS).map((session) => (
                                            <span
                                                key={session.id}
                                                className={cn(
                                                    'block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium',
                                                    TONE[session.status],
                                                    (!inMonth || !session.is_active) && 'opacity-60',
                                                )}
                                            >
                                                {formatTime(session.starts_at)} {sessionLabel(session)}
                                            </span>
                                        ))}
                                        {daySessions.length > MAX_CHIPS && (
                                            <span className="px-1.5 text-[11px] font-medium text-muted-foreground">
                                                +{daySessions.length - MAX_CHIPS} ta
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
                        {weekdayOf(selectedMobileDay)}, {formatDate(selectedMobileDay)}
                    </h3>
                    <DayList sessions={grouped.get(selectedMobileDay) ?? []} />
                </section>
            )}

            <Modal
                isOpen={openDay !== null}
                onClose={() => setOpenDay(null)}
                title={openDay ? `${weekdayOf(openDay)}, ${formatDate(openDay)}` : ''}
            >
                {openDay && <DayList sessions={grouped.get(openDay) ?? []} />}
            </Modal>
        </div>
    );
};
