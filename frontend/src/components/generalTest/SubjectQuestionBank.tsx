import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, MessageCircleQuestion, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useDeleteSubjectQuestion, useSubjectQuestions, useUploadSubjectExcel } from '@/hooks/useGeneralTests';
import { RichText } from '@/components/questions/RichText';
import { generalTestService, type GeneralTestQuestion, type OptionLetter } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';
import { cn } from '@/lib/utils';

const LETTERS: OptionLetter[] = ['a', 'b', 'c', 'd'];

/**
 * Fanning savollar banki: qo'lda qo'shish, Excel'dan yuklash, tahrirlash.
 * Fanning har bir testi shu bankdan tasodifiy savol oladi.
 *
 * `canManage=false` — fanga biriktirilgan foydalanuvchi: savol qo'sha oladi,
 * lekin tahrirlay va o'chira olmaydi.
 */
export function SubjectQuestionBank({ subjectId, canManage }: { subjectId: number; canManage: boolean }) {
    const { data: questions, isLoading, isError, refetch } = useSubjectQuestions(subjectId);
    const navigate = useNavigate();
    const deleteQuestion = useDeleteSubjectQuestion(subjectId);
    const upload = useUploadSubjectExcel(subjectId);

    const [deleting, setDeleting] = useState<GeneralTestQuestion | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);

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
        <Card>
            <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Savollar banki ({questions?.length ?? 0})</h2>
                        <p className="text-sm text-muted-foreground">
                            Fanning har bir testi shu savollardan tasodifiy oladi (nechtasi — testning «Savollar soni»)
                        </p>
                    </div>
                    <PermissionGate permission="update:general_test_subject">
                        <div className="flex flex-wrap gap-2">
                            <Button variant="ghost" size="sm" onClick={() => generalTestService.downloadTemplate()}>
                                <Download className="h-4 w-4" /> Shablon
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} isLoading={upload.isPending}>
                                <FileSpreadsheet className="h-4 w-4" /> Excel'dan yuklash
                            </Button>
                            <Button size="sm" onClick={() => navigate(`/elementar-tests/subjects/${subjectId}/questions/new`)}>
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

                {isLoading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 3 }, (_, i) => (
                            <Skeleton key={i} className="h-24 w-full rounded-xl" />
                        ))}
                    </div>
                ) : isError ? (
                    <ErrorState onRetry={() => refetch()} />
                ) : !questions?.length ? (
                    <EmptyState
                        icon={<MessageCircleQuestion className="h-6 w-6" />}
                        title="Savollar yo'q"
                        description="Savollarni qo'lda qo'shing yoki Excel fayldan yuklang (Savol, A, B, C, D, To'g'ri javob)."
                    />
                ) : (
                    <ol className="space-y-3">
                        {questions.map((q, index) => (
                            <li key={q.id} className="rounded-xl border border-border p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 gap-1.5 font-medium text-foreground">
                                        <span className="shrink-0">{index + 1}.</span>
                                        <RichText value={q.text} className="min-w-0 flex-1" />
                                    </div>
                                    {canManage && (
                                        <PermissionGate permission="update:general_test_subject">
                                            <div className="flex shrink-0 gap-1">
                                                <Button variant="ghost" size="icon" aria-label="Tahrirlash" onClick={() => navigate(`/elementar-tests/subjects/${subjectId}/questions/${q.id}/edit`)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" aria-label="O'chirish" onClick={() => setDeleting(q)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </PermissionGate>
                                    )}
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
                                                <RichText value={q[`option_${letter}`]} className="min-w-0 flex-1" />
                                            </div>
                                        );
                                    })}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </CardContent>

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
                description="Savol fan bankidan o'chiriladi va fanning hech bir testida chiqmaydi. Unga berilgan javoblar ham o'chadi."
                confirmText="O'chirish"
                isLoading={deleteQuestion.isPending}
            />
        </Card>
    );
}
