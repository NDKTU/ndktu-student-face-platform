import { Activity, ClipboardList, Percent, Users } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardEmpty, DashboardSection } from '@/components/dashboard/DashboardSection';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StatsOverview } from '@/services/psychologyService';

function Meter({ value }: { value: number }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
        </div>
    );
}

/** 1. Umumiy ko'rsatkichlar: plitkalar, metodlar ommabopligi, fakultetlar qamrovi. */
export function OverviewSection({
    data,
    isLoading,
    onPickMethod,
}: {
    data: StatsOverview | undefined;
    isLoading: boolean;
    onPickMethod: (methodId: number) => void;
}) {
    const maxResults = Math.max(1, ...(data?.methods.map(m => m.results) ?? [1]));

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Jami natijalar"
                    value={data?.total_results ?? 0}
                    icon={ClipboardList}
                    color="blue"
                    isLoading={isLoading}
                    description="Tanlangan davr va tuzilma bo'yicha"
                />
                <StatCard
                    label="Test topshirgan talabalar"
                    value={data?.tested_students ?? 0}
                    icon={Users}
                    color="purple"
                    isLoading={isLoading}
                    description={data ? `Jami talabalar: ${data.total_students.toLocaleString('uz-UZ')}` : undefined}
                />
                <StatCard
                    label="Qamrov"
                    value={`${data?.coverage_pct ?? 0}%`}
                    icon={Percent}
                    color="green"
                    isLoading={isLoading}
                    description="Kamida bitta test topshirganlar ulushi"
                />
                <StatCard
                    label="So'nggi 7 kun"
                    value={data?.results_7d ?? 0}
                    icon={Activity}
                    color="orange"
                    isLoading={isLoading}
                    description={data ? `So'nggi 30 kun: ${data.results_30d.toLocaleString('uz-UZ')}` : undefined}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <DashboardSection title="Metodlar">
                    {isLoading ? (
                        <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : !data?.methods.length ? (
                        <DashboardEmpty>Hozircha natijalar yo'q</DashboardEmpty>
                    ) : (
                        <ul className="divide-y divide-border">
                            {data.methods.map(m => (
                                <li key={m.method_id}>
                                    <button
                                        type="button"
                                        onClick={() => onPickMethod(m.method_id)}
                                        className="flex w-full flex-col gap-1.5 px-5 py-3 text-left transition-colors hover:bg-accent/40"
                                    >
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                <b className="text-foreground">{m.results}</b> natija · {m.students} talaba
                                            </span>
                                        </div>
                                        <Meter value={(100 * m.results) / maxResults} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </DashboardSection>

                <DashboardSection title="Fakultetlar bo'yicha qamrov">
                    {isLoading ? (
                        <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : !data?.faculties.length ? (
                        <DashboardEmpty>Talabalar topilmadi</DashboardEmpty>
                    ) : (
                        <ul className="divide-y divide-border">
                            {data.faculties.map(f => (
                                <li key={f.faculty_id} className="flex flex-col gap-1.5 px-5 py-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="truncate text-sm font-medium text-foreground">{f.name}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                            {f.tested_students} / {f.total_students} ·{' '}
                                            <b className="text-foreground">{f.coverage_pct}%</b>
                                        </span>
                                    </div>
                                    <Meter value={f.coverage_pct} />
                                </li>
                            ))}
                        </ul>
                    )}
                </DashboardSection>
            </div>
        </div>
    );
}
