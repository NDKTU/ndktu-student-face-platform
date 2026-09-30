import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashboardEmpty, DashboardSection } from '@/components/dashboard/DashboardSection';
import { CHART_AXIS_TICK, CHART_CURSOR, CHART_TOOLTIP_STYLE } from '@/components/dashboard/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { LevelCount, MethodStats } from '@/services/psychologyService';
import { levelColor } from './levelColors';

function LevelBars({ levels }: { levels: LevelCount[] }) {
    if (!levels.length) {
        return <p className="text-sm text-muted-foreground">Metodda darajalar sozlanmagan.</p>;
    }
    return (
        <ul className="flex flex-col gap-3">
            {levels.map((l, i) => (
                <li key={l.label} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                            {l.risk && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Xavf guruhi" />}
                            {l.label}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            <b className="text-foreground">{l.count}</b> · {l.pct}%
                        </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                            className="h-full rounded-full"
                            style={{ width: `${l.pct}%`, background: levelColor(i, levels.length, l.risk) }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}

function ScoreChips({ avg, min, max }: { avg: number | null; min: number | null; max: number | null }) {
    const chip = (label: string, value: number | null) => (
        <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">{value ?? '—'}</p>
        </div>
    );
    return (
        <div className="grid grid-cols-3 gap-2">
            {chip("O'rtacha ball", avg)}
            {chip('Eng past', min)}
            {chip('Eng yuqori', max)}
        </div>
    );
}

/** 2. Tanlangan metod bo'yicha darajalar taqsimoti. */
export function LevelsSection({
    data,
    isLoading,
    category,
    onCategoryChange,
}: {
    data: MethodStats | undefined;
    isLoading: boolean;
    category: string | undefined;
    onCategoryChange: (c: string) => void;
}) {
    const isNarrow = useIsMobile();

    if (isLoading && !data) {
        return (
            <DashboardSection title="Darajalar taqsimoti">
                <div className="p-5"><Skeleton className="h-56 w-full" /></div>
            </DashboardSection>
        );
    }
    if (!data) return null;

    const subtitle = (
        <p className="text-xs text-muted-foreground">
            Natijalar: <b className="text-foreground tabular-nums">{data.total}</b>
            {data.undetermined > 0 && <> · aniqlanmagan: <b className="text-foreground tabular-nums">{data.undetermined}</b></>}
        </p>
    );

    if (data.total === 0) {
        return (
            <DashboardSection title="Darajalar taqsimoti">
                <DashboardEmpty>Tanlangan filtrlar bo'yicha natija yo'q</DashboardEmpty>
            </DashboardSection>
        );
    }

    if (data.scoring === 'category') {
        const active = data.categories.find(c => c.name === category) ?? data.categories[0];
        const profile = data.categories.map(c => ({ name: c.name, value: c.avg ?? 0 }));
        return (
            <DashboardSection title="Kategoriyalar bo'yicha taqsimot" action={subtitle}>
                <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            O'rtacha ball (profil)
                        </p>
                        <div className="h-60">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={profile} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                                    <XAxis type="number" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tick={CHART_AXIS_TICK}
                                        axisLine={false}
                                        tickLine={false}
                                        width={isNarrow ? 90 : 130}
                                    />
                                    <Tooltip
                                        cursor={CHART_CURSOR}
                                        contentStyle={CHART_TOOLTIP_STYLE}
                                        formatter={(value) => [value ?? 0, "O'rtacha ball"]}
                                    />
                                    <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div>
                        <div className="mb-3 flex flex-wrap gap-1.5">
                            {data.categories.map(c => (
                                <button
                                    key={c.name}
                                    type="button"
                                    onClick={() => onCategoryChange(c.name)}
                                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                        c.name === active?.name
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                        {active && (
                            <div className="space-y-4">
                                <LevelBars levels={active.levels} />
                                <ScoreChips avg={active.avg} min={active.min} max={active.max} />
                            </div>
                        )}
                    </div>
                </div>
            </DashboardSection>
        );
    }

    return (
        <DashboardSection title="Darajalar taqsimoti" action={subtitle}>
            <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
                <div className="space-y-4">
                    <LevelBars levels={data.levels} />
                    <ScoreChips avg={data.avg} min={data.min} max={data.max} />
                </div>
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Ballar gistogrammasi
                    </p>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.histogram} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="score" tick={CHART_AXIS_TICK} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                                <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={isNarrow ? 28 : 40} allowDecimals={false} />
                                <Tooltip
                                    cursor={CHART_CURSOR}
                                    contentStyle={CHART_TOOLTIP_STYLE}
                                    labelFormatter={(v) => `${v} ball`}
                                    formatter={(value) => [value ?? 0, 'Talabalar']}
                                />
                                <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </DashboardSection>
    );
}
