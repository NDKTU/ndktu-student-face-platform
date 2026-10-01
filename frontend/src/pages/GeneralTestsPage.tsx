import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { GeneralTestFormModal } from '@/components/generalTest/GeneralTestFormModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    useCreateGeneralTest,
    useDeleteGeneralTest,
    useGeneralTests,
    useUpdateGeneralTest,
} from '@/hooks/useGeneralTests';
import type { GeneralTestPayload, GeneralTestSummary } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';

export default function GeneralTestsPage() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState('');
    const debounced = useDebouncedValue(search);
    const { data, isLoading, isError, refetch } = useGeneralTests(page, pageSize, debounced);

    const createTest = useCreateGeneralTest();
    const updateTest = useUpdateGeneralTest();
    const deleteTest = useDeleteGeneralTest();

    const [form, setForm] = useState<{ open: boolean; editing: GeneralTestSummary | null }>({ open: false, editing: null });
    const [deleting, setDeleting] = useState<GeneralTestSummary | null>(null);

    const handleSubmit = (payload: GeneralTestPayload) => {
        if (form.editing) {
            updateTest.mutate(
                { id: form.editing.id, data: payload },
                {
                    onSuccess: () => {
                        setForm({ open: false, editing: null });
                        toast.success('Test saqlandi');
                    },
                    onError: (e) => toast.error(apiErrorMessage(e, 'Testni saqlashda xatolik')),
                },
            );
            return;
        }
        createTest.mutate(payload, {
            onSuccess: (created) => {
                setForm({ open: false, editing: null });
                toast.success('Test yaratildi. Endi savollarni qo\'shing');
                navigate(`/general-tests/${created.id}`);
            },
            onError: (e) => toast.error(apiErrorMessage(e, 'Testni yaratishda xatolik')),
        });
    };

    const confirmDelete = () => {
        if (!deleting) return;
        deleteTest.mutate(deleting.id, {
            onSuccess: () => {
                setDeleting(null);
                toast.success("Test o'chirildi");
            },
            onError: (e) => {
                setDeleting(null);
                toast.error(apiErrorMessage(e, "Testni o'chirishda xatolik"));
            },
        });
    };

    const columns: DataTableColumn<GeneralTestSummary>[] = [
        {
            key: 'title',
            header: 'Nomi',
            cell: (t) => (
                <div className="min-w-0">
                    <p className="font-medium text-foreground">{t.title}</p>
                    {t.description && <p className="truncate text-xs text-muted-foreground">{t.description}</p>}
                </div>
            ),
        },
        { key: 'questions', header: 'Savollar', cell: (t) => t.question_count, hideBelow: 'sm' },
        { key: 'duration', header: 'Vaqt', cell: (t) => `${t.duration} daq.`, hideBelow: 'md' },
        { key: 'attempts', header: 'Urinishlar', cell: (t) => t.attempt_limit, hideBelow: 'md' },
        { key: 'passed', header: 'Topshirganlar', cell: (t) => t.attempt_count, hideBelow: 'lg' },
        {
            key: 'status',
            header: 'Holati',
            cell: (t) => (
                <span
                    className={
                        t.is_active
                            ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400'
                            : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                    }
                >
                    {t.is_active ? 'Faol' : 'Nofaol'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-24',
            cell: (t) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="update:general_test">
                        <Button variant="ghost" size="icon" aria-label="Tahrirlash" onClick={() => setForm({ open: true, editing: t })}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:general_test">
                        <Button variant="ghost" size="icon" aria-label="O'chirish" onClick={() => setDeleting(t)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </PermissionGate>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Umumiy testlar"
                description="Fan va guruhga bog'lanmagan, barcha foydalanuvchilar ishlaydigan testlar"
                actions={
                    <PermissionGate permission="create:general_test">
                        <Button onClick={() => setForm({ open: true, editing: null })}>
                            <Plus className="h-4 w-4" /> Yangi test
                        </Button>
                    </PermissionGate>
                }
            />

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <Input
                        placeholder="Nomi bo'yicha qidirish..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        leftAddon={<Search className="h-4 w-4" />}
                        className="max-w-sm"
                    />
                    <DataTable
                        columns={columns}
                        data={data?.tests}
                        rowKey={(t) => t.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        onRowClick={(t) => navigate(`/general-tests/${t.id}`)}
                        emptyIcon={<ClipboardList className="h-6 w-6" />}
                        emptyTitle="Testlar yo'q"
                        emptyDescription="Birinchi umumiy testni yarating."
                    />
                    {data && data.total > 0 && (
                        <Pagination
                            currentPage={page}
                            totalPages={Math.ceil(data.total / pageSize)}
                            onPageChange={setPage}
                            totalItems={data.total}
                            pageSize={pageSize}
                            onPageSizeChange={setPageSize}
                        />
                    )}
                </CardContent>
            </Card>

            {form.open && (
                <GeneralTestFormModal
                    editing={form.editing}
                    onClose={() => setForm({ open: false, editing: null })}
                    onSubmit={handleSubmit}
                    isPending={createTest.isPending || updateTest.isPending}
                />
            )}

            <ConfirmDialog
                isOpen={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={confirmDelete}
                title="Testni o'chirish"
                description={`«${deleting?.title ?? ''}» testi, uning savollari va barcha natijalari o'chiriladi. Bu amalni bekor qilib bo'lmaydi.`}
                confirmText="O'chirish"
                isLoading={deleteTest.isPending}
            />
        </div>
    );
}
