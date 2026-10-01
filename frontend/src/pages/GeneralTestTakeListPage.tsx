import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardCheck, Clock, ListOrdered, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { scoreClass } from '@/components/generalTest/score';
import { useAvailableGeneralTests, useMyGeneralTestResults } from '@/hooks/useGeneralTests';
import { generalTestService, type AvailableTest } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/date';

export default function GeneralTestTakeListPage() {
    const navigate = useNavigate();
    const { data: tests, isLoading, isError, refetch } = useAvailableGeneralTests();
    const { data: results } = useMyGeneralTestResults();
    const [startingId, setStartingId] = useState<number | null>(null);

    const start = async (test: AvailableTest) => {
        setStartingId(test.id);
        try {
            const state = await generalTestService.start(test.id);
            navigate(`/general-tests/attempt/${state.attempt_id}`);
        } catch (e) {
            toast.error(apiErrorMessage(e, 'Testni boshlab bo\'lmadi'));
            refetch();
        } finally {
            setStartingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Umumiy testlar" description="Barcha foydalanuvchilar uchun ochiq testlar" />

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                    ))}
                </div>
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : !tests?.length ? (
                <Card>
                    <EmptyState
                        icon={<ClipboardCheck className="h-6 w-6" />}
                        title="Hozircha testlar yo'q"
                        description="Faol umumiy test paydo bo'lganda shu yerda ko'rinadi."
                    />
                </Card>
            ) : (
                <div className="space-y-2">
                    {tests.map((test) => {
                        const left = test.attempt_limit - test.attempts_used;
                        const resumable = test.in_progress_attempt_id !== null;
                        const canStart = resumable || (left > 0 && test.question_count > 0);
                        return (
                            <div
                                key={test.id}
                                className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-foreground">{test.title}</p>
                                    {test.description && <p className="text-sm text-muted-foreground">{test.description}</p>}
                                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <ListOrdered className="h-3.5 w-3.5" /> {test.question_count} savol
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="h-3.5 w-3.5" /> {test.duration} daqiqa
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <RotateCcw className="h-3.5 w-3.5" /> Urinish: {test.attempts_used} / {test.attempt_limit}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-3 sm:justify-end">
                                    {test.best_score !== null && (
                                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', scoreClass(test.best_score))}>
                                            Eng yaxshi: {test.best_score}%
                                        </span>
                                    )}
                                    <Button
                                        size="sm"
                                        disabled={!canStart}
                                        isLoading={startingId === test.id}
                                        onClick={() =>
                                            resumable
                                                ? navigate(`/general-tests/attempt/${test.in_progress_attempt_id}`)
                                                : start(test)
                                        }
                                    >
                                        <Play className="h-3.5 w-3.5" />
                                        {resumable ? 'Davom ettirish' : left > 0 ? 'Boshlash' : 'Urinishlar tugagan'}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {results && results.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Mening natijalarim</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y divide-border">
                            {results.map((r) => (
                                <li key={r.attempt_id} className="flex items-center justify-between gap-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {r.correct_answers} / {r.total_questions} to'g'ri
                                            {r.finished_at ? ` · ${formatDateTime(r.finished_at)}` : ''}
                                        </p>
                                    </div>
                                    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', scoreClass(r.score))}>
                                        {r.score}%
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
