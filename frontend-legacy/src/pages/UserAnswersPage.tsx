import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useUserAnswers } from '@/hooks/useUserAnswers';
import { Button } from '@/components/ui/Button';
import { Loader2, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/utils/utils';

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

    const { data, isLoading } = useUserAnswers({
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
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-muted-foreground font-mono">{total} ta savol</span>
                        {!isLoading && answers.length > 0 && (
                            <>
                                <span className="text-border select-none">·</span>
                                <span className="text-xs font-semibold text-[hsl(155,43%,30%)] bg-[hsl(155,43%,30%)]/10 px-2 py-0.5 rounded-full">
                                    {correctCount} to'g'ri
                                </span>
                                <span className="text-xs font-semibold text-[hsl(0,65%,42%)] bg-[hsl(0,65%,42%)]/10 px-2 py-0.5 rounded-full">
                                    {answers.length - correctCount} noto'g'ri
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : answers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-muted-foreground">
                    <p className="text-sm">Javoblar topilmadi.</p>
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
                                        ? 'border-[hsl(155,43%,30%)]/25'
                                        : 'border-[hsl(0,65%,42%)]/25'
                                )}
                            >
                                {/* Question header */}
                                <div className={cn(
                                    'flex items-start gap-3 px-5 py-4 border-b',
                                    answer.is_correct
                                        ? 'bg-[hsl(155,43%,30%)]/5 border-[hsl(155,43%,30%)]/15'
                                        : 'bg-[hsl(0,65%,42%)]/5 border-[hsl(0,65%,42%)]/15'
                                )}>
                                    {/* Number badge */}
                                    <span className="font-mono text-xs font-bold text-muted-foreground bg-muted rounded-md px-2 py-1 shrink-0 mt-0.5">
                                        #{questionNumber}
                                    </span>
                                    <p className="flex-1 text-sm font-medium text-foreground leading-relaxed">
                                        {question ? stripHtml(question.text) : `Savol #${answer.question_id}`}
                                    </p>
                                    {answer.is_correct ? (
                                        <CheckCircle2 className="h-4.5 w-4.5 text-[hsl(155,43%,30%)] shrink-0 mt-0.5" />
                                    ) : (
                                        <XCircle className="h-4.5 w-4.5 text-[hsl(0,65%,42%)] shrink-0 mt-0.5" />
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
                                                    style = 'border-[hsl(155,43%,30%)]/40 bg-[hsl(155,43%,30%)]/8 text-[hsl(155,43%,30%)] font-semibold';
                                                } else if (isSelected && !answer.is_correct) {
                                                    style = 'border-[hsl(0,65%,42%)]/40 bg-[hsl(0,65%,42%)]/8 text-[hsl(0,65%,42%)] font-medium';
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
                                                <span className="font-semibold text-[hsl(155,43%,30%)]">To'g'ri</span>
                                            ) : (
                                                <span className="font-semibold text-[hsl(0,65%,42%)]">Noto'g'ri</span>
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
