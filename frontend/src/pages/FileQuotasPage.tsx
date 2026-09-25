import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HardDrive, Pencil, Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Combobox } from '@/components/ui/Combobox';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { QuotaMeter } from '@/components/file/QuotaBar';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useKafedras } from '@/hooks/useReferenceData';
import {
    useQuotaDefault,
    useTeacherQuotas,
    useUpdateQuotaDefault,
    useUpdateTeacherQuota,
} from '@/hooks/useFileQuotas';
import type { QuotaDefault, TeacherQuota, TeacherQuotaSort } from '@/services/fileQuotaService';
import { apiErrorMessage } from '@/utils/apiError';
import { formatSize, splitSize, toBytes, type SizeUnit } from '@/utils/fileSize';
import { cn } from '@/lib/utils';

const SORT_OPTIONS: { value: TeacherQuotaSort; label: string }[] = [
    { value: 'used_desc', label: "Eng ko'p ishlatganlar" },
    { value: 'remaining_asc', label: 'Eng kam joy qolganlar' },
    { value: 'name', label: "F.I.Sh. bo'yicha" },
];

interface LimitInputProps {
    value: string;
    unit: SizeUnit;
    onChange: (value: string, unit: SizeUnit) => void;
    id?: string;
}

/** Limit kiritish: son va MB/GB tanlovi. */
const LimitInput = ({ value, unit, onChange, id }: LimitInputProps) => (
    <div className="flex items-stretch gap-2">
        <Input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(event) => onChange(event.target.value, unit)}
            className="w-32"
            aria-label="Limit qiymati"
        />
        <select
            value={unit}
            onChange={(event) => onChange(value, event.target.value as SizeUnit)}
            aria-label="O'lchov birligi"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
            <option value="MB">MB</option>
            <option value="GB">GB</option>
        </select>
    </div>
);

/** Kiritilgan limitni tekshiradi; xato bo'lsa matnini qaytaradi. */
const limitError = (bytes: number | null, min?: number, max?: number): string | null => {
    if (bytes === null) return 'Musbat son kiriting';
    if (min !== undefined && bytes < min) return `Limit ${formatSize(min)} dan kam bo'lmasligi kerak`;
    if (max !== undefined && bytes > max) return `Limit ${formatSize(max)} dan oshmasligi kerak`;
    return null;
};

// ─── Umumiy limit ─────────────────────────────────────────────────────

