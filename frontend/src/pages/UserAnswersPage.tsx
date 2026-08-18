import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useUserAnswers } from '@/hooks/useUserAnswers';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

const OPTION_LABELS = { a: 'A', b: 'B', c: 'C', d: 'D' } as const;

const stripHtml = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
};

const UserAnswersPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const userId = searchParams.get('user_id') ? Number(searchParams.get('user_id')) : undefined;
    const quizId = searchParams.get('quiz_id') ? Number(searchParams.get('quiz_id')) : undefined;
    const resultId = searchParams.get('result_id') ? Number(searchParams.get('result_id')) : undefined;

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    const { data, isLoading, isError, refetch } = useUserAnswers({
        page: currentPage,
        limit: pageSize,
        user_id: userId,
        quiz_id: quizId,
        result_id: resultId,
    });

    const answers = data?.answers || [];
    const totalPages = data ? Math.ceil(data.total / pageSize) : 1;
    const correctCount = answers.filter(a => a.is_correct).length;
    const total = data?.total || 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2 shrink-0">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Orqaga
                </Button>
                <div className="flex-1">
                    <h1 className="page-title">Javoblar tafsiloti</h1>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-sm text-muted-foreground font-mono">{total} ta savol</span>
                        {!isLoading && answers.length > 0 && (
                            <>
                                <span className="text-border select-none">·</span>
                                <span className="badge badge-success font-semibold">
                                    {correctCount} to'g'ri
                                </span>
                                <span className="badge badge-destructive font-semibold">
                                    {answers.length - correctCount} noto'g'ri
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }, (_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                </div>
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : answers.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card">
                    <EmptyState
                        title="Javoblar topilmadi"
                        description="Ushbu natija uchun javoblar mavjud emas."
                    />
                </div>
            ) : (
                <div className="space-y-3">
                    {answers.map((answer, index) => {
                        const question = answer.question;
                        const questionNumber = (currentPage - 1) * pageSize + index + 1;

                        return (
                            <div
                                key={answer.id}
                                className={cn(
                                    'rounded-2xl border bg-card overflow-hidden',
                                    answer.is_correct
                                        ? 'border-success/25'
                                        : 'border-destructive/25'
                                )}
                            >
                                {/* Question header */}
                                <div className={cn(
                                    'flex items-start gap-3 px-5 py-4 border-b',
                                    answer.is_correct
                                        ? 'bg-success/5 border-success/15'
                                        : 'bg-destructive/5 border-destructive/15'
                                )}>
                                    {/* Number badge */}
                                    <span className="font-mono text-xs font-bold text-muted-foreground bg-muted rounded-md px-2 py-1 shrink-0 mt-0.5">
                                        #{questionNumber}
                                    </span>
                                    <p className="flex-1 text-sm font-medium text-foreground leading-relaxed">
                                        {question ? stripHtml(question.text) : `Savol #${answer.question_id}`}
                                    </p>
                                    {answer.is_correct ? (
                                        <CheckCircle2 className="h-4.5 w-4.5 text-success shrink-0 mt-0.5" />
                                    ) : (
                                        <XCircle className="h-4.5 w-4.5 text-destructive shrink-0 mt-0.5" />
                                    )}
                                </div>

                                {/* Options */}
                                {question && (
                                    <div className="px-5 py-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {(['a', 'b', 'c', 'd'] as const).map(opt => {
                                                const optionKey = `option_${opt}` as keyof typeof question;
                                                const optionText = question[optionKey] as string;
                                                const isSelected = answer.answer === optionText || answer.answer?.toLowerCase() === opt;
                                                const isCorrectOption = answer.correct_answer === optionText ||
                                                    (answer.is_correct && isSelected);

                                                let style = 'border-border bg-muted/40 text-muted-foreground';
                                                if (isCorrectOption) {
                                                    style = 'border-success/40 bg-success/10 text-success font-semibold';
                                                } else if (isSelected && !answer.is_correct) {
                                                    style = 'border-destructive/40 bg-destructive/10 text-destructive font-medium';
                                                }

                                                return (
                                                    <div
                                                        key={opt}
                                                        className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors', style)}
                                                    >
                                                        <span className="font-mono font-bold text-xs mt-0.5 shrink-0 opacity-70">
                                                            {OPTION_LABELS[opt]})
                                                        </span>
                                                        <span className="leading-snug">{optionText}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Result summary */}
                                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                            <span>Tanlangan javob:</span>
                                            <span className="font-mono font-semibold text-foreground">
                                                {answer.answer
                                                    ? (['a', 'b', 'c', 'd'].includes(answer.answer.toLowerCase())
                                                        ? OPTION_LABELS[answer.answer.toLowerCase() as keyof typeof OPTION_LABELS]
                                                        : answer.answer)
                                                    : '—'
                                                }
                                            </span>
                                            <span className="text-border">·</span>
                                            {answer.is_correct ? (
                                                <span className="font-semibold text-success">To'g'ri</span>
                                            ) : (
                                                <span className="font-semibold text-destructive">Noto'g'ri</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isLoading}
            />
        </div>
    );
};

export default UserAnswersPage;
