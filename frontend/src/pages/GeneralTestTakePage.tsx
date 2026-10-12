import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { scoreClass } from '@/components/generalTest/score';
import { STUDENT_ELEMENTAR_RESULTS, STUDENT_ELEMENTAR_TAKE } from '@/components/generalTest/studentPaths';
import { useRefreshTaking } from '@/hooks/useGeneralTests';
import {
    generalTestService,
    type AttemptResult,
    type AttemptState,
    type OptionLetter,
} from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';
import { noCopyHandlers } from '@/utils/antiCopy';
import { useAuth } from '@/context/AuthContext';
import { QuizWatermark } from '@/components/quizzes/QuizWatermark';
import { QuizVideoMonitoring } from '@/components/QuizVideoMonitoring';
import { FACE_DETECTION_SERVICE_URL } from '@/config/env';
import { LEAVE_TEXT, closedReason, useStrictQuizGuard } from '@/hooks/useStrictQuizGuard';
import { useHoldToReveal } from '@/hooks/useHoldToReveal';
import { HoldToRevealBar } from '@/components/quizzes/HoldToRevealBar';
import type { LeaveReason } from '@/services/quizProcessService';
import { RichText } from '@/components/questions/RichText';
import { cn } from '@/lib/utils';
import { useKeepSessionAlive } from '@/hooks/useKeepSessionAlive';

/** Vaqt tugaganda yakunlash o'tmasa — shuncha vaqtdan keyin qayta urinadi. */
const FINISH_RETRY_MS = 5000;

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

/** Javobni darhol qayta yuborish oraliqlari; keyin — fonda `BACKGROUND_RESEND_MS` da. */
const ANSWER_RETRY_DELAYS_MS = [1500, 4000];
const BACKGROUND_RESEND_MS = 10_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Javob yuborilgandan keyingi holat.
 *
 * * `retry` — javob kelmadi yoki server/proksi xatosi (5xx, 408, 429):
 *   tanlov o'chirilmaydi, «saqlanmagan» bo'lib qoladi va qayta yuboriladi.
 *   Ilgari bunday javob jimgina bekor qilinar, talaba esa bildirishnomani
 *   ko'rmay o'tib ketsa, javobi yo'qolardi;
 * * `gone` (410) — savolni o'qituvchi o'chirgan: faqat shu savol chiqadi;
 * * `closed` (409) — urinish yopilgan: butun test yakunlanadi;
 * * `rejected` — boshqa 4xx: javob qabul qilinmaydi, tanlov qaytariladi.
 */
type AnswerOutcome =
    | { kind: 'saved' | 'retry' | 'closed' }
    | { kind: 'gone' | 'rejected'; error: unknown };

