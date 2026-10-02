import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BookMarked, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { SubjectFormModal } from '@/components/generalTest/SubjectFormModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    useDeleteGeneralTestSubject,
    useGeneralTestSubjects,
    useSaveGeneralTestSubject,
} from '@/hooks/useGeneralTests';
import type { GeneralTestSubject, SubjectPayload } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';

export default function GeneralTestSubjectsPage() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState('');
    const debounced = useDebouncedValue(search);
    const { data, isLoading, isError, refetch } = useGeneralTestSubjects(page, pageSize, debounced);

    const saveSubject = useSaveGeneralTestSubject();
    const deleteSubject = useDeleteGeneralTestSubject();
    const [form, setForm] = useState<{ open: boolean; editing: GeneralTestSubject | null }>({ open: false, editing: null });
    const [deleting, setDeleting] = useState<GeneralTestSubject | null>(null);

    const handleSubmit = (payload: SubjectPayload) =>
        saveSubject.mutate(
            { id: form.editing?.id, data: payload },
            {
                onSuccess: (saved) => {
                    const created = !form.editing;
                    setForm({ open: false, editing: null });
                    toast.success(created ? "Fan ochildi. Endi foydalanuvchilarni biriktiring" : 'Fan saqlandi');
                    if (created) navigate(`/elementar-tests/subjects/${saved.id}`);
                },
                onError: (e) => toast.error(apiErrorMessage(e, 'Fanni saqlashda xatolik')),
            },
        );

    const confirmDelete = () => {
        if (!deleting) return;
        deleteSubject.mutate(deleting.id, {
            onSuccess: () => {
                setDeleting(null);
                toast.success("Fan o'chirildi");
            },
            onError: (e) => {
                setDeleting(null);
                toast.error(apiErrorMessage(e, "Fanni o'chirishda xatolik"));
            },
        });
    };

    const columns: DataTableColumn<GeneralTestSubject>[] = [
        {
            key: 'name',
            header: 'Nomi',
            cell: (s) => (
                <div className="min-w-0">
                    <p className="font-medium text-foreground">{s.name}</p>
                    {s.description && <p className="truncate text-xs text-muted-foreground">{s.description}</p>}
                </div>
            ),
        },
        { key: 'users', header: 'Biriktirilganlar', cell: (s) => s.user_count, hideBelow: 'sm' },
        { key: 'tests', header: 'Testlar', cell: (s) => s.test_count, hideBelow: 'sm' },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-24',
            cell: (s) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="update:general_test_subject">
                        <Button variant="ghost" size="icon" aria-label="Tahrirlash" onClick={() => setForm({ open: true, editing: s })}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:general_test_subject">
                        <Button variant="ghost" size="icon" aria-label="O'chirish" onClick={() => setDeleting(s)}>
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
                title="Elementar fanlar"
                description="Fanga biriktirilgan foydalanuvchilar uning faol testlarini ko'radi"
                actions={
                    <PermissionGate permission="create:general_test_subject">
                        <Button onClick={() => setForm({ open: true, editing: null })}>
                            <Plus className="h-4 w-4" /> Yangi fan
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
                        data={data?.subjects}
                        rowKey={(s) => s.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        onRowClick={(s) => navigate(`/elementar-tests/subjects/${s.id}`)}
                        emptyIcon={<BookMarked className="h-6 w-6" />}
                        emptyTitle="Fanlar yo'q"
                        emptyDescription="Test yaratishdan oldin fan oching."
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
                <SubjectFormModal
                    editing={form.editing}
                    onClose={() => setForm({ open: false, editing: null })}
                    onSubmit={handleSubmit}
                    isPending={saveSubject.isPending}
                />
            )}

            <ConfirmDialog
                isOpen={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={confirmDelete}
                title="Fanni o'chirish"
                description={`«${deleting?.name ?? ''}» fani va unga biriktirilgan foydalanuvchilar ro'yxati o'chiriladi. Fanda test bo'lsa, o'chirib bo'lmaydi.`}
                confirmText="O'chirish"
                isLoading={deleteSubject.isPending}
            />
        </div>
    );
}
