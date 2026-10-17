import { useMemo, useState } from 'react';
import { courseTypeLabel } from '@/services/courseTypes';
import { useNavigate } from 'react-router-dom';
import { Radio, UsersRound } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { WEEKDAYS, addDays, monthGrid, toIsoDate, weekdayOf } from '@/components/schedule/scheduleUtils';
import type { ZoomSession, ZoomSessionStatus } from '@/services/zoomSessionService';
import { formatDate, formatDayMonth } from '@/utils/date';
import { usePairTimes } from '@/hooks/useZoomSessions';
import type { PairTime } from '@/services/zoomSessionService';
import { pairRange } from '@/utils/dateTimeInput';
import { cn } from '@/lib/utils';

/**
 * Zoom seanslari kalendari — hafta va oy.
 *
 * Hafta — HEMIS dars jadvalidagidek: qatorlar juftliklar (raqami va vaqti
 * chapda), seans o'z juftligi qatorida. Juftlik setkasiga tushmagan seans
 * (masalan 10:00 da) — «Boshqa vaqt» qatorida. `WeekCalendar` ning o'zi
 * ishlatilmaydi: u HEMIS darsiga (`hemis_id`, `lesson_pair`) bog'langan.
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

/** «09:30» — Toshkent vaqti, satrning o'zidan (brauzer zonasiga o'tkazilmaydi). */
const hhmm = (iso: string) => iso.slice(11, 16);

/**
 * Seans juftligi: vaqti setkaga to'g'ri kelsa — «2» yoki qo'sh juftlik «2–3»;
 * faqat boshlanishi mos kelsa ham o'sha juftlik. Aks holda `null`.
 */
const sessionPair = (session: ZoomSession, pairs: PairTime[]): { first: number; label: string } | null => {
    const start = hhmm(session.starts_at);
    const range = pairRange(pairs, start, hhmm(session.ends_at));
    if (range) return { first: range[0], label: range[0] === range[1] ? String(range[0]) : `${range[0]}–${range[1]}` };
    const byStart = pairs.find((pair) => pair.start === start);
    return byStart ? { first: byStart.pair, label: String(byStart.pair) } : null;
};

/** «Fizika · Amaliyot» — kalendar katagida sarlavha o'rniga (u uzun). */
/** Juftlik setkasiga tushmagan seanslar qatori. */
const OTHER = -1;

const sessionLabel = (session: ZoomSession) =>
    session.subject_name
        ? [session.subject_name, courseTypeLabel(session.training_type)].filter(Boolean).join(' · ')
        : session.title;

/** Kun ichidagi seans kartochkasi — bosilsa seans sahifasi. */
const SessionCard = ({ session }: { session: ZoomSession }) => {
    const navigate = useNavigate();
    const { data: pairs = [] } = usePairTimes();
    const pair = sessionPair(session, pairs);
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
                {pair && <span>{pair.label}-juftlik ·</span>}
                {hhmm(session.starts_at)}–{hhmm(session.ends_at)}
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
    const { data: pairs = [] } = usePairTimes();
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

    // Qatorlar — shu haftada uchragan juftliklar (HEMIS jadvalidagidek): bo'sh
    // 9 qator jadvalni cho'zib yuborardi. Setkaga tushmaganlar — oxirgi qatorda.
    const rowKey = (session: ZoomSession) => sessionPair(session, pairs)?.first ?? OTHER;
    const used = new Set(days.flatMap((day) => day.sessions.map(rowKey)));
    const rows = [
        ...pairs.filter((pair) => used.has(pair.pair)).map((pair) => ({ key: pair.pair, title: String(pair.pair), start: pair.start, end: pair.end })),
        ...(used.has(OTHER) ? [{ key: OTHER, title: 'Boshqa', start: 'vaqt', end: '' }] : []),
    ];

    return (
        // Telefon emas, lekin tor oyna — jadval gorizontal suriladi, juftlik ustuni joyida qoladi.
        <div className="overflow-x-auto rounded-2xl border border-border bg-card custom-scrollbar">
            <table className="w-full min-w-[880px] table-fixed border-collapse text-sm">
                <thead>
                    <tr className="bg-muted/40">
                        <th className="sticky left-0 z-10 w-20 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold text-muted-foreground">
                            Para
                        </th>
                        {days.map((day) => {
                            const isToday = day.iso === today;
                            return (
                                <th
                                    key={day.iso}
                                    className={cn('border-b border-border px-2 py-2 text-left font-semibold', isToday ? 'bg-primary/10 text-primary' : 'text-foreground')}
                                >
                                    <span className="block truncate">{day.name}</span>
                                    <span className="block text-xs font-normal text-muted-foreground tabular-nums">{formatDayMonth(day.iso)}</span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={days.length + 1} className="px-3 py-10 text-center text-sm text-muted-foreground">
                                Bu haftada seans yo'q
                            </td>
                        </tr>
                    ) : (
                        rows.map((row) => (
                            <tr key={row.key} className="align-top">
                                <th className="sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-2 text-left">
                                    <span className={cn('block font-bold text-primary', row.key === OTHER ? 'text-xs' : 'text-base')}>{row.title}</span>
                                    <span className="block text-[11px] font-normal leading-tight text-muted-foreground tabular-nums">
                                        {row.start}
                                        {row.end && (
                                            <>
                                                <br />
                                                {row.end}
                                            </>
                                        )}
                                    </span>
                                </th>
                                {days.map((day) => (
                                    <td key={day.iso} className={cn('border-b border-border p-1.5', day.iso === today && 'bg-primary/5')}>
                                        <div className="space-y-1.5">
                                            {day.sessions
                                                .filter((session) => rowKey(session) === row.key)
                                                .map((session) => (
                                                    <SessionCard key={session.id} session={session} />
                                                ))}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

/** Katakda shunchadan ko'p plashka sig'maydi — qolgani «+N ta». */
const MAX_CHIPS = 3;

/**
 * Oy: kun katagida «2 · Fan» (juftlik) yoki «10:00 · Fan» plashkalari, rangi — holat. Kunga bosilsa,
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
    const { data: pairs = [] } = usePairTimes();
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
                                                {sessionPair(session, pairs)?.label ?? hhmm(session.starts_at)} · {sessionLabel(session)}
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
