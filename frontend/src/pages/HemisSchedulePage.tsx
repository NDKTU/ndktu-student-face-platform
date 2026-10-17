import { useMemo, useState } from 'react';
import { DatePicker } from '@/components/ui/DatePicker';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CalendarDays, CalendarSearch, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { ClearFiltersButton } from '@/components/faculty/OrganizationToolbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MonthCalendar } from '@/components/schedule/MonthCalendar';
import { WeekCalendar } from '@/components/schedule/WeekCalendar';
import { MonthNav, ViewToggle, WeekNav } from '@/components/schedule/ScheduleControls';
import {
    addDays,
    buildWeek,
    lessonTime,
    monthStartOf,
    mondayOf,
    toIsoDate,
    trainingTone,
    viewRange,
    weekdayOf,
} from '@/components/schedule/scheduleUtils';
import { useScheduleFilters, useScheduleList } from '@/hooks/useHemisSchedule';
import type { ScheduleFilterOption, ScheduleLesson } from '@/services/hemisScheduleService';
import type { ScheduleView } from '@/components/schedule/scheduleUtils';
import { formatDate } from '@/utils/date';

const DEFAULT_PAGE_SIZE = 50;
const ALL = 'all';
/** Bekend chegarasi (`ScheduleListRequest.limit`). Bitta guruh yoki o'qituvchining
 * haftasi 30–40 dars, oyi (qo'shni haftalar bilan) ~150 — chegaraga yetmaydi. */
const CALENDAR_LIMIT = 500;

/** `withHint` — qiymat ikkinchi qatorda: o'qituvchini HEMIS raqami bo'yicha ham topish uchun. */
const withAll = (
    label: string,
    options: ScheduleFilterOption[] | undefined,
    withHint = false,
): ComboboxOption[] => [
    { value: ALL, label },
    ...(options ?? []).map((o) => ({ value: o.value, label: o.label, hint: withHint ? o.value : undefined })),
];

/**
 * HEMIS dars jadvali — butun universitet, admin uchun.
 *
 * Filtrlar HEMIS identifikatorlari bo'yicha va variantlari jadvalning
 * o'zidan olinadi: zerkalo bizning guruh/o'qituvchi spravochniklariga
 * bog'lanmagan, aks holda bog'lanmagan guruhlarning darslari filtrda
 * ko'rinmay qolardi.
 */
