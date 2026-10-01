import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { scoreClass } from '@/components/generalTest/score';
import { useRefreshTaking } from '@/hooks/useGeneralTests';
import {
    generalTestService,
    type AttemptResult,
    type AttemptState,
    type OptionLetter,
} from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';
import { cn } from '@/lib/utils';

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

export default function GeneralTestTakePage() {
    const attemptId = Number(useParams().attemptId);
    const navigate = useNavigate();
    const refreshTaking = useRefreshTaking();

    const [state, setState] = useState<AttemptState | null>(null);
    const [answers, setAnswers] = useState<Record<number, OptionLetter>>({});
    const [current, setCurrent] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [result, setResult] = useState<AttemptResult | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [confirmFinish, setConfirmFinish] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const finishedRef = useRef(false);

    const finish = useCallback(async () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setFinishing(true);
        try {
            const res = await generalTestService.finish(attemptId);
            setResult(res);
            refreshTaking();
        } catch (e) {
            finishedRef.current = false;
            toast.error(apiErrorMessage(e, 'Testni yakunlab bo\'lmadi'));
        } finally {
            setFinishing(false);
            setConfirmFinish(false);
        }
    }, [attemptId, refreshTaking]);

    useEffect(() => {
        let cancelled = false;
        generalTestService
            .getAttempt(attemptId)
            .then((s) => {
                if (cancelled) return;
                setState(s);
                setSecondsLeft(s.remaining_seconds);
                setAnswers(
                    Object.fromEntries(s.questions.filter((q) => q.selected).map((q) => [q.id, q.selected as OptionLetter])),
                );
            })
            .catch((e) => {
                if (cancelled) return;
                // Yakunlangan yoki vaqti o'tgan urinish — natijasini ko'rsatamiz.
                if (statusOf(e) === 409) {
                    finish();
                    return;
                }
                setLoadError(apiErrorMessage(e, 'Testni yuklab bo\'lmadi'));
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId]);

    // Vaqt serverdan keladi (`remaining_seconds`): sahifani yangilash uni tiklamaydi.
    useEffect(() => {
        if (!state || result) return;
        const startedAt = Date.now();
        const initial = state.remaining_seconds;
        const timer = setInterval(() => {
            const left = Math.max(0, initial - Math.floor((Date.now() - startedAt) / 1000));
            setSecondsLeft(left);
            if (left === 0) {
                clearInterval(timer);
                toast.info('Vaqt tugadi');
                finish();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [state, result, finish]);

    const choose = async (questionId: number, option: OptionLetter) => {
        const previous = answers[questionId];
        setAnswers((prev) => ({ ...prev, [questionId]: option }));
        try {
            await generalTestService.answer(attemptId, questionId, option);
        } catch (e) {
            if (statusOf(e) === 409) {
                finish();
                return;
            }
            setAnswers((prev) => {
                const next = { ...prev };
                if (previous) next[questionId] = previous;
                else delete next[questionId];
                return next;
            });
            toast.error(apiErrorMessage(e, 'Javob saqlanmadi, qayta urinib ko\'ring'));
        }
    };

    if (result) {
        return (
            <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <h1 className="text-xl font-semibold text-foreground">{result.title}</h1>
                <p className="text-sm text-muted-foreground">Test yakunlandi</p>
                <div className={cn('rounded-2xl px-8 py-5', scoreClass(result.score))}>
                    <p className="text-4xl font-bold">{result.score}%</p>
                    <p className="mt-1 text-sm">
                        {result.correct_answers} / {result.total_questions} to'g'ri javob
                    </p>
                </div>
                <Button onClick={() => navigate('/general-tests/take')}>Testlar ro'yxatiga qaytish</Button>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="mx-auto max-w-md px-4 py-12 text-center">
                <p className="text-sm text-destructive">{loadError}</p>
                <Link to="/general-tests/take" className="mt-4 inline-block text-sm text-primary underline">
                    Testlar ro'yxatiga qaytish
                </Link>
            </div>
        );
    }

    if (!state || finishing) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    const question = state.questions[current];
    const answeredCount = state.questions.filter((q) => answers[q.id]).length;
    const unanswered = state.questions.length - answeredCount;

    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold text-foreground">{state.title}</h1>
                    <p className="text-xs text-muted-foreground">
                        Javob berilgan: {answeredCount} / {state.questions.length}
                    </p>
                </div>
                <div
                    className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold',
                        secondsLeft <= 60 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                    )}
                >
                    <Clock className="h-4 w-4" /> {formatTime(secondsLeft)}
                </div>
            </div>

            {question && (
                <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {current + 1}-savol
                    </p>
                    <p className="whitespace-pre-wrap text-base font-medium text-foreground">{question.text}</p>
                    <div className="mt-4 space-y-2">
                        {question.options.map((option, index) => {
                            const selected = answers[question.id] === option.key;
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => choose(question.id, option.key)}
                                    className={cn(
                                        'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                                        selected
                                            ? 'border-primary bg-primary/10 text-foreground'
                                            : 'border-border hover:border-primary/40 hover:bg-accent/40',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                                            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
                                        )}
                                    >
                                        {'ABCD'[index]}
                                    </span>
                                    <span className="whitespace-pre-wrap">{option.text}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-2">
                <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
                    <ArrowLeft className="h-4 w-4" /> Oldingi
                </Button>
                {current < state.questions.length - 1 ? (
                    <Button variant="outline" onClick={() => setCurrent((c) => c + 1)}>
                        Keyingi <ArrowRight className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button onClick={() => setConfirmFinish(true)}>Yakunlash</Button>
                )}
            </div>

            <div className="flex flex-wrap gap-1.5">
                {state.questions.map((q, index) => (
                    <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrent(index)}
                        aria-label={`${index + 1}-savol`}
                        className={cn(
                            'h-8 w-8 rounded-lg border text-xs font-medium transition-colors',
                            index === current && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                            answers[q.id]
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                    >
                        {index + 1}
                    </button>
                ))}
            </div>

            <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setConfirmFinish(true)}>
                    Testni yakunlash
                </Button>
            </div>

            <ConfirmDialog
                isOpen={confirmFinish}
                onClose={() => setConfirmFinish(false)}
                onConfirm={finish}
                variant="primary"
                title="Testni yakunlaysizmi?"
                description={
                    unanswered > 0
                        ? `${unanswered} ta savolga javob berilmagan. Yakunlangandan keyin javoblarni o'zgartirib bo'lmaydi.`
                        : "Yakunlangandan keyin javoblarni o'zgartirib bo'lmaydi."
                }
                confirmText="Yakunlash"
                cancelText="Davom etish"
                isLoading={finishing}
            />
        </div>
    );
}
