import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { publicQuizService, type PublicFinishResponse, type PublicStartResponse } from '@/services/publicQuizService';
import { sanitizeHtml } from '@/utils/sanitize';
import { BRAND } from '@/config/branding';
import logo from '@/assets/logo.png';

/**
 * Ochiq test sahifasi — tizimga kirmasdan ochiladi.
 *
 * Shuning uchun bu yerda `MainLayout` ham, `useAuth` ham ishlatilmaydi:
 * sahifa hech qanday sessiyaga tayanmaydi.
 */
const formatClock = (seconds: number) => {
    const safe = Math.max(0, seconds);
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

export default function PublicQuizPage() {
    const { pin: pinFromUrl } = useParams<{ pin?: string }>();
    const [searchParams] = useSearchParams();

    const [pin, setPin] = useState(pinFromUrl ?? searchParams.get('pin') ?? '');
    const [fullName, setFullName] = useState('');
    const [session, setSession] = useState<PublicStartResponse | null>(null);
    // Javoblar — tanlangan o'rinlar ro'yxati: bir nechta to'g'ri javobli
    // savolda bittadan ko'p bo'ladi.
    const [answers, setAnswers] = useState<Record<number, number[]>>({});
    const [remaining, setRemaining] = useState(0);
    const [result, setResult] = useState<PublicFinishResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Taymer serverdagi qolgan vaqtdan yuritiladi: sahifani yangilash
    // vaqtni uzaytirmaydi.
    useEffect(() => {
        if (!session || result) return;
        const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
        return () => clearInterval(timer);
    }, [session, result]);

    useEffect(() => {
        if (session && !result && remaining === 0) void finish();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remaining]);

    const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

    const start = async () => {
        setBusy(true);
        setError('');
        try {
            const data = await publicQuizService.start(pin.trim(), fullName.trim());
            setSession(data);
            setRemaining(data.remaining_seconds || data.duration * 60);
        } catch (cause) {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || "Testni boshlab bo'lmadi");
        } finally {
            setBusy(false);
        }
    };

    const choose = async (questionId: number, index: number, multiple: boolean) => {
        if (!session || result) return;
        const previous = answers[questionId] ?? [];
        const positions = multiple
            ? (previous.includes(index)
                ? previous.filter((item) => item !== index)
                : [...previous, index].sort((a, b) => a - b))
            : [index];

        // Javob darhol serverga ketadi: brauzer yopilib qolsa ham yo'qolmaydi.
        setAnswers((prev) => ({ ...prev, [questionId]: positions }));
        if (positions.length === 0) return;
        try {
            await publicQuizService.answer(session.guest_token, questionId, positions);
        } catch (cause) {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || "Javobni saqlab bo'lmadi");
        }
    };

    const finish = async () => {
        if (!session || result) return;
        setBusy(true);
        try {
            setResult(await publicQuizService.finish(session.guest_token));
        } catch (cause) {
            const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || "Testni yakunlab bo'lmadi");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-sm sm:px-6">
                <img src={logo} alt={BRAND.shortName} className="h-8 w-8 rounded-lg object-contain" />
                <span className="text-sm font-semibold">{BRAND.appName}</span>
                {session && !result && (
                    <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                        <Clock className="h-4 w-4" /> {formatClock(remaining)}
                    </span>
                )}
            </header>

            <main className="mx-auto w-full max-w-3xl px-4 py-8">
                {result ? (
                    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-8 text-center">
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                            <CheckCircle2 className="h-7 w-7" />
                        </span>
                        <div>
                            <h1 className="text-xl font-bold">Test yakunlandi</h1>
                            <p className="mt-1 text-sm text-muted-foreground">{result.full_name} · {result.title}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-border/60 p-4">
                                <p className="text-2xl font-bold">{result.correct_answers}</p>
                                <p className="text-xs text-muted-foreground">To'g'ri javob</p>
                            </div>
                            <div className="rounded-xl border border-border/60 p-4">
                                <p className="text-2xl font-bold">{result.wrong_answers}</p>
                                <p className="text-xs text-muted-foreground">Noto'g'ri</p>
                            </div>
                            <div className="rounded-xl border border-border/60 p-4">
                                <p className="text-2xl font-bold text-primary">{result.grade}</p>
                                <p className="text-xs text-muted-foreground">Baho</p>
                            </div>
                        </div>
                    </div>
                ) : session ? (
                    <div className="space-y-6">
                        <div>
                            <h1 className="text-xl font-bold">{session.title}</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {answeredCount} / {session.questions.length} savolga javob berildi
                            </p>
                        </div>

                        {session.questions.map((question, questionIndex) => (
                            <div key={question.id} className="rounded-2xl border border-border/60 bg-card p-5">
                                <p className="mb-4 font-medium">
                                    <span className="mr-2 text-muted-foreground">{questionIndex + 1}.</span>
                                    <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.text) }} />
                                </p>
                                {question.multiple && (
                                    <p className="mb-2 text-xs text-muted-foreground">
                                        Bir nechta javob to'g'ri — hammasini belgilang.
                                    </p>
                                )}
                                <div className="grid gap-2">
                                    {(question.options?.length
                                        ? question.options
                                        : [question.option_a, question.option_b, question.option_c, question.option_d]
                                    ).map((option, index) => {
                                        const selected = (answers[question.id] ?? []).includes(index);
                                        return (
                                            <button
                                                key={index}
                                                type="button"
                                                onClick={() => void choose(question.id, index, Boolean(question.multiple))}
                                                className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                                                    selected
                                                        ? 'border-primary bg-primary/[0.06] text-foreground'
                                                        : 'border-border/60 hover:border-primary/40 hover:bg-muted/40'
                                                }`}
                                            >
                                                <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(option) }} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {error && <p className="text-sm text-destructive">{error}</p>}

                        <div className="flex justify-end">
                            <Button onClick={() => void finish()} disabled={busy}>
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Testni yakunlash
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border/60 bg-card p-8">
                        <div className="space-y-1 text-center">
                            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <BookOpen className="h-6 w-6" />
                            </span>
                            <h1 className="text-lg font-bold">Ochiq test</h1>
                            <p className="text-sm text-muted-foreground">
                                Tizimga kirish shart emas — PIN va ismingizni kiriting.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">F.I.Sh.</label>
                            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Familiya Ism Sharif" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">PIN</label>
                            <Input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Test PIN kodi" />
                        </div>

                        {error && <p className="text-sm text-destructive">{error}</p>}

                        <Button
                            className="w-full"
                            onClick={() => void start()}
                            disabled={busy || fullName.trim().length < 3 || !pin.trim()}
                        >
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Testni boshlash
                        </Button>
                    </div>
                )}
            </main>
        </div>
    );
}
