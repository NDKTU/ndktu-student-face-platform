import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMethod, useSubmitTest } from '@/hooks/usePsychology';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loader2, CheckCircle, ChevronLeft, ChevronRight, Brain, ListOrdered, Play } from 'lucide-react';
import type { QuestionResponse, AnswerItem, Diagnosis, TestResultResponse } from '@/services/psychologyService';
import { DiagnosisCard } from '@/components/psychology/DiagnosisCard';
import { AnswerRow } from '@/components/psychology/AnswerRow';

type AnswerValue = boolean | number | string | null;

// ── Question renderers ──────────────────────────────────────────────────────

function TrueFalseQuestion({
    question,
    value,
    onChange,
}: {
    question: QuestionResponse;
    value: AnswerValue;
    onChange: (v: boolean) => void;
}) {
    const c = question.content as Record<string, string>;
    return (
        <div className="flex flex-col items-center gap-6">
            <p className="text-center text-base font-medium leading-relaxed text-foreground sm:text-lg">{c.text}</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
                {[{ label: "Ha", val: true }, { label: "Yo'q", val: false }].map(({ label, val }) => (
                    <button
                        key={label}
                        onClick={() => onChange(val)}
                        className={`min-h-[3.5rem] w-full rounded-xl border-2 p-4 text-base font-semibold transition-all sm:min-w-[9rem] ${
                            value === val
                                ? 'border-primary bg-primary text-primary-foreground shadow-md'
                                : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-accent'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ScaleQuestion({
    question,
    value,
    onChange,
}: {
    question: QuestionResponse;
    value: AnswerValue;
    onChange: (v: number) => void;
}) {
    const c = question.content as Record<string, unknown>;
    const min = Number(c.min ?? 1);
    const max = Number(c.max ?? 5);
    const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    return (
        <div className="flex flex-col items-center gap-6">
            <p className="text-center text-base font-medium leading-relaxed text-foreground sm:text-lg">{String(c.text ?? '')}</p>
            <div className="flex flex-wrap justify-center gap-2.5">
                {steps.map((n) => (
                    <button
                        key={n}
                        onClick={() => onChange(n)}
                        className={`h-13 w-13 min-h-[3.25rem] min-w-[3.25rem] rounded-xl border-2 text-base font-bold transition-all ${
                            value === n
                                ? 'border-primary bg-primary text-primary-foreground shadow-md'
                                : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-accent'
                        }`}
                    >
                        {n}
                    </button>
                ))}
            </div>
            {!!(c.min_label || c.max_label) && (
                <div className="flex w-full max-w-xs justify-between text-xs text-muted-foreground">
                    <span>{String(c.min_label ?? '')}</span>
                    <span>{String(c.max_label ?? '')}</span>
                </div>
            )}
        </div>
    );
}

function TextOptionsQuestion({
    question,
    value,
    onChange,
}: {
    question: QuestionResponse;
    value: AnswerValue;
    onChange: (v: number | string) => void;
}) {
    const c = question.content as Record<string, string>;
    const options = (question.options ?? []) as Array<{ text: string; value: number | string }>;
    return (
        <div className="flex flex-col gap-5">
            <p className="text-center text-base font-medium leading-relaxed text-foreground sm:text-lg">{c.text}</p>
            <div className="flex flex-col gap-2.5">
                {options.map((opt, i) => (
                    <button
                        key={i}
                        onClick={() => onChange(opt.value)}
                        className={`rounded-xl border-2 p-4 text-left text-sm leading-relaxed transition-all sm:text-base ${
                            value === opt.value
                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-accent'
                        }`}
                    >
                        {opt.text}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ImageStimulusQuestion({
    question,
    value,
    onChange,
}: {
    question: QuestionResponse;
    value: AnswerValue;
    onChange: (v: number | string) => void;
}) {
    const c = question.content as Record<string, string>;
    const options = (question.options ?? []) as Array<{ text: string; value: number | string }>;
    return (
        <div className="flex flex-col gap-5 items-center">
            {c.image_url && (
                <img
                    src={c.image_url}
                    alt="stimulus"
                    className="max-h-64 max-w-full rounded-xl border border-border object-contain shadow-sm"
                />
            )}
            {c.text && <p className="text-center text-base leading-relaxed text-foreground">{c.text}</p>}
            <div className="flex flex-col gap-2.5 w-full">
                {options.map((opt, i) => (
                    <button
                        key={i}
                        onClick={() => onChange(opt.value)}
                        className={`rounded-xl border-2 p-4 text-left text-sm leading-relaxed transition-all sm:text-base ${
                            value === opt.value
                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-accent'
                        }`}
                    >
                        {opt.text}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ImageChoiceQuestion({
    question,
    value,
    onChange,
}: {
    question: QuestionResponse;
    value: AnswerValue;
    onChange: (v: number | string) => void;
}) {
    const c = question.content as Record<string, string>;
    const options = (question.options ?? []) as Array<{ image_url: string; value: number | string }>;
    return (
        <div className="flex flex-col gap-5 items-center">
            {c.text && <p className="text-center text-base font-medium leading-relaxed text-foreground">{c.text}</p>}
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                {options.map((opt, i) => (
                    <button
                        key={i}
                        onClick={() => onChange(opt.value)}
                        className={`overflow-hidden rounded-xl border-2 transition-all ${
                            value === opt.value
                                ? 'border-primary shadow-md ring-2 ring-primary/30'
                                : 'border-border hover:border-primary/40'
                        }`}
                    >
                        <img src={opt.image_url} alt={`option ${i + 1}`} className="h-32 w-full object-cover sm:h-28" />
                    </button>
                ))}
            </div>
        </div>
    );
}

function MultiChoiceQuestion({
    question,
    value,
    onChange,
}: {
    question: QuestionResponse;
    value: AnswerValue;
    onChange: (v: number) => void;
}) {
    const c = question.content as Record<string, string>;
    const options = (question.options ?? []) as Array<{ image_url?: string; description?: string; value: number }>;

    return (
        <div className="flex flex-col gap-5">
            <p className="text-center text-base font-medium leading-relaxed text-foreground sm:text-lg">{c.text}</p>
            {c.description && (
                <p className="text-center text-sm text-muted-foreground">{c.description}</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {options.map((opt, i) => {
                    const isSelected = value === opt.value;
                    return (
                        <button
                            key={i}
                            onClick={() => onChange(opt.value)}
                            className={`overflow-hidden rounded-xl border-2 transition-all ${
                                isSelected
                                    ? 'border-primary shadow-md ring-2 ring-primary/30'
                                    : 'border-border hover:border-primary/40'
                            }`}
                        >
                            {opt.image_url ? (
                                <img
                                    src={opt.image_url}
                                    alt={`variant ${i + 1}`}
                                    className="h-32 w-full object-cover sm:h-28"
                                />
                            ) : (
                                <div className="flex h-32 w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground sm:h-28">
                                    {i + 1}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function QuestionRenderer({
    question,
    value,
    onChange,
}: {
    question: QuestionResponse;
    value: AnswerValue;
    onChange: (v: AnswerValue) => void;
}) {
    switch (question.question_type) {
        case 'true_false':
            return <TrueFalseQuestion question={question} value={value} onChange={onChange} />;
        case 'scale':
            return <ScaleQuestion question={question} value={value} onChange={n => onChange(n)} />;
        case 'text':
            return <TextOptionsQuestion question={question} value={value} onChange={v => onChange(v)} />;
        case 'image_stimulus':
            return <ImageStimulusQuestion question={question} value={value} onChange={v => onChange(v)} />;
        case 'image_choice':
            return <ImageChoiceQuestion question={question} value={value} onChange={v => onChange(v)} />;
        case 'multi_choice':
            return <MultiChoiceQuestion question={question} value={value} onChange={v => onChange(v)} />;
        default:
            return <p className="text-muted-foreground text-sm">Noma'lum savol turi</p>;
    }
}

// ── Intro screen ────────────────────────────────────────────────────────────

function IntroScreen({ methodName, description, total, onStart, onBack }: {
    methodName: string;
    description: string;
    total: number;
    onStart: () => void;
    onBack: () => void;
}) {
    return (
        <Card>
            <CardContent className="flex flex-col items-center gap-6 px-5 py-10 text-center sm:px-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Brain className="h-8 w-8 text-primary" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{methodName}</h1>
                    {description && (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
                    )}
                </div>
                <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm text-muted-foreground">
                    <ListOrdered className="h-4 w-4" />
                    {total} ta savol
                </div>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    Har bir savolga o'zingizga eng mos javobni tanlang. To'g'ri yoki noto'g'ri javob yo'q —
                    samimiy javob bering. Testni yakunlash uchun barcha savollarga javob berish kerak.
                </p>
                <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row">
                    <Button variant="outline" size="lg" onClick={onBack}>
                        <ChevronLeft className="h-4 w-4" />
                        Orqaga
                    </Button>
                    <Button size="lg" onClick={onStart} className="sm:min-w-[12rem]">
                        <Play className="h-4 w-4" />
                        Testni boshlash
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Result screen ───────────────────────────────────────────────────────────

function ResultScreen({ methodName, questions, answers, diagnosis, onBack }: {
    methodName: string;
    questions: QuestionResponse[];
    answers: AnswerItem[];
    diagnosis: Diagnosis | null | undefined;
    onBack: () => void;
}) {
    const questionsById = new Map(questions.map(q => [q.id, q]));

    return (
        <div className="flex flex-col gap-5 py-4">
            {/* Top icon + title */}
            <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
                    <CheckCircle className="h-7 w-7 text-success" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-foreground">Test yakunlandi!</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        «{methodName}» — {answers.length} ta savol
                    </p>
                </div>
            </div>

            {/* Diagnosis */}
            <DiagnosisCard diagnosis={diagnosis} />

            {/* Answers detail */}
            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Javoblaringiz
                </p>
                <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
                    {answers.map((a, i) => (
                        <AnswerRow
                            key={i}
                            index={i}
                            question={questionsById.get(a.question_id)}
                            value={a.value}
                        />
                    ))}
                </div>
            </div>

            <div className="flex justify-center">
                <Button size="lg" onClick={onBack} className="w-full sm:w-auto sm:min-w-[10rem]">Orqaga</Button>
            </div>
        </div>
    );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function PsychologyTestPage() {
    const { methodId } = useParams<{ methodId: string }>();
    const navigate = useNavigate();
    const { data: method, isLoading, isError, refetch } = useMethod(methodId ? Number(methodId) : null);
    const submitTest = useSubmitTest();

    const [started, setStarted] = useState(false);
    const [current, setCurrent] = useState(0);
    const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
    const [result, setResult] = useState<TestResultResponse | null>(null);

    // Per-page-load seed so the shuffled order is stable across re-renders but
    // changes each time the test is opened. Lazy initializer keeps Math.random
    // out of the render path.
    const [shuffleSeed] = useState(() => Math.random());

    const questions = useMemo(() => {
        if (!method) return [];
        const list = [...method.questions];
        let seed = Math.floor(shuffleSeed * 0x7fffffff) || 1;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) | 0;
            return ((seed >>> 0) % 1_000_000) / 1_000_000;
        };
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }, [method, shuffleSeed]);

    if (isError) {
        return (
            <div className="mx-auto w-full max-w-2xl">
                <ErrorState onRetry={() => refetch()} />
            </div>
        );
    }

    if (isLoading || !method) {
        return (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-72 w-full rounded-xl" />
                <div className="flex justify-between gap-3">
                    <Skeleton className="h-11 w-28 rounded-xl" />
                    <Skeleton className="h-11 flex-1 rounded-xl" />
                </div>
            </div>
        );
    }

    const total = questions.length;

    if (total === 0) {
        return (
            <div className="mx-auto w-full max-w-2xl">
                <EmptyState
                    icon={<Brain className="h-6 w-6" />}
                    title="Savollar yo'q"
                    description="Bu metodda hali savollar yo'q."
                    action={<Button variant="outline" onClick={() => navigate('/psychology')}>Orqaga</Button>}
                />
            </div>
        );
    }

    if (result) {
        return (
            <div className="mx-auto w-full max-w-2xl">
                <ResultScreen
                    methodName={method.name}
                    questions={questions}
                    answers={result.answers}
                    diagnosis={result.diagnosis}
                    onBack={() => navigate(-1)}
                />
            </div>
        );
    }

    if (!started) {
        return (
            <div className="mx-auto w-full max-w-2xl">
                <IntroScreen
                    methodName={method.name}
                    description={method.description}
                    total={total}
                    onStart={() => setStarted(true)}
                    onBack={() => navigate('/psychology')}
                />
            </div>
        );
    }

    const question = questions[current];
    const currentAnswer = answers[question.id] ?? null;
    const progress = Math.round((Object.keys(answers).length / total) * 100);
    const isLast = current === total - 1;
    const allAnswered = questions.every(q => answers[q.id] !== undefined && answers[q.id] !== null);

    const handleAnswer = (val: AnswerValue) => {
        setAnswers(prev => ({ ...prev, [question.id]: val }));
    };

    const handleSubmit = () => {
        const payload: AnswerItem[] = questions.map(q => ({
            question_id: q.id,
            value: (answers[q.id] ?? null) as boolean | number | string,
        }));
        submitTest.mutate(
            { methodId: method.id, data: { answers: payload } },
            {
                onSuccess: (data) => {
                    setResult(data);
                },
            }
        );
    };

    return (
        <div className="mx-auto w-full max-w-2xl">
            {/* Header */}
            <div className="mb-5 flex items-center gap-3">
                <button
                    onClick={() => navigate('/psychology')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Orqaga"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="truncate font-semibold text-foreground">{method.name}</h1>
                    <p className="text-xs text-muted-foreground">
                        {current + 1} / {total} savol
                    </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {progress}%
                </span>
            </div>

            {/* Progress bar */}
            <div className="mb-5 h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Question card */}
            <Card>
                <CardContent className="px-4 py-6 sm:px-8 sm:py-8">
                    <QuestionRenderer
                        question={question}
                        value={currentAnswer}
                        onChange={handleAnswer}
                    />
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="mt-5 flex items-center justify-between gap-3">
                <Button
                    variant="outline"
                    size="lg"
                    disabled={current === 0}
                    onClick={() => setCurrent(c => c - 1)}
                >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Orqaga</span>
                </Button>

                {isLast ? (
                    <Button
                        size="lg"
                        onClick={handleSubmit}
                        disabled={!allAnswered || submitTest.isPending}
                        className="flex-1"
                    >
                        {submitTest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Yuborish
                    </Button>
                ) : (
                    <Button
                        size="lg"
                        onClick={() => setCurrent(c => c + 1)}
                        disabled={currentAnswer === null}
                        className="flex-1"
                    >
                        Keyingi
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                )}
            </div>

            {/* Answer dots */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                {questions.map((q, i) => (
                    <button
                        key={q.id}
                        onClick={() => setCurrent(i)}
                        className={`h-3 w-3 rounded-full transition-all ${
                            i === current
                                ? 'bg-primary scale-125'
                                : answers[q.id] !== undefined
                                ? 'bg-primary/40'
                                : 'bg-muted'
                        }`}
                        title={`Savol ${i + 1}`}
                        aria-label={`Savol ${i + 1}`}
                    />
                ))}
            </div>
        </div>
    );
}
