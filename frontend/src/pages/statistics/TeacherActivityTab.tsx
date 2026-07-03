import { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from 'recharts';
import { FileQuestion, ShieldAlert, Percent } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { StatChartCard } from '@/components/statistics/StatChartCard';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { useTeachers } from '@/hooks/useTeachers';
import {
    useTeacherQuestionQuality,
    useTeacherActivityTimeline,
    useTeacherProctoring,
} from '@/hooks/useStatistics';
import { colorAt } from '@/components/statistics/chartColors';

type Granularity = 'day' | 'week' | 'month';

export const TeacherActivityTab = () => {
    const [teacherId, setTeacherId] = useState<number | null>(null);
    const [granularity, setGranularity] = useState<Granularity>('month');
    const { data: teachersData } = useTeachers(1, 500);

    const teacherOptions = useMemo(
        () =>
            teachersData?.teachers.map((t) => ({
                value: t.id.toString(),
                label: t.employee?.full_name ?? '',
            })) ?? [],
        [teachersData]
    );

    const quality = useTeacherQuestionQuality(teacherId);
    const timeline = useTeacherActivityTimeline(teacherId, granularity);
    const proctoring = useTeacherProctoring(teacherId);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                <Combobox
                    options={teacherOptions}
                    value={teacherId?.toString() ?? ''}
                    onChange={(val) => setTeacherId(val ? parseInt(val) : null)}
                    placeholder="O'qituvchini tanlang"
                    searchPlaceholder="O'qituvchi qidirish..."
                    className="w-[280px]"
                />
            </div>

            {!teacherId ? (
                <div className="rounded-lg border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
                    O'qituvchini tanlang
                </div>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            label="Savollar"
                            value={quality.data?.total_questions ?? 0}
                            icon={FileQuestion}
                            isLoading={quality.isLoading}
                            color="blue"
                        />
                        <StatCard
                            label="O'rt. to'g'ri javob %"
                            value={
                                quality.data
                                    ? `${quality.data.average_correct_pct.toFixed(1)}%`
                                    : '0%'
                            }
                            icon={Percent}
                            isLoading={quality.isLoading}
                            color="green"
                        />
                        <StatCard
                            label="Urinishlar"
                            value={proctoring.data?.total_attempts ?? 0}
                            icon={FileQuestion}
                            isLoading={proctoring.isLoading}
                            color="purple"
                        />
                        <StatCard
                            label="Aldash darajasi"
                            value={
                                proctoring.data
                                    ? `${proctoring.data.cheating_rate_pct.toFixed(1)}%`
                                    : '0%'
                            }
                            icon={ShieldAlert}
                            isLoading={proctoring.isLoading}
                            color="red"
                        />
                    </div>

                    <StatChartCard
                        title="Faollik vaqti"
                        description="Yaratilgan testlar soni"
                        isLoading={timeline.isLoading}
                        isError={timeline.isError}
                        isEmpty={!timeline.isLoading && (timeline.data?.points?.length ?? 0) === 0}
                        height={340}
                        actions={
                            <div className="flex gap-1">
                                {(['day', 'week', 'month'] as Granularity[]).map((g) => (
                                    <Button
                                        key={g}
                                        size="sm"
                                        variant={granularity === g ? 'primary' : 'outline'}
                                        onClick={() => setGranularity(g)}
                                    >
                                        {g === 'day' ? 'Kun' : g === 'week' ? 'Hafta' : 'Oy'}
                                    </Button>
                                ))}
                            </div>
                        }
                    >
                        <ResponsiveContainer width="100%" height={320}>
                            <LineChart
                                data={timeline.data?.points ?? []}
                                margin={{ top: 10, right: 16, left: 0, bottom: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ fontSize: 12 }} />
                                <Line
                                    type="monotone"
                                    dataKey="quizzes_created"
                                    name="Yaratilgan"
                                    stroke={colorAt(0)}
                                    strokeWidth={2}
                                    dot={{ r: 3 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </StatChartCard>
                </>
            )}
        </div>
    );
};

export default TeacherActivityTab;
