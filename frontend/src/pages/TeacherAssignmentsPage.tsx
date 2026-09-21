import { useMemo, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import { courseTypeLabel } from '@/services/courseTypes';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useKafedras } from '@/hooks/useReferenceData';
import { useRoleView } from '@/hooks/useRoleView';
import type { TeacherAssignment } from '@/services/teacherAssignmentService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { ClearFiltersButton } from '@/components/faculty/OrganizationToolbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';

const DEFAULT_PAGE_SIZE = 50;

/**
 * EPOS yuklamasi bitta jadvalda.
 *
 * Ilgari bu maʼlumot ikkiga boʻlingan edi — `/teacher-subjects` va
 * `/teacher-groups`. Ikkovi ham «qaysi guruhga qaysi fandan» degan savolga
 * javob bera olmasdi: ular oʻqituvchi×fan va oʻqituvchi×guruh juftliklarini
 * alohida koʻrsatardi, kesishmasi esa dekart koʻpaytmasiga aylanardi.
 */
export const TeacherAssignmentsPage = () => {
    const { isAdmin } = useRoleView();

    const [search, setSearch] = useState('');
    const [kafedra, setKafedra] = useState<string>('all');
    const [loadType, setLoadType] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    const params = useMemo(
        () => ({
            page,
            limit: pageSize,
            search: search.trim() || undefined,
            kafedra_id: kafedra !== 'all' ? Number(kafedra) : undefined,
            load_type: loadType !== 'all' ? loadType : undefined,
        }),
        [page, pageSize, search, kafedra, loadType],
    );

    const { data, isLoading, isError, refetch } = useTeacherAssignments(params);
    const { data: kafedrasData } = useKafedras(1, 500, undefined, undefined, isAdmin);

    const kafedraOptions = useMemo(
        () => [
            { value: 'all', label: 'Barcha kafedralar' },
            ...(kafedrasData?.kafedras ?? []).map((k) => ({
                value: String(k.id),
                label: k.name,
            })),
        ],
        [kafedrasData],
    );

    // Mashgʻulot turlari EPOS'dan keladi va oldindan maʼlum emas — roʻyxatni
    // koʻringan qatorlardan yigʻamiz. EPOS ularni bermasa, filtr ham chiqmaydi.
    //
    // Qiymatlar EPOS'dan inglizcha keladi (`lecture`, `practice`, `lab`,
    // `seminar`) va kurs turlari bilan bir xil, shuning uchun bir xil lugʻat
    // ishlatiladi. Notanish tur chiqsa — oʻz nomi bilan koʻrsatiladi, chunki
    // yashirish filtrni yolgʻon toʻliq koʻrsatardi.
    const loadTypeOptions = useMemo(() => {
        const seen = new Set<string>();
        for (const row of data?.items ?? []) {
            for (const type of row.load_types) seen.add(type);
        }
        return [
            { value: 'all', label: 'Barcha turlar' },
            ...Array.from(seen)
                .map((t) => ({ value: t, label: courseTypeLabel(t) ?? t }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        ];
    }, [data]);

    const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

    const columns: DataTableColumn<TeacherAssignment>[] = [
        {
            key: 'teacher',
            header: 'Oʻqituvchi',
            cell: (row) => (
                <div className="min-w-0">
                    <p className="truncate font-medium">{row.teacher_name}</p>
                    {row.kafedra_name && (
                        <p className="truncate text-xs text-muted-foreground">{row.kafedra_name}</p>
                    )}
                </div>
            ),
        },
        {
            key: 'subject',
            header: 'Fan',
            hideBelow: 'sm',
            cell: (row) => <span className="truncate">{row.subject_name}</span>,
        },
        {
            key: 'group',
            header: 'Guruh',
            hideBelow: 'sm',
            cell: (row) => <span className="whitespace-nowrap">{row.group_name}</span>,
        },
        {
            key: 'load',
            header: 'Mashgʻulot turi',
            hideBelow: 'md',
            cell: (row) =>
                row.load_types.length ? (
                    <div className="flex flex-wrap gap-1">
                        {row.load_types.map((type) => (
                            <span
                                key={type}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            >
                                {courseTypeLabel(type) ?? type}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-xs text-muted-foreground">koʻrsatilmagan</span>
                ),
        },
        {
            key: 'semester',
            header: 'Semestr',
            hideBelow: 'lg',
            className: 'text-muted-foreground',
            cell: (row) => row.semester_type ?? '—',
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Oʻquv yuklamasi"
                description="EPMOS'dan koʻchirilgan yuklama: kim, qaysi guruhga, qaysi fandan dars beradi"
            />

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full flex-1 sm:min-w-[220px] sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Oʻqituvchi, fan yoki guruh"
                        className="pl-9"
                    />
                </div>

                {isAdmin && (
                    <div className="w-[240px]">
                        <Combobox
                            options={kafedraOptions}
                            value={kafedra}
                            onChange={(value) => {
                                setKafedra(value);
                                setPage(1);
                            }}
                            placeholder="Kafedra"
                        />
                    </div>
                )}

                {loadTypeOptions.length > 1 && (
                    <div className="w-full sm:w-[200px]">
                        <Combobox
                            options={loadTypeOptions}
                            value={loadType}
                            onChange={(value) => {
                                setLoadType(value);
                                setPage(1);
                            }}
                            placeholder="Mashgʻulot turi"
                        />
                    </div>
                )}

                {data && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                        Jami: {data.total}
                    </span>
                )}

                <ClearFiltersButton
                    className="ml-auto"
                    count={
                        (search ? 1 : 0) + (kafedra !== 'all' ? 1 : 0) + (loadType !== 'all' ? 1 : 0)
                    }
                    onClick={() => {
                        setSearch('');
                        setKafedra('all');
                        setLoadType('all');
                        setPage(1);
                    }}
                />
            </div>

            <DataTable
                columns={columns}
                data={data?.items}
                rowKey={(row) => row.id}
                isLoading={isLoading}
                isError={isError}
                onRetry={refetch}
                // Telefonda jadval 960px edi — yuklama kartochka bo'lib chiqadi.
                renderCard={(row) => (
                    <div className="rounded-xl border border-border bg-card p-3">
                        <p className="font-medium text-foreground">{row.teacher_name}</p>
                        {row.kafedra_name && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{row.kafedra_name}</p>
                        )}
                        <p className="mt-2 text-sm text-foreground">{row.subject_name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.group_name}
                            {row.load_types.length > 0 &&
                                ` · ${row.load_types.map((t) => courseTypeLabel(t) ?? t).join(', ')}`}
                        </p>
                    </div>
                )}
                emptyIcon={<ClipboardList className="h-8 w-8" />}
                emptyTitle="Yuklama topilmadi"
                emptyDescription={
                    search || kafedra !== 'all'
                        ? 'Tanlangan filtrlarga mos yuklama yoʻq'
                        : "Yuklama hali koʻchirilmagan. EPMOS sinxronizatsiyasini ishga tushiring."
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
        </div>
    );
};

export default TeacherAssignmentsPage;
