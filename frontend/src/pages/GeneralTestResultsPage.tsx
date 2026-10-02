import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChartColumnBig, Download, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    useDeleteGeneralTestResult,
    useGeneralTestResults,
    useGeneralTests,
    useGeneralTestSubjects,
} from '@/hooks/useGeneralTests';
import { generalTestService, type ResultRow } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';
import { cn } from '@/lib/utils';
import { KIND_LABEL } from '@/components/generalTest/labels';
import { scoreClass } from '@/components/generalTest/score';
import { formatDateTime } from '@/utils/date';

export default function GeneralTestResultsPage() {
    const [subjectId, setSubjectId] = useState('');
    const [testId, setTestId] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const debounced = useDebouncedValue(search);
    const [deleting, setDeleting] = useState<ResultRow | null>(null);
    const [exporting, setExporting] = useState(false);

    const { data: subjects } = useGeneralTestSubjects(1, 500);
    // Fan tanlanganda test ro'yxati o'sha fan testlari bilan cheklanadi.
    const { data: tests } = useGeneralTests(1, 200, '', subjectId ? Number(subjectId) : undefined);
    const filter = {
        subject_id: subjectId ? Number(subjectId) : undefined,
        test_id: testId ? Number(testId) : undefined,
        search: debounced || undefined,
        page,
        limit: pageSize,
    };
    const { data, isLoading, isError, refetch } = useGeneralTestResults(filter);
    const deleteResult = useDeleteGeneralTestResult();

    const subjectOptions = useMemo(
        () => (subjects?.subjects ?? []).map((s) => ({ value: String(s.id), label: s.name })),
        [subjects],
    );
    const testOptions = useMemo(
        () => [
            { value: '', label: 'Barcha testlar' },
            // Nom fan va guruhlardan tuziladi, ya'ni ikki test bir xil nomli
            // bo'lishi mumkin — yaratilgan sanasi ularni ajratadi.
            ...(tests?.tests ?? []).map((t) => ({ value: String(t.id), label: t.title, hint: formatDateTime(t.created_at) })),
        ],
        [tests],
    );

    const handleExport = async () => {
        setExporting(true);
        try {
            await generalTestService.exportResults(filter);
        } catch (e) {
            toast.error(apiErrorMessage(e, 'Eksportda xatolik'));
        } finally {
            setExporting(false);
        }
    };

    const columns: DataTableColumn<ResultRow>[] = [
        {
            key: 'name',
            header: 'F.I.SH',
            cell: (r) => (
                <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                        {KIND_LABEL[r.user_kind]}
                        {r.group_name ? ` · ${r.group_name}` : ''}
                    </p>
                </div>
            ),
        },
        {
            key: 'test',
            header: 'Test',
            cell: (r) => (
                <div className="min-w-0">
                    <p className="text-foreground">{r.test_title}</p>
                    <p className="text-xs text-muted-foreground">{r.subject_name}</p>
                </div>
            ),
            hideBelow: 'md',
        },
        { key: 'correct', header: "To'g'ri", cell: (r) => `${r.correct_answers} / ${r.total_questions}`, hideBelow: 'sm' },
        {
            key: 'score',
            header: 'Natija',
            cell: (r) => (
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', scoreClass(r.score))}>{r.score}%</span>
            ),
        },
        { key: 'date', header: 'Sana', cell: (r) => formatDateTime(r.finished_at), hideBelow: 'lg' },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-12',
            cell: (r) => (
                <PermissionGate permission="delete:general_test_result">
                    <Button variant="ghost" size="icon" aria-label="O'chirish" onClick={() => setDeleting(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </PermissionGate>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Elementar test natijalari"
                description="Oddiy test natijalaridan alohida"
                actions={
                    <Button variant="outline" onClick={handleExport} isLoading={exporting}>
                        <Download className="h-4 w-4" /> Excel
                    </Button>
                }
            />

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Combobox
                            options={subjectOptions}
                            value={subjectId}
                            onChange={(v) => {
                                setSubjectId(v);
                                setTestId('');
                                setPage(1);
                            }}
                            placeholder="Barcha fanlar"
                            searchPlaceholder="Fanni qidirish..."
                            className="sm:w-60"
                        />
                        <Combobox
                            options={testOptions}
                            value={testId}
                            onChange={(v) => {
                                setTestId(v);
                                setPage(1);
                            }}
                            placeholder="Barcha testlar"
                            className="sm:w-72"
                        />
                        <Input
                            placeholder="F.I.SH, login yoki guruh..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            leftAddon={<Search className="h-4 w-4" />}
                            className="sm:max-w-sm"
                        />
                    </div>
                    <DataTable
                        columns={columns}
                        data={data?.results}
                        rowKey={(r) => r.attempt_id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        emptyIcon={<ChartColumnBig className="h-6 w-6" />}
                        emptyTitle="Natijalar yo'q"
                        emptyDescription="Hali hech kim testni yakunlamagan."
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

            <ConfirmDialog
                isOpen={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    deleteResult.mutate(deleting.attempt_id, {
                        onSuccess: () => {
                            setDeleting(null);
                            toast.success("Natija o'chirildi");
                        },
                        onError: (e) => {
                            setDeleting(null);
                            toast.error(apiErrorMessage(e, "O'chirishda xatolik"));
                        },
                    })
                }
                title="Natijani o'chirish"
                description={`${deleting?.full_name ?? ''} — «${deleting?.test_title ?? ''}». Natija o'chiriladi va foydalanuvchiga bitta urinish qaytadi.`}
                confirmText="O'chirish"
                isLoading={deleteResult.isPending}
            />
        </div>
    );
}
