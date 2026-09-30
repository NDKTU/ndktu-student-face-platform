import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    BookOpen,
    ChartColumnBig,
    CircleOff,
    ClipboardCheck,
    FolderOpen,
    Library,
} from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { useAuth } from '@/context/AuthContext';
import { useCourseStats } from '@/hooks/useCourses';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFaculties, useKafedras } from '@/hooks/useReferenceData';
import { useUrlNumberState, useUrlState } from '@/hooks/useUrlState';
import type { CourseStatsRow, CourseStatsSortField } from '@/services/courseService';
import { COURSE_TYPE_OPTIONS, courseTypeLabel, type CourseType } from '@/services/courseTypes';
import { EDUCATION_SHAPES, EDUCATION_TYPES, educationShapeKey } from '@/utils/education';
import { semesterShortLabel } from '@/utils/semester';
import { apiErrorMessage } from '@/utils/apiError';
import { cn } from '@/lib/utils';

type SortOrder = 'asc' | 'desc';

// Sirtqi bakalavriat — 5 yil, ya'ni 10 semestr: undan ortig'i bazada yo'q.
const STUDY_SEMESTERS = Array.from({ length: 10 }, (_, index) => index + 1);

/** Nol — alohida ko'rinishda: jadvalning maqsadi bo'sh kursni topish. */
const Count = ({ value }: { value: number }) => (
    <span className={cn('tabular-nums', value === 0 ? 'text-muted-foreground/60' : 'font-semibold text-foreground')}>
        {value}
    </span>
);

const TwoLine = ({ primary, secondary }: { primary?: string | null; secondary?: string | null }) => (
    <div className="min-w-0">
        <p className="text-sm leading-snug text-foreground">{primary || '—'}</p>
        {secondary && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{secondary}</p>}
    </div>
);

const CourseStatsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();

    const [page, setPage] = useUrlNumberState('page', 1);
    const [pageSize, setPageSize] = useUrlNumberState('size', 20);
    const [search, setSearch] = useUrlState<string>('q', '');
    const [faculty, setFaculty] = useUrlState<string>('faculty', 'all');
    const [kafedra, setKafedra] = useUrlState<string>('kafedra', 'all');
    const [educationType, setEducationType] = useUrlState<string>('edu_type', 'all');
    const [educationForm, setEducationForm] = useUrlState<string>('edu_form', 'all');
    const [courseType, setCourseType] = useUrlState<string>('type', 'all');
    const [semester, setSemester] = useUrlState<string>('semester', 'all');
    const [fill, setFill] = useUrlState<string>('fill', 'all');
    const [sortField, setSortField] = useUrlState<CourseStatsSortField | ''>('sort', '');
    const [sortOrder, setSortOrder] = useUrlState<SortOrder>('order', 'asc');

    const debouncedSearch = useDebouncedValue(search, 350);

    const { data, isLoading, isError, error, refetch } = useCourseStats({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        facultyId: faculty !== 'all' ? Number(faculty) : undefined,
        kafedraId: kafedra !== 'all' ? Number(kafedra) : undefined,
        educationType: educationType !== 'all' ? educationType : undefined,
        educationForm: educationForm !== 'all' ? educationForm : undefined,
        courseType: courseType !== 'all' ? (courseType as CourseType) : undefined,
        semester: semester !== 'all' ? Number(semester) : undefined,
        fill: fill === 'filled' || fill === 'empty' ? fill : undefined,
        sortBy: sortField || undefined,
        order: sortOrder,
    });

    const { data: facultiesData } = useFaculties(1, 100, undefined, hasPermission('read:faculty'));
    // Kafedralar ro'yxati tanlangan fakultetga qisqaradi.
    const { data: kafedrasData } = useKafedras(
        1,
        300,
        undefined,
        faculty !== 'all' ? Number(faculty) : undefined,
        hasPermission('read:kafedra'),
    );

    const facultyOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha fakultetlar') },
            ...(facultiesData?.faculties ?? []).map((f) => ({ value: String(f.id), label: f.name })),
        ],
        [facultiesData, t],
    );
    const kafedraOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha kafedralar') },
            ...(kafedrasData?.kafedras ?? []).map((k) => ({ value: String(k.id), label: k.name })),
        ],
        [kafedrasData, t],
    );
    const educationTypeOptions = useMemo(
        () => [
            { value: 'all', label: t("Barcha ta'lim turlari") },
            ...EDUCATION_TYPES.map((value) => ({ value, label: t(value) })),
        ],
        [t],
    );
    const educationFormOptions = useMemo(
        () => [
            { value: 'all', label: t("Barcha ta'lim shakllari") },
            ...EDUCATION_SHAPES.map((value) => ({ value, label: t(value) })),
        ],
        [t],
    );
    const courseTypeOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha turlar') },
            ...COURSE_TYPE_OPTIONS.map((option) => ({ value: option.value as string, label: t(option.label) })),
        ],
        [t],
    );
    const semesterOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha semestrlar') },
            ...STUDY_SEMESTERS.map((n) => ({ value: String(n), label: t('{{n}}-semestr', { n }) })),
        ],
        [t],
    );
    const fillOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha kurslar') },
            { value: 'filled', label: t("To'ldirilgan") },
            { value: 'empty', label: t("Bo'sh kurslar") },
        ],
        [t],
    );

    const activeFilterCount =
        (search ? 1 : 0) +
        (faculty !== 'all' ? 1 : 0) +
        (kafedra !== 'all' ? 1 : 0) +
        (educationType !== 'all' ? 1 : 0) +
        (educationForm !== 'all' ? 1 : 0) +
        (courseType !== 'all' ? 1 : 0) +
        (semester !== 'all' ? 1 : 0) +
        (fill !== 'all' ? 1 : 0);

    const clearFilters = () => {
        setSearch('');
        setFaculty('all');
        setKafedra('all');
        setEducationType('all');
        setEducationForm('all');
        setCourseType('all');
        setSemester('all');
        setFill('all');
        setPage(1);
    };

    // Filtr almashsa — birinchi sahifa: aks holda 30-sahifada turib filtr
    // tanlansa, natija 3 sahifa bo'lib, ekran bo'sh qolardi.
    const onFilter = (setter: (value: string) => void) => (value: string) => {
        setter(value);
        setPage(1);
    };

    const handleSort = (field: CourseStatsSortField) => {
        setPage(1);
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            // Sanoqlarda odatda eng ko'pi kerak, nomlarda — alifbo.
            setSortOrder(['topics', 'resources', 'homeworks'].includes(field) ? 'desc' : 'asc');
        }
    };

    const sortHead = (field: CourseStatsSortField, label: ReactNode, className?: string) => {
        const Icon = sortField !== field ? ArrowUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown;
        return (
            <TableHead
                onClick={() => handleSort(field)}
                className={cn('group cursor-pointer select-none whitespace-nowrap text-xs font-bold', className)}
            >
                <span className="inline-flex items-center gap-1.5">
                    {label}
                    <Icon
                        className={cn(
                            'h-3.5 w-3.5',
                            sortField === field ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-foreground',
                        )}
                    />
                </span>
            </TableHead>
        );
    };

    const semesterText = (row: CourseStatsRow) => {
        if (row.study_semester) return t('{{n}}-semestr', { n: row.study_semester });
        // Guruhsiz kursda o'qish yili noma'lum — hech bo'lmasa kuzgi/bahorgi.
        const short = semesterShortLabel(row.semester_number);
        return short ? t(`${short} semestr`) : null;
    };

    const rows = data?.rows ?? [];
    const summary = data?.summary;
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('Kurslar statistikasi')}
                description={t("Har bir kursda nechta mavzu, resurs va topshiriq borligi")}
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard
                    label={t('Kurslar')}
                    value={summary?.course_count ?? 0}
                    icon={Library}
                    color="teal"
                    isLoading={isLoading}
                />
                <StatCard
                    label={t('Mavzular')}
                    value={summary?.topic_count ?? 0}
                    icon={BookOpen}
                    color="blue"
                    isLoading={isLoading}
                />
                <StatCard
                    label={t('Resurslar')}
                    value={summary?.resource_count ?? 0}
                    icon={FolderOpen}
                    color="yellow"
                    isLoading={isLoading}
                />
                <StatCard
                    label={t('Topshiriqlar')}
                    value={summary?.homework_count ?? 0}
                    icon={ClipboardCheck}
                    color="green"
                    isLoading={isLoading}
                />
                <StatCard
                    label={t("Bo'sh kurslar")}
                    value={summary?.empty_course_count ?? 0}
                    icon={CircleOff}
                    color="red"
                    isLoading={isLoading}
                    description={t("Mavzu, resurs va topshiriq yo'q")}
                    className="col-span-2 lg:col-span-1"
                />
            </div>

            <OrganizationToolbar
                search={search}
                onSearchChange={onFilter(setSearch)}
                searchPlaceholder={t("Fan, o'quv reja yoki kafedra...")}
                totalCount={total}
                totalLabel={t('Kurslar')}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
                extraFilters={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-full sm:w-[220px]">
                            <Combobox
                                options={facultyOptions}
                                value={faculty}
                                onChange={(value) => {
                                    setFaculty(value);
                                    // Kafedra fakultetga bog'liq: eski tanlov
                                    // yangi ro'yxatda bo'lmaydi.
                                    setKafedra('all');
                                    setPage(1);
                                }}
                                placeholder={t('Fakultet')}
                                searchPlaceholder={t('Fakultet...')}
                            />
                        </div>
                        <div className="w-full sm:w-[220px]">
                            <Combobox
                                options={kafedraOptions}
                                value={kafedra}
                                onChange={onFilter(setKafedra)}
                                placeholder={t('Kafedra')}
                                searchPlaceholder={t('Kafedra...')}
                            />
                        </div>
                        <div className="w-full sm:w-[180px]">
                            <Combobox
                                options={educationTypeOptions}
                                value={educationType}
                                onChange={onFilter(setEducationType)}
                                placeholder={t("Ta'lim turi")}
                            />
                        </div>
                        <div className="w-full sm:w-[190px]">
                            <Combobox
                                options={educationFormOptions}
                                value={educationForm}
                                onChange={onFilter(setEducationForm)}
                                placeholder={t("Ta'lim shakli")}
                            />
                        </div>
                        <div className="w-full sm:w-[160px]">
                            <Combobox
                                options={courseTypeOptions}
                                value={courseType}
                                onChange={onFilter(setCourseType)}
                                placeholder={t("Mashg'ulot")}
                            />
                        </div>
                        <div className="w-full sm:w-[170px]">
                            <Combobox
                                options={semesterOptions}
                                value={semester}
                                onChange={onFilter(setSemester)}
                                placeholder={t('Semestr')}
                            />
                        </div>
                        <div className="w-full sm:w-[170px]">
                            <Combobox
                                options={fillOptions}
                                value={fill}
                                onChange={onFilter(setFill)}
                                placeholder={t('Holati')}
                            />
                        </div>
                    </div>
                }
            />

            {isError ? (
                <ErrorState
                    title={t("Statistikani olib bo'lmadi")}
                    description={apiErrorMessage(error, t('Keyinroq urinib ko‘ring'))}
                    onRetry={() => refetch()}
                />
            ) : isLoading ? (
                <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={<ChartColumnBig className="h-10 w-10" />}
                    title={t('Kurslar topilmadi')}
                    description={t('Tanlangan filtrlarga mos kurs topilmadi.')}
                />
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                    <Table className="min-w-[1000px]">
                        <TableHeader className="bg-muted/40">
                            <TableRow>
                                <TableHead className="w-[50px] text-center font-mono text-xs font-bold">#</TableHead>
                                {sortHead('kafedra', t("Kafedra / Bo'lim"))}
                                {sortHead('subject', t('Fanlar'))}
                                <TableHead className="whitespace-nowrap text-xs font-bold">{t("Ta'lim turi")}</TableHead>
                                {sortHead('semester', t("Mashg'ulot"))}
                                {sortHead('topics', t('Mavzu soni'), 'text-center')}
                                {sortHead('resources', t('Resurs soni'), 'text-center')}
                                {sortHead('homeworks', t('Topsh. soni'), 'text-center')}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, index) => {
                                const form = educationShapeKey(row.education_form);
                                return (
                                    <TableRow
                                        key={row.course_id}
                                        onClick={() => navigate(`/courses/${row.course_id}`)}
                                        title={row.course_name}
                                        className="cursor-pointer transition-colors hover:bg-primary/[0.04] dark:hover:bg-primary/10"
                                    >
                                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                            {(page - 1) * pageSize + index + 1}
                                        </TableCell>
                                        <TableCell className="max-w-[280px]">
                                            <TwoLine primary={row.kafedra_name} secondary={row.faculty_name} />
                                        </TableCell>
                                        <TableCell className="max-w-[340px]">
                                            <TwoLine primary={row.subject_name} secondary={row.curriculum_name} />
                                        </TableCell>
                                        <TableCell>
                                            <TwoLine
                                                primary={row.education_type ? t(row.education_type) : null}
                                                secondary={form ? t(form) : null}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TwoLine
                                                primary={row.course_type ? t(courseTypeLabel(row.course_type) ?? '') : null}
                                                secondary={semesterText(row)}
                                            />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Count value={row.topic_count} />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Count value={row.resource_count} />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Count value={row.homework_count} />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                isLoading={isLoading}
                totalItems={total}
                pageSize={pageSize}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
            />
        </div>
    );
};

export default CourseStatsPage;
