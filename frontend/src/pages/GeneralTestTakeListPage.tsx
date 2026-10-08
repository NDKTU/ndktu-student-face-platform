import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardCheck, Clock, ListOrdered, Play, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
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
    // PIN so'raydigan test: oyna shu test uchun ochiq.
    const [pinTest, setPinTest] = useState<AvailableTest | null>(null);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);

    const start = async (test: AvailableTest, withPin?: string) => {
        if (test.pin_required && withPin === undefined) {
            setPin('');
            setPinError(null);
            setPinTest(test);
            return;
        }
        setStartingId(test.id);
        try {
            const state = await generalTestService.start(test.id, withPin);
            setPinTest(null);
            navigate(`/elementar-tests/attempt/${state.attempt_id}`);
        } catch (e) {
            const message = apiErrorMessage(e, 'Testni boshlab bo\'lmadi');
            // Noto'g'ri PIN — oyna ochiq qoladi, talaba qayta yozadi.
            if (withPin !== undefined) {
                setPinError(message);
            } else {
                toast.error(message);
            }
            refetch();
        } finally {
            setStartingId(null);
        }
    };

    const submitPin = () => {
        if (!pinTest) return;
        if (!pin.trim()) {
            setPinError('PIN kodni kiriting');
            return;
        }
        start(pinTest, pin.trim());
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Elementar testlar" description="Sizga biriktirilgan faol testlar" />

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
                        description="Sizga yoki guruhingizga elementar test biriktirilganda shu yerda ko'rinadi."
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
                                    <p className="text-xs font-medium text-primary">{test.subject_name}</p>
                                    <p className="font-medium text-foreground">{test.title}</p>
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
                                    {test.strict_mode && (
                                        <p className="mt-1.5 inline-flex items-start gap-1 text-xs text-destructive">
                                            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            Qat'iy rejim: sahifadan chiqsangiz, boshqa ilovani ochsangiz yoki ekranni
                                            bo'lsangiz — test darhol yopiladi. Telefonni «Bezovta qilmang» rejimiga qo'ying.
                                        </p>
                                    )}
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
                                                ? navigate(`/elementar-tests/attempt/${test.in_progress_attempt_id}`)
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
            <Modal isOpen={pinTest !== null} onClose={() => setPinTest(null)} title={`Testni boshlash: ${pinTest?.title ?? ''}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        submitPin();
                    }}
                >
                    <Input
                        label="PIN kod"
                        inputMode="numeric"
                        autoComplete="off"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="O'qituvchi bergan PIN"
                        autoFocus
                    />
                    {pinError && (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{pinError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setPinTest(null)}>
                            Bekor qilish
                        </Button>
                        <Button type="submit" isLoading={startingId === pinTest?.id}>
                            Boshlash
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
