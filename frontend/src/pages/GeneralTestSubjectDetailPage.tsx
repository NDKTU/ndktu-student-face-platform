import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, Pencil, Plus, Search, UserMinus, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabBar } from '@/components/ui/TabBar';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { GeneralTestFormModal } from '@/components/generalTest/GeneralTestFormModal';
import { SubjectFormModal } from '@/components/generalTest/SubjectFormModal';
import { SubjectQuestionBank } from '@/components/generalTest/SubjectQuestionBank';
import { SubjectUserPickerModal } from '@/components/generalTest/SubjectUserPickerModal';
import { ACTIVE_BADGE, INACTIVE_BADGE, KIND_LABEL, questionsLabel, selectClassName } from '@/components/generalTest/labels';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    useCreateGeneralTest,
    useGeneralTests,
    useGeneralTestSubject,
    useRemoveSubjectUser,
    useSaveGeneralTestSubject,
    useSubjectUsers,
} from '@/hooks/useGeneralTests';
import type { SubjectUser, UserKindFilter } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';

export default function GeneralTestSubjectDetailPage() {
    const navigate = useNavigate();
    const subjectId = Number(useParams().id);
    const { data: subject, isLoading, isError, refetch } = useGeneralTestSubject(Number.isFinite(subjectId) ? subjectId : null);

    const [search, setSearch] = useState('');
    const [kind, setKind] = useState<UserKindFilter | ''>('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const debounced = useDebouncedValue(search);
    // Biriktirilgan (ega bo'lmagan) foydalanuvchi faqat bankka savol qo'shadi:
    // testlar va biriktirishlar unga ochilmaydi, so'rov ham yuborilmaydi.
    const canManage = subject?.can_manage ?? false;
    const users = useSubjectUsers(
        subjectId,
        {
            search: debounced || undefined,
            kind: kind || undefined,
            page,
            limit: pageSize,
        },
        canManage,
    );
    const { data: tests } = useGeneralTests(1, 200, '', subjectId, canManage);

    const saveSubject = useSaveGeneralTestSubject();
    const removeUser = useRemoveSubjectUser(subjectId);
    const createTest = useCreateGeneralTest();

    const [tab, setTab] = useState<'questions' | 'tests' | 'users'>('questions');
    const [editing, setEditing] = useState(false);
    const [picking, setPicking] = useState(false);
    const [creatingTest, setCreatingTest] = useState(false);
    const [removing, setRemoving] = useState<SubjectUser | null>(null);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-72" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }
    if (isError || !subject) return <ErrorState onRetry={() => refetch()} />;

    const userColumns: DataTableColumn<SubjectUser>[] = [
        {
            key: 'name',
            header: 'F.I.SH',
            cell: (u) => (
                <div className="min-w-0">
                    <p className="font-medium text-foreground">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                        {KIND_LABEL[u.user_kind]}
                        {u.group_name ? ` · ${u.group_name}` : ''}
                    </p>
                </div>
            ),
        },
        { key: 'login', header: 'Login', cell: (u) => u.username ?? '—', hideBelow: 'sm' },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-14',
            cell: (u) => (
                <PermissionGate permission="update:general_test_subject">
                    <div className="flex justify-end">
                        <Button variant="ghost" size="icon" aria-label="Fandan chiqarish" onClick={() => setRemoving(u)}>
                            <UserMinus className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                </PermissionGate>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <Link
                to="/elementar-tests/subjects"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" /> Elementar fanlar
            </Link>

            <PageHeader
                title={subject.name}
                description={subject.description ?? undefined}
                actions={
                    canManage && (
                        <PermissionGate permission="update:general_test_subject">
                            <Button variant="outline" onClick={() => setEditing(true)}>
                                <Pencil className="h-4 w-4" /> Tahrirlash
                            </Button>
                        </PermissionGate>
                    )
                }
            />

            {canManage && (
                <TabBar
                    tabs={[
                        { id: 'questions', label: `Savollar banki (${subject.question_count})` },
                        { id: 'tests', label: `Testlar (${subject.test_count})` },
                        { id: 'users', label: `Foydalanuvchilar (${subject.user_count})` },
                    ]}
                    active={tab}
                    onChange={setTab}
                />
            )}

            {(tab === 'questions' || !canManage) && (
                <PermissionGate permission="read:general_test_question">
                    <SubjectQuestionBank subjectId={subject.id} canManage={canManage} />
                </PermissionGate>
            )}

            {canManage && tab === 'users' && (
                <Card>
                    <CardContent className="space-y-4 pt-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">
                                    Biriktirilgan foydalanuvchilar ({subject.user_count})
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Fanning faol testlarini ko'radi. O'qituvchi bo'lishi shart emas — talaba yoki xodim ham bo'ladi
                                </p>
                            </div>
                            <PermissionGate permission="update:general_test_subject">
                                <Button size="sm" onClick={() => setPicking(true)}>
                                    <UserPlus className="h-4 w-4" /> Foydalanuvchi biriktirish
                                </Button>
                            </PermissionGate>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
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
                            <select
                                aria-label="Foydalanuvchi turi"
                                className={`${selectClassName} sm:w-48`}
                                value={kind}
                                onChange={(e) => {
                                    setKind(e.target.value as UserKindFilter | '');
                                    setPage(1);
                                }}
                            >
                                <option value="">Barcha turlar</option>
                                <option value="student">Talabalar</option>
                                <option value="teacher">O'qituvchilar</option>
                                <option value="other">Boshqa xodimlar</option>
                            </select>
                        </div>
                        <DataTable
                            columns={userColumns}
                            data={users.data?.users}
                            rowKey={(u) => u.user_id}
                            isLoading={users.isLoading}
                            isError={users.isError}
                            onRetry={() => users.refetch()}
                            emptyIcon={<Users className="h-6 w-6" />}
                            emptyTitle="Hech kim biriktirilmagan"
                            emptyDescription="Biriktirilmagan fan testlari faqat testga biriktirilgan guruhlarga ko'rinadi."
                        />
                        {users.data && users.data.total > 0 && (
                            <Pagination
                                currentPage={page}
                                totalPages={Math.ceil(users.data.total / pageSize)}
                                onPageChange={setPage}
                                totalItems={users.data.total}
                                pageSize={pageSize}
                                onPageSizeChange={setPageSize}
                            />
                        )}
                    </CardContent>
                </Card>
            )}

            {canManage && tab === 'tests' && (
                <Card>
                    <CardContent className="space-y-4 pt-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-base font-semibold text-foreground">Testlar ({subject.test_count})</h2>
                            <PermissionGate permission="create:general_test">
                                <Button size="sm" variant="outline" onClick={() => setCreatingTest(true)}>
                                    <Plus className="h-4 w-4" /> Yangi test
                                </Button>
                            </PermissionGate>
                        </div>
                        {!tests?.tests.length ? (
                            <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Testlar yo'q" description="Bu fanga hali test qo'shilmagan." />
                        ) : (
                            <ul className="divide-y divide-border rounded-xl border border-border">
                                {tests.tests.map((t) => (
                                    <li key={t.id}>
                                        <Link
                                            to={`/elementar-tests/${t.id}`}
                                            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium text-foreground">{t.title}</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {questionsLabel(t)} savol · {t.group_count} guruh · {t.attempt_count} topshirgan
                                                </span>
                                            </span>
                                            <span className={t.is_active ? ACTIVE_BADGE : INACTIVE_BADGE}>{t.is_active ? 'Faol' : 'Nofaol'}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            )}

            {editing && (
                <SubjectFormModal
                    editing={subject}
                    onClose={() => setEditing(false)}
                    isPending={saveSubject.isPending}
                    onSubmit={(payload) =>
                        saveSubject.mutate(
                            { id: subject.id, data: payload },
                            {
                                onSuccess: () => {
                                    setEditing(false);
                                    toast.success('Fan saqlandi');
                                },
                                onError: (e) => toast.error(apiErrorMessage(e, 'Fanni saqlashda xatolik')),
                            },
                        )
                    }
                />
            )}

            {picking && <SubjectUserPickerModal subjectId={subject.id} subjectName={subject.name} onClose={() => setPicking(false)} />}

            {creatingTest && (
                <GeneralTestFormModal
                    editing={null}
                    defaultSubjectId={subject.id}
                    onClose={() => setCreatingTest(false)}
                    isPending={createTest.isPending}
                    onSubmit={(payload) =>
                        createTest.mutate(payload, {
                            onSuccess: (created) => {
                                setCreatingTest(false);
                                toast.success("Test yaratildi. Endi savollarni qo'shing");
                                navigate(`/elementar-tests/${created.id}`);
                            },
                            onError: (e) => toast.error(apiErrorMessage(e, 'Testni yaratishda xatolik')),
                        })
                    }
                />
            )}

            <ConfirmDialog
                isOpen={removing !== null}
                onClose={() => setRemoving(null)}
                onConfirm={() =>
                    removing &&
                    removeUser.mutate(removing.user_id, {
                        onSuccess: () => {
                            setRemoving(null);
                            toast.success('Foydalanuvchi fandan chiqarildi');
                        },
                        onError: (e) => {
                            setRemoving(null);
                            toast.error(apiErrorMessage(e, 'Xatolik yuz berdi'));
                        },
                    })
                }
                title="Fandan chiqarish"
                description={`${removing?.full_name ?? ''} endi bu fanning testlarini ko'rmaydi (testga biriktirilgan guruhida o'qisa, o'sha testni ko'radi). Natijalari saqlanadi.`}
                confirmText="Chiqarish"
                isLoading={removeUser.isPending}
            />
        </div>
    );
}
