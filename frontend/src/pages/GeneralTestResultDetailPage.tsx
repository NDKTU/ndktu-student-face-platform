import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { CheatingEvidence } from '@/components/results/CheatingEvidence';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { KIND_LABEL } from '@/components/generalTest/labels';
import { scoreClass } from '@/components/generalTest/score';
import { useGeneralTestResult } from '@/hooks/useGeneralTests';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/date';
import { sanitizeHtml } from '@/utils/sanitize';

/** Savol va variantlar HTML (jodit), rasmlar shu HTML ichida. */
const RICH_TEXT = '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_p]:m-0 [&_p+p]:mt-1 break-words';

/** Elementar test urinishining savol-javoblari — natijalar ro'yxatidan ochiladi. */
export default function GeneralTestResultDetailPage() {
    const { attemptId } = useParams();
    const navigate = useNavigate();
    const { data, isLoading, isError, refetch } = useGeneralTestResult(Number(attemptId) || 0);

    const result = data?.result;
    const questions = data?.questions ?? [];

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2 shrink-0">
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Orqaga
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="page-title">{result?.full_name ?? 'Javoblar tafsiloti'}</h1>
                    {result && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span>
                                {KIND_LABEL[result.user_kind]}
                                {result.group_name ? ` · ${result.group_name}` : ''}
                            </span>
                            <span className="select-none text-border">·</span>
                            <span>{result.test_title}</span>
                            {result.finished_at && (
                                <>
                                    <span className="select-none text-border">·</span>
                                    <span>{formatDateTime(result.finished_at)}</span>
                                </>
                            )}
                            <span className="select-none text-border">·</span>
                            <span className="font-medium text-foreground">
                                {result.correct_answers} / {result.total_questions} to'g'ri
                            </span>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', scoreClass(result.score))}>
                                {result.score}%
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Qoidabuzarlik dalili — javoblardan oldin: baho shundan qayta ko'rilishi mumkin. */}
            {result && (
                <CheatingEvidence
                    result={{
                        cheating_detected: Boolean(result.stop_reason),
                        cheating_image_url: result.cheating_image_url,
                        reason_for_stop: result.stop_reason,
                    }}
                    variant="block"
                />
            )}

            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }, (_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                </div>
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : questions.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card">
                    <EmptyState title="Javoblar topilmadi" description="Ushbu natija uchun savollar mavjud emas." />
                </div>
            ) : (
                <div className="space-y-3">
                    {questions.map((q, index) => (
                        <div
                            key={q.id}
                            className={cn(
                                'overflow-hidden rounded-2xl border bg-card',
                                q.is_correct ? 'border-success/25' : 'border-destructive/25',
                            )}
                        >
                            <div
                                className={cn(
                                    'flex items-start gap-3 border-b px-5 py-4',
                                    q.is_correct ? 'border-success/15 bg-success/5' : 'border-destructive/15 bg-destructive/5',
                                )}
                            >
                                <span className="mt-0.5 shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs font-bold text-muted-foreground">
                                    #{index + 1}
                                </span>
                                <div
                                    className={cn('min-w-0 flex-1 text-sm font-medium leading-relaxed text-foreground', RICH_TEXT)}
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.text) }}
                                />
                                {q.is_correct ? (
                                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" />
                                ) : (
                                    <XCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-destructive" />
                                )}
                            </div>

                            <div className="px-5 py-4">
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                    {q.options.map((opt) => {
                                        const isCorrect = opt.key === q.correct_option;
                                        const isWrongPick = opt.key === q.selected && !isCorrect;
                                        return (
                                            <div
                                                key={opt.key}
                                                className={cn(
                                                    'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm',
                                                    isCorrect
                                                        ? 'border-success/40 bg-success/10 font-semibold text-success'
                                                        : isWrongPick
                                                          ? 'border-destructive/40 bg-destructive/10 font-medium text-destructive'
                                                          : 'border-border bg-muted/40 text-muted-foreground',
                                                )}
                                            >
                                                <span className="mt-0.5 shrink-0 font-mono text-xs font-bold opacity-70">
                                                    {opt.key.toUpperCase()})
                                                </span>
                                                <span
                                                    className={cn('min-w-0 flex-1 leading-snug', RICH_TEXT)}
                                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text) }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>Tanlangan javob:</span>
                                    <span className="font-mono font-semibold text-foreground">
                                        {q.selected ? q.selected.toUpperCase() : '—'}
                                    </span>
                                    <span className="text-border">·</span>
                                    {q.selected === null ? (
                                        <span className="font-semibold text-muted-foreground">Javob berilmagan</span>
                                    ) : q.is_correct ? (
                                        <span className="font-semibold text-success">To'g'ri</span>
                                    ) : (
                                        <span className="font-semibold text-destructive">Noto'g'ri</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
