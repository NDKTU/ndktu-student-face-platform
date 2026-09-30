import { useMemo } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { X } from 'lucide-react';

import { OverviewSection } from '@/components/psychology/stats/OverviewSection';
import { LevelsSection } from '@/components/psychology/stats/LevelsSection';
import { TimelineSection } from '@/components/psychology/stats/TimelineSection';

import {
    useMethodStats,
    usePsychologyStatsOverview,
    usePsychologyTimeline,
} from '@/hooks/usePsychology';
import { useFaculties } from '@/hooks/useReferenceData';
import { useAuth } from '@/context/AuthContext';
import { useUrlNumberState, useUrlState } from '@/hooks/useUrlState';
import { apiErrorMessage } from '@/utils/apiError';
import type { StatsFilterParams, TimelinePeriod } from '@/services/psychologyService';

/** 1..5 — bazadagi haqiqiy kurslar (`groups.course`). */
const COURSES = [1, 2, 3, 4, 5];

const PsychologyStatsPage = () => {
    const { hasPermission } = useAuth();

    // Filtrlar va tanlov URL'da: sahifani yangilash yoki havolani ulashish
    // ko'rinishni saqlaydi.
    const [facultyId, setFacultyId] = useUrlState<string>('faculty', 'all');
    const [course, setCourse] = useUrlState<string>('course', 'all');
    const [dateFrom, setDateFrom] = useUrlState<string>('from', '');
    const [dateTo, setDateTo] = useUrlState<string>('to', '');
    const [methodId, setMethodId] = useUrlNumberState('method', 0);
    const [period, setPeriod] = useUrlState<TimelinePeriod>('period', 'day');
    const [category, setCategory] = useUrlState<string>('category', '');

    const filters: StatsFilterParams = useMemo(
        () => ({
            faculty_id: facultyId !== 'all' ? Number(facultyId) : undefined,
            course: course !== 'all' ? Number(course) : undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
        }),
        [facultyId, course, dateFrom, dateTo],
    );

    const overview = usePsychologyStatsOverview(filters);
    // Metod tanlanmagan bo'lsa — eng ommabopi: bo'sh ekran o'rniga darrov
    // ma'noli ko'rinish chiqadi.
    const selectedMethodId = methodId || overview.data?.methods[0]?.method_id;
    const methodStats = useMethodStats(selectedMethodId, filters, true);
    const timeline = usePsychologyTimeline(filters, period, selectedMethodId);

    const { data: facultiesData } = useFaculties(1, 100, undefined, hasPermission('read:faculty'));
    const facultyOptions = useMemo(
        () => [
            { value: 'all', label: 'Barcha fakultetlar' },
            ...(facultiesData?.faculties ?? []).map((f) => ({ value: String(f.id), label: f.name })),
        ],
        [facultiesData],
    );
    const courseOptions = useMemo(
        () => [
            { value: 'all', label: 'Barcha kurslar' },
            ...COURSES.map((c) => ({ value: String(c), label: `${c}-kurs` })),
        ],
        [],
    );

    const hasFilters =
        facultyId !== 'all' || course !== 'all' || Boolean(dateFrom) || Boolean(dateTo);

    const clear = () => {
        setFacultyId('all');
        setCourse('all');
        setDateFrom('');
        setDateTo('');
    };

    if (overview.isError) {
        return (
            <div className="space-y-6">
                <PageHeader title="Psixologiya statistikasi" />
                <ErrorState
                    title="Statistikani olib bo'lmadi"
                    description={apiErrorMessage(overview.error, 'Keyinroq urinib ko‘ring')}
                    onRetry={() => overview.refetch()}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Psixologiya statistikasi"
                description="Qamrov, metodlar bo'yicha darajalar taqsimoti va faollik dinamikasi"
            />

            <Card>
                <CardContent className="flex flex-wrap items-end gap-3 p-4">
                    <div className="w-full sm:w-[240px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Fakultet
                        </label>
                        <Combobox
                            options={facultyOptions}
                            value={facultyId}
                            onChange={setFacultyId}
                            placeholder="Barcha fakultetlar"
                            searchPlaceholder="Fakultet..."
                        />
                    </div>
                    <div className="w-[150px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Kurs
                        </label>
                        <Combobox
                            options={courseOptions}
                            value={course}
                            onChange={setCourse}
                            placeholder="Barcha kurslar"
                            searchPlaceholder="Kurs..."
                        />
                    </div>
                    <div className="w-[150px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Sanadan
                        </label>
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="w-[150px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Sanagacha
                        </label>
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    {hasFilters && (
                        <Button variant="ghost" onClick={clear} className="mb-0.5">
                            <X className="mr-2 h-4 w-4" />
                            Tozalash
                        </Button>
                    )}
                </CardContent>
            </Card>

            <OverviewSection
                data={overview.data}
                isLoading={overview.isLoading}
                onPickMethod={(id) => {
                    setMethodId(id);
                    // Metod almashganda kategoriya tanlovi eskirdi: u
                    // avvalgi metodning kategoriyasi edi.
                    setCategory('');
                }}
            />

            <LevelsSection
                data={methodStats.data}
                isLoading={methodStats.isLoading}
                category={category || undefined}
                onCategoryChange={setCategory}
            />

            <TimelineSection
                data={timeline.data}
                isLoading={timeline.isLoading}
                period={period}
                onPeriodChange={setPeriod}
                methodName={methodStats.data?.name}
            />
        </div>
    );
};

export default PsychologyStatsPage;
