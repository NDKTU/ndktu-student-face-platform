import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CHART_AXIS_TICK, CHART_CURSOR, CHART_TOOLTIP_STYLE } from './format';

interface GradeCounts {
    grade_5: number;
    grade_4: number;
    grade_3: number;
    grade_2: number;
}

/** Test baholari taqsimoti (5 → 2): bitta seriya, legend kerak emas. */
export const GradeDistributionChart = ({ grades, className = 'h-56' }: { grades: GradeCounts; className?: string }) => {
    const { t } = useTranslation();
    const isNarrow = useIsMobile();
    const data = [
        { name: '5', value: grades.grade_5 },
        { name: '4', value: grades.grade_4 },
        { name: '3', value: grades.grade_3 },
        { name: '2', value: grades.grade_2 },
    ];

    return (
        <div className={className}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={CHART_AXIS_TICK} axisLine={{ stroke: 'var(--border)' }} tickLine={false}
                        tickFormatter={(v: string) => t('{{n}} baho', { n: v })} />
                    <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={isNarrow ? 28 : 40} allowDecimals={false} />
                    <Tooltip
                        cursor={CHART_CURSOR}
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelFormatter={(v) => t('{{n}} baho', { n: v })}
                        formatter={(value) => [value ?? 0, t('Natijalar')]}
                    />
                    <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
