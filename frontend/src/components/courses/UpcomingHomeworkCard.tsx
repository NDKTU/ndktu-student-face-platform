import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAssignments } from '@/hooks/useAssignments';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

/** Necha kun ichidagi vazifalar «muddati yaqin» hisoblanadi. */
const HORIZON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Qolgan vaqt yozuvi va uning shoshilinchlik rangi. */
const remaining = (deadline: string) => {
    const left = new Date(deadline).getTime() - Date.now();
    if (left <= 0) return null;

    const hours = Math.floor(left / (60 * 60 * 1000));
    if (hours < 1) {
        return { label: `${Math.max(1, Math.floor(left / 60000))} daqiqa qoldi`, tone: 'urgent' as const };
    }
    if (hours < 24) {
        return { label: `${hours} soat qoldi`, tone: 'urgent' as const };
    }
    const days = Math.floor(left / DAY_MS);
    return { label: `${days} kun qoldi`, tone: days <= 2 ? ('soon' as const) : ('calm' as const) };
};

const TONE_STYLES = {
    urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    soon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    calm: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
};

/**
 * Bosh sahifada muddati yaqinlashgan uy vazifalari.
 *
 * Ro'yxat serverda muddat bo'yicha saralanmaydi va «topshirdimmi» belgisi
 * ham bermaydi, shuning uchun tanlov shu yerda: muddati o'tmaganlar,
 * eng yaqinidan boshlab, bir hafta ichidagilari.
 *
 * Muddati o'tganlari ataylab ko'rsatilmaydi — bosh sahifa qilinadigan ish
 * haqida, eski qarzlar ro'yxati esa «Uy vazifalari» sahifasida.
 */
export const UpcomingHomeworkCard = () => {
    // Sahifalash yo'q: bitta talabada vazifalar ko'pi bilan o'nlab, hammasini
    // olib, kerakli uchtasini shu yerda ajratib olish arzonroq.
    const { data, isLoading } = useAssignments({ page: 1, limit: 50 });

    const soon = useMemo(() => {
        const horizon = Date.now() + HORIZON_DAYS * DAY_MS;
        return (data?.homeworks ?? [])
            .filter((item) => {
                const at = new Date(item.deadline).getTime();
                return at > Date.now() && at <= horizon;
            })
            .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
            .slice(0, 3);
    }, [data]);

    if (isLoading) {
        return <Skeleton className="h-32 w-full rounded-2xl" />;
    }

    // Yaqin muddat yo'q bo'lsa, blok umuman chizilmaydi: bo'sh kartochka
    // bosh sahifada faqat joy egallardi.
    if (soon.length === 0) {
        return null;
    }

    return (
        <Card>
            <CardContent className="space-y-3 pt-6">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
                        <CalendarClock className="h-4 w-4 text-primary" />
                        Muddati yaqin uy vazifalari
                    </h2>
                    <Link
                        to="/homework"
                        className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                        Barchasi
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="flex flex-col gap-2.5">
                    {soon.map((item) => {
                        const left = remaining(item.deadline);
                        return (
                            <Link
                                key={item.id}
                                to={item.lesson_id ? `/lessons/${item.lesson_id}` : '/homework'}
                                className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium text-foreground">{item.title}</p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {item.course_name || item.lesson_topic || '—'} · {formatDateTime(item.deadline)}
                                    </p>
                                </div>
                                {left && (
                                    <span
                                        className={cn(
                                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                                            TONE_STYLES[left.tone],
                                        )}
                                    >
                                        {left.label}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
};
