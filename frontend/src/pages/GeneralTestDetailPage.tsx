import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, BookMarked, KeyRound, MessageCircleQuestion, Pencil, Plus, RefreshCw, UsersRound, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { PermissionGate, usePermission } from '@/components/auth/PermissionGate';
import { GeneralTestFormModal } from '@/components/generalTest/GeneralTestFormModal';
import { GroupPickerModal } from '@/components/generalTest/GroupPickerModal';
import { questionsLabel } from '@/components/generalTest/labels';
import {
    useGeneralTest,
    useRemoveGeneralTestGroup,
    useSetGeneralTestGroupActive,
    useUpdateGeneralTest,
} from '@/hooks/useGeneralTests';
import { apiErrorMessage } from '@/utils/apiError';

export default function GeneralTestDetailPage() {
    const navigate = useNavigate();
    const testId = Number(useParams().id);
    const { data: test, isLoading, isError, refetch } = useGeneralTest(Number.isFinite(testId) ? testId : null);
    const canEdit = usePermission('update:general_test');

    const updateTest = useUpdateGeneralTest();
    const removeGroup = useRemoveGeneralTestGroup(testId);
    const setGroupActive = useSetGeneralTestGroupActive(testId);
    // Qaysi guruh tugmasi hozir saqlanyapti — faqat o'sha qator band bo'ladi.
    const [togglingGroupId, setTogglingGroupId] = useState<number | null>(null);

    const [editTest, setEditTest] = useState(false);
    const [pickingGroups, setPickingGroups] = useState(false);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-72" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }
    if (isError || !test) return <ErrorState onRetry={() => refetch()} />;

    const toggleActive = (value: boolean) => {
        if (value && test.question_count === 0) {
            toast.error("Avval fanning savollar bankiga savol qo'shing");
            return;
        }
        updateTest.mutate(
            { id: test.id, data: { is_active: value } },
            {
                onSuccess: () => toast.success(value ? 'Test faollashtirildi' : "Test o'chirib qo'yildi"),
                onError: (e) => toast.error(apiErrorMessage(e, 'Saqlashda xatolik')),
            },
        );
    };

    const changePin = (data: { pin_required?: boolean; regenerate_pin?: boolean }, done: string) =>
        updateTest.mutate(
            { id: test.id, data },
            {
                onSuccess: () => toast.success(done),
                onError: (e) => toast.error(apiErrorMessage(e, 'Saqlashda xatolik')),
            },
        );

    const toggleGroup = (groupId: number, name: string, isActive: boolean) => {
        setTogglingGroupId(groupId);
        setGroupActive.mutate(
            { groupId, isActive },
            {
                onSettled: () => setTogglingGroupId(null),
                onSuccess: () =>
                    toast.success(isActive ? `${name} guruhi uchun test yoqildi` : `${name} guruhidan test yashirildi`),
                onError: (e) => toast.error(apiErrorMessage(e, 'Xatolik yuz berdi')),
            },
        );
    };

    const hiddenGroups = test.groups.filter((g) => !g.is_active).length;

    const unassignGroup = (groupId: number, name: string) =>
        removeGroup.mutate(groupId, {
            onSuccess: () => toast.success(`${name} guruhi testdan olib tashlandi`),
            onError: (e) => toast.error(apiErrorMessage(e, 'Xatolik yuz berdi')),
        });

    return (
        <div className="space-y-6">
            <Link to="/elementar-tests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Elementar testlar
            </Link>

            <PageHeader
                title={test.title}
                actions={
                    <PermissionGate permission="update:general_test">
                        <Button variant="outline" onClick={() => setEditTest(true)}>
                            <Pencil className="h-4 w-4" /> Tahrirlash
                        </Button>
                    </PermissionGate>
                }
            />

            <Link
                to={`/elementar-tests/subjects/${test.subject.id}`}
                className="-mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary hover:bg-primary/15"
            >
                <BookMarked className="h-3.5 w-3.5" /> {test.subject.name}
            </Link>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                    label={questionsLabel(test).includes('/') ? 'Savollar (urinishda / jami)' : 'Savollar'}
                    value={questionsLabel(test)}
                />
                <Stat label="Vaqt" value={`${test.duration} daq.`} />
                <Stat label="Urinishlar" value={test.attempt_limit} />
                <Stat label="Topshirganlar" value={test.attempt_count} />
            </div>

            <Card>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                    <div>
                        <p className="font-medium text-foreground">{test.is_active ? 'Test faol' : 'Test nofaol'}</p>
                        <p className="text-sm text-muted-foreground">
                            {test.is_active
                                ? "Fanga biriktirilgan foydalanuvchilar va quyidagi guruhlar talabalari «Elementar testlar» bo'limida ko'radi va ishlay oladi"
                                : "Hech kimga ko'rinmaydi. Fanning savollar bankini tayyorlab, keyin yoqing"}
                        </p>
                    </div>
                    <Switch checked={test.is_active} onCheckedChange={toggleActive} disabled={!canEdit || updateTest.isPending} />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <KeyRound className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <p className="font-medium text-foreground">
                                {test.pin ? (
                                    <>
                                        PIN: <span className="font-mono text-lg tracking-widest">{test.pin}</span>
                                    </>
                                ) : (
                                    "PIN yo'q"
                                )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {test.pin
                                    ? "Talaba yangi urinishni faqat shu PIN bilan boshlaydi. Boshlangan urinishga PIN'siz qaytadi"
                                    : 'Test PIN so\'ramasdan boshlanadi'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {test.pin && canEdit && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={updateTest.isPending}
                                onClick={() => changePin({ regenerate_pin: true }, 'Yangi PIN yaratildi')}
                            >
                                <RefreshCw className="h-4 w-4" /> Yangi PIN
                            </Button>
                        )}
                        <Switch
                            checked={Boolean(test.pin)}
                            onCheckedChange={(value) =>
                                changePin({ pin_required: value }, value ? 'PIN yoqildi' : "PIN o'chirildi")
                            }
                            disabled={!canEdit || updateTest.isPending}
                            aria-label="PIN bilan boshlash"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-base font-semibold text-foreground">
                                Guruhlar ({test.groups.length})
                                {hiddenGroups > 0 && (
                                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                                        · {hiddenGroups} tasidan yashirilgan
                                    </span>
                                )}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Yoqilgan guruh talabalari testni fanga biriktirilmagan bo'lsa ham ko'radi.
                                O'chirilgan guruh biriktirilgan bo'lib qoladi, lekin testni ko'rmaydi
                            </p>
                        </div>
                        <PermissionGate permission="update:general_test">
                            <Button size="sm" variant="outline" onClick={() => setPickingGroups(true)}>
                                <Plus className="h-4 w-4" /> Guruh biriktirish
                            </Button>
                        </PermissionGate>
                    </div>
                    {test.groups.length === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <UsersRound className="h-4 w-4" /> Guruh biriktirilmagan
                        </p>
                    ) : (
                        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {test.groups.map((g) => {
                                const meta = [g.faculty_name, g.course ? `${g.course}-kurs` : null, `${g.student_count} talaba`]
                                    .filter(Boolean)
                                    .join(' · ');
                                return (
                                    <li
                                        key={g.id}
                                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                                            g.is_active ? 'border-border bg-muted/30' : 'border-dashed border-border bg-transparent'
                                        }`}
                                    >
                                        <div className={`min-w-0 flex-1 ${g.is_active ? '' : 'opacity-60'}`}>
                                            <p className="truncate text-sm font-medium text-foreground">{g.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">{meta}</p>
                                        </div>
                                        <span
                                            className={`shrink-0 text-xs ${
                                                g.is_active
                                                    ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                                    : 'text-muted-foreground'
                                            }`}
                                        >
                                            {g.is_active ? "Ko'rinadi" : 'Yashirin'}
                                        </span>
                                        <Switch
                                            checked={g.is_active}
                                            onCheckedChange={(value) => toggleGroup(g.id, g.name, value)}
                                            disabled={!canEdit || togglingGroupId === g.id}
                                            aria-label={g.is_active ? `${g.name} guruhidan yashirish` : `${g.name} guruhi uchun yoqish`}
                                        />
                                        {canEdit && (
                                            <button
                                                type="button"
                                                aria-label={`${g.name} guruhini olib tashlash`}
                                                title="Guruhni testdan olib tashlash"
                                                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                                disabled={removeGroup.isPending}
                                                onClick={() => unassignGroup(g.id, g.name)}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Savollar</h2>
                            <p className="text-sm text-muted-foreground">
                                {test.question_count === 0
                                    ? "«" + test.subject.name + "» fanining savollar bankida hali savol yo'q"
                                    : test.question_number && test.question_number < test.question_count
                                      ? `Har urinishda «${test.subject.name}» fani bankidagi ${test.question_count} ta savoldan ${test.question_number} tasi tasodifiy beriladi`
                                      : `Har urinishda «${test.subject.name}» fani bankidagi barcha ${test.question_count} ta savol tasodifiy tartibda beriladi`}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/elementar-tests/subjects/${test.subject.id}`)}>
                        Savollar banki <ArrowRight className="h-4 w-4" />
                    </Button>
                </CardContent>
            </Card>

            {editTest && (
                <GeneralTestFormModal
                    editing={test}
                    onClose={() => setEditTest(false)}
                    isPending={updateTest.isPending}
                    onSubmit={(payload) =>
                        updateTest.mutate(
                            { id: test.id, data: payload },
                            {
                                onSuccess: () => {
                                    setEditTest(false);
                                    toast.success('Test saqlandi');
                                },
                                onError: (e) => toast.error(apiErrorMessage(e, 'Saqlashda xatolik')),
                            },
                        )
                    }
                />
            )}

            {pickingGroups && (
                <GroupPickerModal
                    testId={test.id}
                    assignedIds={test.groups.map((g) => g.id)}
                    onClose={() => setPickingGroups(false)}
                />
            )}

        </div>
    );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
        </div>
    );
}