const HemisSchedulePage = () => {
    const { t } = useTranslation();

    const [faculty, setFaculty] = useState(ALL);
    const [department, setDepartment] = useState(ALL);
    const [year, setYear] = useState(ALL);
    const [group, setGroup] = useState(ALL);
    const [employee, setEmployee] = useState(ALL);
    const [subject, setSubject] = useState(ALL);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    // Ko'rinish eslab qolinmaydi: sahifa doim ro'yxatda ochiladi. Kalendar
    // guruh yoki o'qituvchi tanlanmaguncha bo'sh — eslab qolingan «Oy» bilan
    // kirgan admin birinchi bo'lib bo'sh sahifani ko'rardi.
    const [view, setView] = useState<ScheduleView>('list');
    const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
    const [monthStart, setMonthStart] = useState(() => monthStartOf(new Date()));

    const isCalendar = view !== 'list';
    const [calendarFrom, calendarTo] = viewRange(view, weekStart, monthStart);
    // Butun universitetning haftasi ~900 dars — kalendarda o'qib bo'lmaydi.
    // Kalendar guruh yoki o'qituvchi tanlanganda chiziladi.
    const calendarReady = group !== ALL || employee !== ALL;

    const params = useMemo(
        () => ({
            page: isCalendar ? 1 : page,
            limit: isCalendar ? CALENDAR_LIMIT : pageSize,
            faculty_hemis_id: faculty !== ALL ? Number(faculty) : undefined,
            department_hemis_id: department !== ALL ? Number(department) : undefined,
            education_year: year !== ALL ? year : undefined,
            group_hemis_id: group !== ALL ? Number(group) : undefined,
            employee_id_number: employee !== ALL ? employee : undefined,
            subject_hemis_id: subject !== ALL ? Number(subject) : undefined,
            date_from: isCalendar ? calendarFrom : dateFrom || undefined,
            date_to: isCalendar ? calendarTo : dateTo || undefined,
        }),
        [isCalendar, page, pageSize, faculty, department, year, group, employee, subject, dateFrom, dateTo, calendarFrom, calendarTo],
    );

    const { data, isLoading, isError, refetch, isFetching } = useScheduleList(
        params,
        !isCalendar || calendarReady,
    );

    // Faqat o'qituvchi tanlangan bo'lsa — uning oqimlari bitta kartochkaga
    // yig'iladi va katakda guruhlar ko'rinadi; guruh tanlangan bo'lsa — o'qituvchi.
    const calendarShow = group !== ALL ? 'teacher' : 'groups';
    const weekDays = useMemo(
        () => buildWeek(view === 'week' ? (data?.items ?? []) : [], weekStart, calendarShow === 'groups'),
        [view, data, weekStart, calendarShow],
    );
    const { data: filters } = useScheduleFilters({
        faculty_hemis_id: faculty !== ALL ? Number(faculty) : undefined,
        department_hemis_id: department !== ALL ? Number(department) : undefined,
    });

    const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setPage(1);
    };

    // Kaskad: fakultet yoki kafedra almashsa, unga bog'liq tanlovlar
    // tashlanadi — boshqa fakultetning guruhi tanlangan holda qolsa, ro'yxat
    // jimgina bo'sh chiqardi va admin sababini topolmasdi.
    const changeFaculty = (value: string) => {
        setFaculty(value);
        setDepartment(ALL);
        setGroup(ALL);
        setEmployee(ALL);
        setSubject(ALL);
        setPage(1);
    };
    const changeDepartment = (value: string) => {
        setDepartment(value);
        setGroup(ALL);
        setEmployee(ALL);
        setSubject(ALL);
        setPage(1);
    };

    const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
    const activeFilters =
        [faculty, department, year, group, employee, subject].filter((v) => v !== ALL).length +
        (!isCalendar && dateFrom ? 1 : 0) +
        (!isCalendar && dateTo ? 1 : 0);

    const columns: DataTableColumn<ScheduleLesson>[] = [
        {
            key: 'date',
            header: t('Sana'),
            cell: (row) => (
                <div className="whitespace-nowrap">
                    <p className="font-medium tabular-nums">{formatDate(row.lesson_date)}</p>
                    <p className="text-xs text-muted-foreground">{t(weekdayOf(row.lesson_date))}</p>
                </div>
            ),
        },
        {
            key: 'pair',
            header: t('Para'),
            cell: (row) => (
                <div className="whitespace-nowrap">
                    <p className="font-medium">{row.lesson_pair}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{lessonTime(row)}</p>
                </div>
            ),
        },
        {
            key: 'subject',
            header: t('Fan'),
            cell: (row) => (
                <div className="min-w-0">
                    <p className="line-clamp-2 font-medium">{row.subject_name}</p>
                    {row.training_type && (
                        <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${trainingTone(row.training_type_code)}`}
                        >
                            {row.training_type}
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: 'group',
            header: t('Guruh'),
            hideBelow: 'sm',
            cell: (row) => <span className="whitespace-nowrap">{row.group_name}</span>,
        },
        {
            key: 'teacher',
            header: t("O'qituvchi"),
            hideBelow: 'md',
            cell: (row) => (
                <div className="min-w-0">
                    <p className="truncate">{row.employee_name}</p>
                    {row.employee_id_number ? (
                        <p className="text-xs text-muted-foreground tabular-nums">{row.employee_id_number}</p>
                    ) : (
                        // Raqamsiz o'qituvchi o'z jadvalini «Dars jadvali» da ko'rmaydi.
                        <p className="flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            {t("HEMIS raqami yo'q")}
                        </p>
                    )}
                </div>
            ),
        },
        {
            key: 'room',
            header: t('Auditoriya'),
            hideBelow: 'lg',
            cell: (row) => (
                <div className="min-w-0">
                    <p className="whitespace-nowrap">{row.auditorium_name || '—'}</p>
                    {row.building_name && (
                        <p className="truncate text-xs text-muted-foreground">{row.building_name}</p>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('HEMIS dars jadvali')}
                description={t("HEMIS'dan ko'chirilgan jadval: guruhlar, o'qituvchilar va auditoriyalar")}
                actions={
                    <>
                        <ViewToggle view={view} onChange={setView} />
                        {view === 'week' && <WeekNav weekStart={weekStart} onChange={setWeekStart} />}
                        {view === 'month' && <MonthNav monthStart={monthStart} onChange={setMonthStart} />}
                        <Link to="/admin/hemis-sync">
                            <Button variant="outline">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {t('Sinxronlash')}
                            </Button>
                        </Link>
                    </>
                }
            />

            <div className="flex flex-wrap items-center gap-3">
                <div className="w-full sm:w-[220px]">
                    <Combobox
                        options={withAll(t('Barcha fakultetlar'), filters?.faculties)}
                        value={faculty}
                        onChange={changeFaculty}
                        placeholder={t('Fakultet')}
                    />
                </div>
                <div className="w-full sm:w-[240px]">
                    <Combobox
                        options={withAll(t('Barcha kafedralar'), filters?.departments)}
                        value={department}
                        onChange={changeDepartment}
                        placeholder={t('Kafedra')}
                        searchPlaceholder={t('Kafedrani qidirish')}
                    />
                </div>
                <div className="w-full sm:w-[160px]">
                    <Combobox
                        options={withAll(t("Barcha o'quv yillari"), filters?.education_years)}
                        value={year}
                        onChange={resetPage(setYear)}
                        placeholder={t("O'quv yili")}
                    />
                </div>
                <div className="w-full sm:w-[200px]">
                    <Combobox
                        options={withAll(t('Barcha guruhlar'), filters?.groups)}
                        value={group}
                        onChange={resetPage(setGroup)}
                        placeholder={t('Guruh')}
                        searchPlaceholder={t('Guruhni qidirish')}
                    />
                </div>
                <div className="w-full sm:w-[240px]">
                    <Combobox
                        options={withAll(t("Barcha o'qituvchilar"), filters?.employees, true)}
                        value={employee}
                        onChange={resetPage(setEmployee)}
                        placeholder={t("O'qituvchi")}
                        searchPlaceholder={t("O'qituvchini qidirish")}
                    />
                </div>
                <div className="w-full sm:w-[260px]">
                    <Combobox
                        options={withAll(t('Barcha fanlar'), filters?.subjects)}
                        value={subject}
                        onChange={resetPage(setSubject)}
                        placeholder={t('Fan')}
                        searchPlaceholder={t('Fanni qidirish')}
                    />
                </div>
                {!isCalendar && (
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        <DatePicker
                            value={dateFrom}
                            onChange={(next) => resetPage(setDateFrom)(next)}
                            clearable
                            format="short"
                            placeholder={t('Sanadan')}
                            ariaLabel={t('Sanadan')}
                            className="w-full sm:w-[150px]"
                            max={dateTo || undefined}
                        />
                        <span className="text-muted-foreground">–</span>
                        <DatePicker
                            value={dateTo}
                            onChange={(next) => resetPage(setDateTo)(next)}
                            clearable
                            format="short"
                            placeholder={t('Sanagacha')}
                            ariaLabel={t('Sanagacha')}
                            className="w-full sm:w-[150px]"
                            min={dateFrom || undefined}
                        />
                    </div>
                )}

                {data && (!isCalendar || calendarReady) && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                        {t('Jami')}: {data.total}
                    </span>
                )}

                <ClearFiltersButton
                    className="ml-auto"
                    count={activeFilters}
                    onClick={() => {
                        setFaculty(ALL);
                        setDepartment(ALL);
                        setYear(ALL);
                        setGroup(ALL);
                        setEmployee(ALL);
                        setSubject(ALL);
                        setDateFrom('');
                        setDateTo('');
                        setPage(1);
                    }}
                />
            </div>

            {isCalendar ? (
                !calendarReady ? (
                    <EmptyState
                        icon={<CalendarSearch className="h-8 w-8" />}
                        title={t("Guruh yoki o'qituvchini tanlang")}
                        description={t("Kalendar bitta guruh yoki o'qituvchining jadvalini ko'rsatadi")}
                    />
                ) : isLoading ? (
                    <Skeleton className="h-96 rounded-2xl" />
                ) : isError ? (
                    <ErrorState onRetry={() => refetch()} />
                ) : view === 'week' && !data?.items.length ? (
                    <EmptyState
                        icon={<CalendarDays className="h-8 w-8" />}
                        title={t("Bu haftada dars yo'q")}
                        description={t("Tanlangan filtrlarga mos dars yo'q")}
                    />
                ) : (
                    <div className={`space-y-3 ${isFetching ? 'opacity-60' : ''}`}>
                        {view === 'week' && (
                            <p className="text-sm text-muted-foreground tabular-nums">
                                {formatDate(toIsoDate(weekStart))} – {formatDate(toIsoDate(addDays(weekStart, 6)))}
                            </p>
                        )}
                        {data && data.total > data.items.length && (
                            <p className="flex items-center gap-2 text-sm text-warning">
                                <AlertTriangle className="h-4 w-4" />
                                {t("{{shown}} / {{total}} dars ko'rsatildi — filtrni toraytiring", {
                                    shown: data.items.length,
                                    total: data.total,
                                })}
                            </p>
                        )}
                        {view === 'month' ? (
                            <MonthCalendar
                                key={toIsoDate(monthStart)}
                                monthStart={monthStart}
                                items={data?.items ?? []}
                                today={toIsoDate(new Date())}
                                show={calendarShow}
                                merge={calendarShow === 'groups'}
                            />
                        ) : (
                            <WeekCalendar days={weekDays} today={toIsoDate(new Date())} show={calendarShow} />
                        )}
                    </div>
                )
            ) : (
                <>
                    <DataTable
                        columns={columns}
                        data={data?.items}
                        rowKey={(row) => row.hemis_id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={refetch}
                        renderCard={(row) => (
                            <div className="rounded-xl border border-border bg-card p-3">
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span className="tabular-nums">
                                        {formatDate(row.lesson_date)} · {t(weekdayOf(row.lesson_date))}
                                    </span>
                                    <span className="tabular-nums">
                                        {row.lesson_pair}-{t('para')} · {lessonTime(row)}
                                    </span>
                                </div>
                                <p className="mt-2 font-medium text-foreground">{row.subject_name}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {[row.training_type, row.group_name, row.auditorium_name].filter(Boolean).join(' · ')}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{row.employee_name}</p>
                            </div>
                        )}
                        emptyIcon={<CalendarDays className="h-8 w-8" />}
                        emptyTitle={t('Darslar topilmadi')}
                        emptyDescription={
                            activeFilters
                                ? t("Tanlangan filtrlarga mos dars yo'q")
                                : t('Jadval hali yuklanmagan. HEMIS sinxronizatsiyasi sahifasidan ishga tushiring.')
                        }
                    />

                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        isLoading={isLoading}
                        totalItems={data?.total ?? 0}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                    />
                </>
            )}
        </div>
    );
};

export default HemisSchedulePage;