export default function GeneralTestTakePage() {
    const attemptId = Number(useParams().attemptId);
    const navigate = useNavigate();
    const refreshTaking = useRefreshTaking();
    const { user } = useAuth();
    // Talaba urinishni «Test ishlash» ostida ochadi (`/quiz-test/elementar/...`),
    // xodim — elementar test bo'limida. Qaytish o'sha ro'yxatga.
    const studentHub = useLocation().pathname.startsWith(STUDENT_ELEMENTAR_TAKE);
    const listPath = studentHub ? STUDENT_ELEMENTAR_TAKE : '/elementar-tests/take';

    const [state, setState] = useState<AttemptState | null>(null);
    const [answers, setAnswers] = useState<Record<number, OptionLetter>>({});
    const [current, setCurrent] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [result, setResult] = useState<AttemptResult | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [confirmFinish, setConfirmFinish] = useState(false);
    const [finishing, setFinishing] = useState(false);
    // Qat'iy testda chiqildi: urinish yopildi, server natijasi hali kelmagan
    // (yoki aloqa yo'q — kelmaydi). Ballar o'rniga sabab ko'rsatiladi.
    const [leftReason, setLeftReason] = useState<string | null>(null);
    const finishedRef = useRef(false);
    // Saqlanmagan javoblar: ref — fon takrori va yakunlash eng so'nggisini
    // ko'rsin, state — navigator qayta chizilsin.
    const pendingRef = useRef<Record<number, OptionLetter>>({});
    const [pending, setPendingState] = useState<Record<number, OptionLetter>>({});
    // O'qituvchi o'chirgan savollar (server 410 qaytardi).
    const [removed, setRemoved] = useState<Set<number>>(() => new Set());
    // Muddat bir marta — javob kelganda qotiriladi. Taymer effekti qayta
    // ishga tushsa ham hisob shu nuqtadan davom etadi, boshidan emas.
    const deadlineRef = useRef(0);

    const updatePending = useCallback((update: (prev: Record<number, OptionLetter>) => Record<number, OptionLetter>) => {
        pendingRef.current = update(pendingRef.current);
        setPendingState(pendingRef.current);
    }, []);

    const sendAnswer = useCallback(
        async (questionId: number, option: OptionLetter): Promise<AnswerOutcome> => {
            try {
                await generalTestService.answer(attemptId, questionId, option);
                return { kind: 'saved' };
            } catch (error) {
                const code = statusOf(error);
                if (code === 409) return { kind: 'closed' };
                if (code === 410) return { kind: 'gone', error };
                if (code && code >= 400 && code < 500 && code !== 408 && code !== 429) return { kind: 'rejected', error };
                return { kind: 'retry' };
            }
        },
        [attemptId],
    );

    /** Natijani holatga tushiradi. `closed` ni chaqiruvchi o'zi hal qiladi. */
    const settle = useCallback(
        (questionId: number, option: OptionLetter, outcome: AnswerOutcome, previous?: OptionLetter) => {
            if (outcome.kind === 'retry' || outcome.kind === 'closed') return;
            updatePending((prev) => {
                // Shu orada talaba boshqa variantni tanlagan bo'lsa — yangisi kutilmoqda.
                if (outcome.kind === 'saved' && prev[questionId] !== option) return prev;
                const next = { ...prev };
                delete next[questionId];
                return next;
            });
            if (outcome.kind === 'gone') {
                setRemoved((prev) => new Set(prev).add(questionId));
                setAnswers((prev) => {
                    const next = { ...prev };
                    delete next[questionId];
                    return next;
                });
                toast.warning(apiErrorMessage(outcome.error, "Bu savol o'chirilgan"), { id: `gone-${questionId}` });
            } else if (outcome.kind === 'rejected') {
                setAnswers((prev) => {
                    const next = { ...prev };
                    if (previous) next[questionId] = previous;
                    else delete next[questionId];
                    return next;
                });
                toast.error(apiErrorMessage(outcome.error, "Javob saqlanmadi, qayta urinib ko'ring"));
            }
        },
        [updatePending],
    );

    /** Saqlanmaganlarni bir marta qayta yuboradi; `true` — urinish yopilgan. */
    const flushPending = useCallback(async () => {
        let closed = false;
        for (const [id, option] of Object.entries(pendingRef.current)) {
            const outcome = await sendAnswer(Number(id), option);
            if (outcome.kind === 'closed') closed = true;
            settle(Number(id), option, outcome);
        }
        return closed;
    }, [sendAnswer, settle]);

    const finish = useCallback(async () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setFinishing(true);
        // Yakunlashdan oldin saqlanmaganlarni yana bir bor yuboramiz —
        // aks holda ular natijaga kirmay qolardi.
        await flushPending();
        try {
            const res = await generalTestService.finish(attemptId).catch((e: unknown) => {
                // Qat'iy test server tomonda yopildi — endi `finish` saqlangan natijani beradi.
                if (closedReason(e)) return generalTestService.finish(attemptId);
                throw e;
            });
            setResult(res);
            refreshTaking();
        } catch (e) {
            finishedRef.current = false;
            toast.error(apiErrorMessage(e, 'Testni yakunlab bo\'lmadi'));
        } finally {
            setFinishing(false);
            setConfirmFinish(false);
        }
    }, [attemptId, refreshTaking, flushPending]);

    useEffect(() => {
        let cancelled = false;
        generalTestService
            .getAttempt(attemptId)
            .then((s) => {
                if (cancelled) return;
                deadlineRef.current = Date.now() + s.remaining_seconds * 1000;
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
    //
    // Nolda taymer to'xtamaydi: yakunlash so'rovi tarmoq tufayli o'tmasa,
    // har FINISH_RETRY_MS da qayta yuboriladi. Ilgari taymer birinchi
    // urinishdan keyin to'xtardi va talaba 00:00 bilan qolib, «Yakunlash»
    // ni o'zi bosishi kerak edi.
    useEffect(() => {
        if (!state || result) return;
        let announced = false;
        let lastTry = 0;
        const timer = setInterval(() => {
            const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
            setSecondsLeft(left);
            if (left > 0 || finishedRef.current) return;
            if (!announced) {
                announced = true;
                toast.info('Vaqt tugadi');
            }
            if (Date.now() - lastTry >= FINISH_RETRY_MS) {
                lastTry = Date.now();
                finish();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [state, result, finish]);

    const isStrict = Boolean(state?.strict_mode);
    // Kamera nazorati: ruxsat oynasi ham fokusni oladi, shuning uchun qat'iy
    // kuzatuv kamera ishga tushgandan (yoki tushmay qolgandan) keyin boshlanadi.
    const usesCamera = state?.proctoring_mode === 'face';
    const [cameraSettled, setCameraSettled] = useState(false);
    const handleCameraSettled = useCallback(() => setCameraSettled(true), []);

    /** Kamera qoidabuzarlikni aniqladi (3 ogohlantirishdan keyin) — server urinishni yopadi. */
    const handleCheating = useCallback(async (kind: 'multiple' | 'different' | 'no_face', imageData: string) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        try {
            setResult(await generalTestService.reportCheating(attemptId, kind, imageData || undefined));
            refreshTaking();
        } catch (e) {
            // Xabar yetmadi — hech bo'lmasa urinish yakunlansin.
            finishedRef.current = false;
            toast.error(apiErrorMessage(e, "Nazorat xabarini yuborib bo'lmadi"));
            finish();
        }
    }, [attemptId, refreshTaking, finish]);
    const onMultipleFaces = useCallback((image: string) => handleCheating('multiple', image), [handleCheating]);
    const onDifferentPerson = useCallback((image: string) => handleCheating('different', image), [handleCheating]);
    const onNoFace = useCallback((image: string) => handleCheating('no_face', image), [handleCheating]);

    const handleLeave = useCallback((reason: LeaveReason) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setLeftReason(LEAVE_TEXT[reason]);
        void generalTestService.sendLeave(attemptId, reason).then((res) => {
            if (res) {
                setResult(res);
                refreshTaking();
            }
        });
    }, [attemptId, refreshTaking]);

    useStrictQuizGuard({
        active: isStrict && !result && !leftReason && (!usesCamera || cameraSettled),
        onLeave: handleLeave,
    });

    const holdToReveal = Boolean(state?.hold_to_reveal) && !result && !leftReason;
    const reveal = useHoldToReveal(holdToReveal);
    // Tranzitsiyasiz: o'tish paytidagi yarim xira kadr skrinshotga tushmasin.
    const veil = reveal.hidden ? 'blur-md' : '';

    // Savolni o'ylayotgan talaba sichqonchaga tegmaydi — avtochiqish to'xtaydi.
    useKeepSessionAlive(!result && !leftReason);

    useEffect(() => {
        if (!isStrict || result || leftReason) return;
        const id = setInterval(() => {
            generalTestService.heartbeat(attemptId).catch((e: unknown) => {
                if (closedReason(e) || statusOf(e) === 409) finish();
            });
        }, 5000);
        return () => clearInterval(id);
    }, [isStrict, result, leftReason, attemptId, finish]);

    // Saqlanmagan javoblar fonda va aloqa tiklanganda qayta yuboriladi.
    const hasPending = Object.keys(pending).length > 0;
    useEffect(() => {
        if (!hasPending || result || leftReason) return;
        const resend = () => {
            void flushPending().then((closed) => {
                if (closed) finish();
            });
        };
        const id = setInterval(resend, BACKGROUND_RESEND_MS);
        window.addEventListener('online', resend);
        return () => {
            clearInterval(id);
            window.removeEventListener('online', resend);
        };
    }, [hasPending, result, leftReason, flushPending, finish]);

    const choose = async (questionId: number, option: OptionLetter) => {
        if (removed.has(questionId)) return;
        const previous = answers[questionId];
        setAnswers((prev) => ({ ...prev, [questionId]: option }));
        updatePending((prev) => ({ ...prev, [questionId]: option }));
        for (const delay of [0, ...ANSWER_RETRY_DELAYS_MS]) {
            if (delay) await sleep(delay);
            // Boshqa variant tanlangan yoki fon takrori allaqachon saqladi.
            if (pendingRef.current[questionId] !== option) return;
            const outcome = await sendAnswer(questionId, option);
            if (outcome.kind === 'closed') {
                finish();
                return;
            }
            if (outcome.kind !== 'retry') {
                settle(questionId, option, outcome, previous);
                return;
            }
        }
        // Tanlov o'chirilmaydi: javob saqlanmagan deb belgilanadi va fonda yuboriladi.
        toast.error("Javob hali saqlanmadi — aloqa tiklanishi bilan avtomatik yuboriladi", { id: 'answer-unsaved' });
    };

    if (result) {
        return (
            <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-12 text-center">
                {result.stop_reason ? (
                    <AlertTriangle className="h-12 w-12 text-destructive" />
                ) : (
                    <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                )}
                <h1 className="text-xl font-semibold text-foreground">{result.title}</h1>
                {result.stop_reason ? (
                    <p className="text-sm font-medium text-destructive">Test to'xtatildi: {result.stop_reason}</p>
                ) : (
                    <p className="text-sm text-muted-foreground">Test yakunlandi</p>
                )}
                <div className={cn('rounded-2xl px-8 py-5', scoreClass(result.score))}>
                    <p className="text-4xl font-bold">{result.score}%</p>
                    <p className="mt-1 text-sm">
                        {result.correct_answers} / {result.total_questions} to'g'ri javob
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => navigate(listPath)}>Testlar ro'yxatiga qaytish</Button>
                    {studentHub && (
                        <Button variant="outline" onClick={() => navigate(STUDENT_ELEMENTAR_RESULTS)}>
                            Natijalarim
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    if (leftReason) {
        return (
            <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <p className="text-sm font-medium text-destructive">Test to'xtatildi: {leftReason}</p>
                <p className="text-sm text-muted-foreground">Urinish yopildi. Natija va sabab o'qituvchingizda ko'rinadi.</p>
                <Button onClick={() => navigate(listPath)}>Testlar ro'yxatiga qaytish</Button>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="mx-auto max-w-md px-4 py-12 text-center">
                <p className="text-sm text-destructive">{loadError}</p>
                <Link to={listPath} className="mt-4 inline-block text-sm text-primary underline">
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
    const activeQuestions = state.questions.filter((q) => !removed.has(q.id));
    const answeredCount = activeQuestions.filter((q) => answers[q.id]).length;
    const unanswered = activeQuestions.length - answeredCount;
    const pendingCount = Object.keys(pending).length;

    return (
        <div
            className={cn('mx-auto w-full max-w-3xl space-y-5 px-4 py-6 select-none [-webkit-touch-callout:none]', holdToReveal && 'pb-24')}
            {...noCopyHandlers}
        >
            <QuizWatermark user={user} />
            {usesCamera && (
                <QuizVideoMonitoring
                    active={!result && !leftReason}
                    onCheatingDetected={onMultipleFaces}
                    onDifferentPersonDetected={onDifferentPerson}
                    noFaceFinishSeconds={state.no_face_finish_seconds ?? null}
                    onNoFaceTimeout={onNoFace}
                    faceDetectionServiceUrl={FACE_DETECTION_SERVICE_URL}
                    token={state.face_ws_token ?? undefined}
                    imageUrl={state.image_url ?? undefined}
                    onCameraSettled={handleCameraSettled}
                />
            )}
            {holdToReveal && <HoldToRevealBar reveal={reveal} />}
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold text-foreground">{state.title}</h1>
                    <p className="text-xs text-muted-foreground">
                        Javob berilgan: {answeredCount} / {activeQuestions.length}
                    </p>
                    {pendingCount > 0 && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-medium text-amber-600">
                            {pendingCount} ta javob saqlanmagan — qayta yuborilmoqda
                            <button
                                type="button"
                                className="underline underline-offset-2"
                                onClick={() => void flushPending().then((closed) => { if (closed) void finish(); })}
                            >
                                Hozir yuborish
                            </button>
                        </p>
                    )}
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
                    <RichText value={question.text} className={cn('text-base font-medium text-foreground', veil)} />
                    {removed.has(question.id) && (
                        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                            Bu savol o'qituvchi tomonidan o'chirilgan — u hisobga olinmaydi, javob berish shart emas.
                        </p>
                    )}
                    <div className="mt-4 space-y-2">
                        {question.options.map((option, index) => {
                            const selected = answers[question.id] === option.key;
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    disabled={removed.has(question.id)}
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
                                    <RichText value={option.text} className={cn('min-w-0 flex-1', veil)} />
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
                            removed.has(q.id)
                                ? 'border-border text-muted-foreground line-through opacity-40'
                                : pending[q.id]
                                    ? 'border-amber-500 bg-amber-500 text-white'
                                    : answers[q.id]
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
                description={[
                    pendingCount > 0
                        ? `${pendingCount} ta javob hali saqlanmagan — yakunlashdan oldin yana yuboriladi, o'tmasa hisobga olinmaydi.`
                        : '',
                    unanswered > 0 ? `${unanswered} ta savolga javob berilmagan.` : '',
                    "Yakunlangandan keyin javoblarni o'zgartirib bo'lmaydi.",
                ]
                    .filter(Boolean)
                    .join(' ')}
                confirmText="Yakunlash"
                cancelText="Davom etish"
                isLoading={finishing}
            />
        </div>
    );
}