/** Forma saqlangan qiymat bilan ochiladi; qiymat o'zgarsa `key` uni qayta o'rnatadi. */
const DefaultLimitForm = ({ bounds }: { bounds: QuotaDefault }) => {
    const update = useUpdateQuotaDefault();
    const [initial] = useState(() => splitSize(bounds.limit_bytes));
    const [value, setValue] = useState(initial.value);
    const [unit, setUnit] = useState<SizeUnit>(initial.unit);

    const bytes = toBytes(value, unit);
    const error = limitError(bytes, bounds.min_limit_bytes, bounds.max_limit_bytes);
    const unchanged = bytes === bounds.limit_bytes;

    const save = async () => {
        if (bytes === null || error) return;
        try {
            await update.mutateAsync(bytes);
            toast.success(`Umumiy limit ${formatSize(bytes)} qilib belgilandi`);
        } catch (cause) {
            toast.error(apiErrorMessage(cause, 'Limitni saqlab boʻlmadi'));
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <LimitInput
                    value={value}
                    unit={unit}
                    onChange={(nextValue, nextUnit) => {
                        setValue(nextValue);
                        setUnit(nextUnit);
                    }}
                />
                <Button
                    size="sm"
                    onClick={save}
                    isLoading={update.isPending}
                    disabled={bytes === null || !!error || unchanged}
                >
                    Saqlash
                </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
};

const DefaultLimitCard = () => {
    const { data } = useQuotaDefault();

    return (
        <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <HardDrive className="h-4 w-4 text-primary" />
                        Umumiy limit
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Individual limiti belgilanmagan barcha oʻqituvchilarga amal qiladi.
                        {data && <> Hozir: <span className="font-medium text-foreground">{formatSize(data.limit_bytes)}</span>.</>}
                    </p>
                </div>
                {data && (
                    <PermissionGate permission="update:file_quota">
                        <DefaultLimitForm key={data.limit_bytes} bounds={data} />
                    </PermissionGate>
                )}
            </div>
        </section>
    );
};

// ─── Individual limit modali ──────────────────────────────────────────

interface EditLimitModalProps {
    teacher: TeacherQuota;
    defaultLimit: number;
    onClose: () => void;
}

/** Har bir o'qituvchi uchun `key` bilan yangidan o'rnatiladi — forma uning limiti bilan ochiladi. */
const EditLimitModal = ({ teacher, defaultLimit, onClose }: EditLimitModalProps) => {
    const { data: bounds } = useQuotaDefault();
    const update = useUpdateTeacherQuota();
    const [initial] = useState(() => splitSize(teacher.custom_limit_bytes ?? defaultLimit));
    const [value, setValue] = useState(initial.value);
    const [unit, setUnit] = useState<SizeUnit>(initial.unit);

    const bytes = toBytes(value, unit);
    const error = limitError(bytes, bounds?.min_limit_bytes, bounds?.max_limit_bytes);
    const belowUsage = bytes !== null && bytes < teacher.used_bytes;

    const save = async (limitBytes: number | null) => {
        try {
            await update.mutateAsync({ userId: teacher.user_id, limitBytes });
            toast.success(
                limitBytes === null
                    ? `${teacher.full_name}: umumiy limitga qaytarildi`
                    : `${teacher.full_name}: limit ${formatSize(limitBytes)} qilib belgilandi`,
            );
            onClose();
        } catch (cause) {
            toast.error(apiErrorMessage(cause, 'Limitni saqlab boʻlmadi'));
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Individual limit">
            <div className="space-y-4">
                <div className="rounded-xl bg-muted/40 p-3 text-sm">
                    <p className="font-medium text-foreground">{teacher.full_name}</p>
                    <p className="mt-1 text-muted-foreground tabular-nums">
                        Ishlatilgan: {formatSize(teacher.used_bytes)} · {teacher.file_count} ta fayl
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="teacher-limit" className="text-sm font-medium text-foreground">
                        Limit
                    </label>
                    <LimitInput
                        id="teacher-limit"
                        value={value}
                        unit={unit}
                        onChange={(nextValue, nextUnit) => {
                            setValue(nextValue);
                            setUnit(nextUnit);
                        }}
                    />
                    {error ? (
                        <p className="text-xs text-destructive">{error}</p>
                    ) : belowUsage ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Limit ishlatilgan hajmdan past. Mavjud fayllar oʻchirilmaydi, lekin
                            oʻqituvchi yangi fayl yuklay olmaydi.
                        </p>
                    ) : null}
                </div>

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
                    {teacher.is_custom ? (
                        <Button variant="outline" size="sm" onClick={() => save(null)} disabled={update.isPending}>
                            Umumiy limitga qaytarish ({formatSize(defaultLimit)})
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2 sm:justify-end">
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            Bekor qilish
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => bytes !== null && save(bytes)}
                            isLoading={update.isPending}
                            disabled={bytes === null || !!error}
                        >
                            Saqlash
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

// ─── Sahifa ───────────────────────────────────────────────────────────

const FileQuotasPage = () => {
    const [search, setSearch] = useState('');
    const [kafedra, setKafedra] = useState('all');
    const [sort, setSort] = useState<TeacherQuotaSort>('used_desc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [editing, setEditing] = useState<TeacherQuota | null>(null);

    const debouncedSearch = useDebouncedValue(search.trim());

    const params = useMemo(
        () => ({
            search: debouncedSearch || undefined,
            kafedra_id: kafedra === 'all' ? undefined : Number(kafedra),
            sort,
            page,
            size: pageSize,
        }),
        [debouncedSearch, kafedra, sort, page, pageSize],
    );

    const { data, isLoading, isError, refetch } = useTeacherQuotas(params);
    const { data: kafedrasData } = useKafedras(1, 200);

    const kafedraOptions = useMemo(
        () => [
            { value: 'all', label: 'Barcha kafedralar' },
            ...(kafedrasData?.kafedras ?? []).map((k) => ({ value: String(k.id), label: k.name })),
        ],
        [kafedrasData],
    );

    const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

    const columns: DataTableColumn<TeacherQuota>[] = [
        {
            key: 'name',
            header: 'Oʻqituvchi',
            cell: (row) => (
                <div className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{row.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                        {row.kafedra_name ?? 'Kafedrasiz'}
                    </span>
                </div>
            ),
        },
        {
            key: 'limit',
            header: 'Belgilangan limit',
            className: 'tabular-nums',
            cell: (row) =>
                row.is_unlimited ? (
                    <span className="text-muted-foreground">Cheklanmagan</span>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{formatSize(row.limit_bytes ?? 0)}</span>
                        <span
                            className={cn(
                                'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                                row.is_custom ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                            )}
                        >
                            {row.is_custom ? 'Individual' : 'Umumiy'}
                        </span>
                    </div>
                ),
        },
        {
            key: 'used',
            header: 'Ishlatilgan',
            className: 'tabular-nums',
            cell: (row) => (
                <div className="min-w-[120px] space-y-1">
                    <span className="text-sm">{formatSize(row.used_bytes)}</span>
                    {!row.is_unlimited && <QuotaMeter used={row.used_bytes} limit={row.limit_bytes} />}
                </div>
            ),
        },
        {
            key: 'remaining',
            header: 'Qolgan',
            className: 'tabular-nums',
            hideBelow: 'sm',
            cell: (row) => {
                if (row.is_unlimited) return <span className="text-muted-foreground">—</span>;
                if (row.over_limit_bytes > 0) {
                    return (
                        <span className="text-destructive" title="Limit ishlatilgan hajmdan past qilingan">
                            0 MB (limitdan {formatSize(row.over_limit_bytes)} oshgan)
                        </span>
                    );
                }
                return row.remaining_bytes === 0 ? (
                    <span className="text-destructive">0 MB</span>
                ) : (
                    formatSize(row.remaining_bytes ?? 0)
                );
            },
        },
        {
            key: 'files',
            header: 'Fayllar',
            className: 'tabular-nums text-muted-foreground',
            hideBelow: 'md',
            cell: (row) => `${row.file_count} ta`,
        },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-28',
            cell: (row) =>
                row.is_unlimited ? null : (
                    <PermissionGate permission="update:file_quota">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                                event.stopPropagation();
                                setEditing(row);
                            }}
                            className="gap-1.5"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                            Tahrirlash
                        </Button>
                    </PermissionGate>
                ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fayl yuklash limitlari"
                description="Oʻqituvchi yuklagan fayllarning umumiy hajmi limitdan oshmaydi. Fayl oʻchirilsa, uning hajmi ishlatilgan hajmdan ayriladi."
            />

            <DefaultLimitCard />

            <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] flex-1 max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="F.I.Sh. boʻyicha qidirish..."
                            className="h-9 pl-9 text-sm"
                        />
                    </div>
                    <Combobox
                        options={kafedraOptions}
                        value={kafedra}
                        onChange={(value) => {
                            setKafedra(value || 'all');
                            setPage(1);
                        }}
                        placeholder="Kafedra"
                        className="w-full sm:w-64"
                    />
                    <select
                        value={sort}
                        onChange={(event) => {
                            setSort(event.target.value as TeacherQuotaSort);
                            setPage(1);
                        }}
                        aria-label="Saralash"
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <DataTable
                    columns={columns}
                    data={data?.items}
                    rowKey={(row) => row.user_id}
                    isLoading={isLoading}
                    isError={isError}
                    onRetry={refetch}
                    emptyTitle="Oʻqituvchilar topilmadi"
                    emptyDescription="Qidiruv yoki filtr shartlariga mos oʻqituvchi yoʻq."
                    emptyIcon={<Users className="h-6 w-6" />}
                />

                {data && data.total > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        isLoading={isLoading}
                        totalItems={data.total}
                        pageSize={pageSize}
                        onPageSizeChange={(size) => {
                            setPageSize(size);
                            setPage(1);
                        }}
                    />
                )}
            </section>

            {editing && (
                <EditLimitModal
                    key={editing.user_id}
                    teacher={editing}
                    defaultLimit={data?.default_limit_bytes ?? 0}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
};

export default FileQuotasPage;
