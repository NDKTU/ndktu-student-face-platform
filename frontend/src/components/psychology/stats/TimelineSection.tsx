import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashboardSection } from '@/components/dashboard/DashboardSection';
import { CHART_AXIS_TICK, CHART_CURSOR, CHART_TOOLTIP_STYLE } from '@/components/dashboard/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Timeline, TimelinePeriod } from '@/services/psychologyService';

const PERIODS: Array<{ value: TimelinePeriod; label: string }> = [
    { value: 'day', label: 'Kun' },
    { value: 'week', label: 'Hafta' },
    { value: 'month', label: 'Oy' },
];

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];

function bucketLabel(iso: string, period: TimelinePeriod): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (period === 'month') return `${MONTHS[m - 1]} ${y}`;
    return `${d} ${MONTHS[m - 1]}`;
}

/** 5. Faollik dinamikasi: davr bo'yicha topshirilgan testlar soni. */
export function TimelineSection({
    data,
    isLoading,
    period,
    onPeriodChange,
    methodName,
}: {
    data: Timeline | undefined;
    isLoading: boolean;
    period: TimelinePeriod;
    onPeriodChange: (p: TimelinePeriod) => void;
    methodName?: string;
}) {
    const isNarrow = useIsMobile();
    const points = (data?.points ?? []).map(p => ({
        name: bucketLabel(p.bucket, period),
        value: p.count,
        prefix: period === 'week' ? 'Hafta boshi: ' : '',
    }));
    const total = points.reduce((sum, p) => sum + p.value, 0);

    return (
        <DashboardSection
            title={methodName ? `Faollik — ${methodName}` : 'Faollik dinamikasi'}
            action={
                <div className="inline-flex rounded-lg border border-border bg-muted/20 p-0.5">
                    {PERIODS.map(p => (
                        <button
                            key={p.value}
                            type="button"
                            onClick={() => onPeriodChange(p.value)}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                period === p.value ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            }
        >
            <div className="p-5">
                <p className="mb-3 text-sm text-muted-foreground">
                    Davr ichida: <b className="text-foreground tabular-nums">{total.toLocaleString('uz-UZ')}</b> ta natija
                </p>
                {isLoading && !data ? (
                    <Skeleton className="h-60 w-full" />
                ) : (
                    <div className="h-60">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    tick={CHART_AXIS_TICK}
                                    axisLine={{ stroke: 'var(--border)' }}
                                    tickLine={false}
                                    minTickGap={16}
                                />
                                <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={isNarrow ? 28 : 40} allowDecimals={false} />
                                <Tooltip
                                    cursor={CHART_CURSOR}
                                    contentStyle={CHART_TOOLTIP_STYLE}
                                    labelFormatter={(label, payload) => `${payload?.[0]?.payload?.prefix ?? ''}${label}`}
                                    formatter={(value) => [value ?? 0, 'Natijalar']}
                                />
                                <Bar dataKey="value" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </DashboardSection>
    );
}
