import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, FileSpreadsheet, MessageCircleQuestion, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { PermissionGate, usePermission } from '@/components/auth/PermissionGate';
import { GeneralTestFormModal } from '@/components/generalTest/GeneralTestFormModal';
import { QuestionFormModal } from '@/components/generalTest/QuestionFormModal';
import {
    useDeleteGeneralTestQuestion,
    useGeneralTest,
    useSaveGeneralTestQuestion,
    useUpdateGeneralTest,
    useUploadGeneralTestExcel,
} from '@/hooks/useGeneralTests';
import { generalTestService, type GeneralTestQuestion, type OptionLetter } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';
import { cn } from '@/lib/utils';

const LETTERS: OptionLetter[] = ['a', 'b', 'c', 'd'];

export default function GeneralTestDetailPage() {
    const testId = Number(useParams().id);
    const { data: test, isLoading, isError, refetch } = useGeneralTest(Number.isFinite(testId) ? testId : null);
    const canEdit = usePermission('update:general_test');

    const updateTest = useUpdateGeneralTest();
    const saveQuestion = useSaveGeneralTestQuestion(testId);
    const deleteQuestion = useDeleteGeneralTestQuestion(testId);
    const upload = useUploadGeneralTestExcel(testId);

    const [editTest, setEditTest] = useState(false);
    const [questionForm, setQuestionForm] = useState<{ open: boolean; editing: GeneralTestQuestion | null }>({
        open: false,
        editing: null,
    });
    const [deleting, setDeleting] = useState<GeneralTestQuestion | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);

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
        if (value && test.questions.length === 0) {
            toast.error("Avval savollarni qo'shing");
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

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        upload.mutate(file, {
            onSuccess: (res) => {
                setWarnings(res.warnings);
                toast.success(`${res.created} ta savol qo'shildi`);
            },
            onError: (err) => toast.error(apiErrorMessage(err, 'Faylni yuklashda xatolik')),
        });
    };

    return (
        <div className="space-y-6">
            <Link to="/general-tests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Umumiy testlar
            </Link>

            <PageHeader
                title={test.title}
                description={test.description ?? undefined}
                actions={
                    <PermissionGate permission="update:general_test">
                        <Button variant="outline" onClick={() => setEditTest(true)}>
                            <Pencil className="h-4 w-4" /> Tahrirlash
                        </Button>
                    </PermissionGate>
                }
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Savollar" value={test.question_count} />
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
                                ? "Barcha foydalanuvchilar «Umumiy testlar» bo'limida ko'radi va ishlay oladi"
                                : "Foydalanuvchilarga ko'rinmaydi. Savollarni tayyorlab, keyin yoqing"}
                        </p>
                    </div>
                    <Switch checked={test.is_active} onCheckedChange={toggleActive} disabled={!canEdit || updateTest.isPending} />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-base font-semibold text-foreground">Savollar ({test.questions.length})</h2>
                        <PermissionGate permission="update:general_test">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="ghost" size="sm" onClick={() => generalTestService.downloadTemplate()}>
                                    <Download className="h-4 w-4" /> Shablon
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} isLoading={upload.isPending}>
                                    <FileSpreadsheet className="h-4 w-4" /> Excel'dan yuklash
                                </Button>
                                <Button size="sm" onClick={() => setQuestionForm({ open: true, editing: null })}>
                                    <Plus className="h-4 w-4" /> Savol qo'shish
                                </Button>
                                <input ref={fileInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
                            </div>
                        </PermissionGate>
                    </div>

                    {warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="font-medium">Yuklashda ogohlantirishlar</p>
                                <button className="text-xs underline" onClick={() => setWarnings([])}>
                                    Yopish
                                </button>
                            </div>
                            <ul className="list-disc space-y-0.5 pl-5">
                                {warnings.map((w) => (
                                    <li key={w}>{w}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {test.questions.length === 0 ? (
                        <EmptyState
                            icon={<MessageCircleQuestion className="h-6 w-6" />}
                            title="Savollar yo'q"
                            description="Savollarni qo'lda qo'shing yoki Excel fayldan yuklang (Savol, A, B, C, D, To'g'ri javob)."
                        />
                    ) : (
                        <ol className="space-y-3">
                            {test.questions.map((q, index) => (
                                <li key={q.id} className="rounded-xl border border-border p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="whitespace-pre-wrap font-medium text-foreground">
                                            {index + 1}. {q.text}
                                        </p>
                                        <PermissionGate permission="update:general_test">
                                            <div className="flex shrink-0 gap-1">
                                                <Button variant="ghost" size="icon" aria-label="Tahrirlash" onClick={() => setQuestionForm({ open: true, editing: q })}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" aria-label="O'chirish" onClick={() => setDeleting(q)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </PermissionGate>
                                    </div>
                                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                        {LETTERS.map((letter) => {
                                            const isCorrect = q.correct_option === letter;
                                            return (
                                                <div
                                                    key={letter}
                                                    className={cn(
                                                        'flex gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                                                        isCorrect
                                                            ? 'bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300'
                                                            : 'text-muted-foreground',
                                                    )}
                                                >
                                                    <span className="uppercase">{letter})</span>
                                                    <span className="whitespace-pre-wrap">{q[`option_${letter}`]}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
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

            {questionForm.open && (
                <QuestionFormModal
                    editing={questionForm.editing}
                    onClose={() => setQuestionForm({ open: false, editing: null })}
                    isPending={saveQuestion.isPending}
                    onSubmit={(payload) =>
                        saveQuestion.mutate(
                            { id: questionForm.editing?.id, data: payload },
                            {
                                onSuccess: () => {
                                    setQuestionForm({ open: false, editing: null });
                                    toast.success('Savol saqlandi');
                                },
                                onError: (e) => toast.error(apiErrorMessage(e, 'Savolni saqlashda xatolik')),
                            },
                        )
                    }
                />
            )}

            <ConfirmDialog
                isOpen={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    deleteQuestion.mutate(deleting.id, {
                        onSuccess: () => {
                            setDeleting(null);
                            toast.success("Savol o'chirildi");
                        },
                        onError: (e) => {
                            setDeleting(null);
                            toast.error(apiErrorMessage(e, "Savolni o'chirishda xatolik"));
                        },
                    })
                }
                title="Savolni o'chirish"
                description="Savol testdan o'chiriladi. Unga berilgan javoblar ham o'chadi."
                confirmText="O'chirish"
                isLoading={deleteQuestion.isPending}
            />
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
