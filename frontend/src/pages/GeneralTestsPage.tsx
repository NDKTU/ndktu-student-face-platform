import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BookMarked, ClipboardList, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Switch } from '@/components/ui/Switch';
import { PermissionGate, usePermission } from '@/components/auth/PermissionGate';
import { GeneralTestFormModal } from '@/components/generalTest/GeneralTestFormModal';
import { questionsLabel } from '@/components/generalTest/labels';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    useCreateGeneralTest,
    useDeleteGeneralTest,
    useGeneralTests,
    useGeneralTestSubjects,
    useUpdateGeneralTest,
} from '@/hooks/useGeneralTests';
import type { GeneralTestPayload, GeneralTestSummary } from '@/services/generalTestService';
import { PROCTORING_LABELS } from '@/services/quizService';
import { apiErrorMessage } from '@/utils/apiError';

export default function GeneralTestsPage() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState('');
    const [subjectId, setSubjectId] = useState('');
    const debounced = useDebouncedValue(search);
    const { data, isLoading, isError, refetch } = useGeneralTests(
        page,
        pageSize,
        debounced,
        subjectId ? Number(subjectId) : undefined,
    );
    const { data: subjects } = useGeneralTestSubjects(1, 500);
    const subjectOptions = useMemo(
        () => (subjects?.subjects ?? []).map((s) => ({ value: String(s.id), label: s.name })),
        [subjects],
    );
    const canEdit = usePermission('update:general_test');

    const createTest = useCreateGeneralTest();
    const updateTest = useUpdateGeneralTest();
    const deleteTest = useDeleteGeneralTest();
    const [togglingId, setTogglingId] = useState<number | null>(null);
    const [regeneratingId, setRegeneratingId] = useState<number | null>(null);

    // Butun universitetni ko'radigan rol begona testni ham ko'radi, lekin
    // boshqarmaydi — ruxsatning o'zi yetmaydi.
    const manages = (test: GeneralTestSummary) => canEdit && Boolean(test.can_manage);

    // Har bir test sahifasini ochmasdan, ro'yxatdan turib yangi PIN —
    // eski PIN tarqab ketganda darhol yopish uchun.
    const regeneratePin = (test: GeneralTestSummary) => {
        setRegeneratingId(test.id);
        updateTest.mutate(
            { id: test.id, data: { regenerate_pin: true } },
            {
                onSuccess: () => toast.success('Yangi PIN yaratildi'),
                onError: (e) => toast.error(apiErrorMessage(e, 'Saqlashda xatolik')),
                onSettled: () => setRegeneratingId(null),
            },
        );
    };

    // Admin testni ro'yxatning o'zida yoqib-o'chiradi — kartochkaga kirmasdan.
    const toggleActive = (test: GeneralTestSummary, value: boolean) => {
        if (value && test.question_count === 0) {
            toast.error("Avval fanning savollar bankiga savol qo'shing");
            return;
        }
        setTogglingId(test.id);
        updateTest.mutate(
            { id: test.id, data: { is_active: value } },
            {
                onSuccess: () => toast.success(value ? 'Test faollashtirildi' : "Test o'chirib qo'yildi"),
                onError: (e) => toast.error(apiErrorMessage(e, 'Saqlashda xatolik')),
                onSettled: () => setTogglingId(null),
            },
        );
    };

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
                navigate(`/elementar-tests/${created.id}`);
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
                </div>
            ),
        },
        { key: 'questions', header: 'Savollar', cell: (t) => questionsLabel(t), hideBelow: 'sm' },
        { key: 'groups', header: 'Guruhlar', cell: (t) => t.group_count, hideBelow: 'lg' },
        { key: 'duration', header: 'Vaqt', cell: (t) => `${t.duration} daq.`, hideBelow: 'md' },
        { key: 'attempts', header: 'Urinishlar', cell: (t) => t.attempt_limit, hideBelow: 'md' },
        {
            key: 'mode',
            header: 'Rejim',
            cell: (t) =>
                `${PROCTORING_LABELS[t.proctoring_mode ?? 'standard']}${t.strict_mode ? " · Qat'iy" : ''}`,
            hideBelow: 'lg',
        },
        { key: 'passed', header: 'Topshirganlar', cell: (t) => t.attempt_count, hideBelow: 'lg' },
        {
            key: 'pin',
            header: 'PIN',
            // Testni boshlayotgan o'qituvchi PIN'ni ro'yxatdan darhol ko'rsin —
            // har bir test sahifasini ochib o'tirmasin.
            cell: (t) =>
                t.pin ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <span className="font-mono font-semibold tracking-widest text-foreground">{t.pin}</span>
                        {manages(t) && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Yangi PIN"
                                aria-label="Yangi PIN"
                                disabled={regeneratingId === t.id}
                                onClick={() => regeneratePin(t)}
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${regeneratingId === t.id ? 'animate-spin' : ''}`} />
                            </Button>
                        )}
                    </div>
                ) : t.pin_required ? (
                    <span className="text-muted-foreground">••••</span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'status',
            header: 'Holati',
            cell: (t) => (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Switch
                        checked={t.is_active}
                        onCheckedChange={(value) => toggleActive(t, value)}
                        disabled={!manages(t) || togglingId === t.id}
                        aria-label={t.is_active ? "O'chirib qo'yish" : 'Faollashtirish'}
                    />
                    <span className="text-xs text-muted-foreground">{t.is_active ? 'Faol' : 'Nofaol'}</span>
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-24',
            cell: (t) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {manages(t) && (
                        <Button variant="ghost" size="icon" aria-label="Tahrirlash" onClick={() => setForm({ open: true, editing: t })}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                    {t.can_manage && (
                        <PermissionGate permission="delete:general_test">
                            <Button variant="ghost" size="icon" aria-label="O'chirish" onClick={() => setDeleting(t)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </PermissionGate>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Elementar testlar"
                description="Faol test fanga biriktirilgan foydalanuvchilar va testga biriktirilgan guruhlarga ko'rinadi"
                actions={
                    <div className="flex flex-wrap gap-2">
                        <PermissionGate permission="read:general_test_subject">
                            <Button variant="outline" onClick={() => navigate('/elementar-tests/subjects')}>
                                <BookMarked className="h-4 w-4" /> Fanlar
                            </Button>
                        </PermissionGate>
                        <PermissionGate permission="create:general_test">
                            <Button onClick={() => setForm({ open: true, editing: null })}>
                                <Plus className="h-4 w-4" /> Yangi test
                            </Button>
                        </PermissionGate>
                    </div>
                }
            />

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                            placeholder="Nomi bo'yicha qidirish..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            leftAddon={<Search className="h-4 w-4" />}
                            className="sm:max-w-sm"
                        />
                        <Combobox
                            options={subjectOptions}
                            value={subjectId}
                            onChange={(value) => {
                                setSubjectId(value);
                                setPage(1);
                            }}
                            placeholder="Barcha fanlar"
                            searchPlaceholder="Fanni qidirish..."
                            className="sm:w-64"
                        />
                    </div>
                    <DataTable
                        columns={columns}
                        data={data?.tests}
                        rowKey={(t) => t.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        onRowClick={(t) => navigate(`/elementar-tests/${t.id}`)}
                        emptyIcon={<ClipboardList className="h-6 w-6" />}
                        emptyTitle="Testlar yo'q"
                        emptyDescription="Birinchi elementar testni yarating."
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
                    defaultSubjectId={subjectId ? Number(subjectId) : undefined}
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
