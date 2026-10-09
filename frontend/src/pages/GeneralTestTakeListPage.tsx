import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardCheck, Clock, ListOrdered, Play, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { scoreClass } from '@/components/generalTest/score';
import { MyGeneralTestResultList } from '@/components/generalTest/MyGeneralTestResultList';
import { StudentTestTabs } from '@/components/generalTest/StudentTestTabs';
import { studentElementarAttempt } from '@/components/generalTest/studentPaths';
import { useAvailableGeneralTests, useMyGeneralTestResults } from '@/hooks/useGeneralTests';
import { generalTestService, type AvailableTest } from '@/services/generalTestService';
import { apiErrorCode, apiErrorMessage } from '@/utils/apiError';
import { FaceEntryCamera } from '@/components/FaceEntryCamera';
import { useCameraAvailability } from '@/hooks/useCameraAvailability';
import { cn } from '@/lib/utils';

/** Xodimning shaxsiy natijalari — talabada ular «Natijalar» ichida. */
function MyResultsCard() {
    const { data: results } = useMyGeneralTestResults();
    if (!results?.length) return null;
    return (
        <Card>
            <CardHeader>
                <CardTitle>Mening natijalarim</CardTitle>
            </CardHeader>
            <CardContent>
                <MyGeneralTestResultList results={results} />
            </CardContent>
        </Card>
    );
}

/**
 * Elementar testni ishlash ro'yxati.
 *
 * `studentHub` — talaba ko'rinishi: sahifa «Test ishlash» ichidagi tab
 * (`/quiz-test/elementar`), urinish ham o'sha manzil ostida ochiladi,
 * natijalar esa «Natijalar» bo'limida.
 */
export default function GeneralTestTakeListPage({ studentHub = false }: { studentHub?: boolean }) {
    const navigate = useNavigate();
    const { data: tests, isLoading, isError, refetch } = useAvailableGeneralTests();
    const attemptPath = (attemptId: number) =>
        studentHub ? studentElementarAttempt(attemptId) : `/elementar-tests/attempt/${attemptId}`;
    const [startingId, setStartingId] = useState<number | null>(null);
    // Boshlash oynasi: PIN, kamera rejimi haqida ogohlantirish va kirishda yuz.
    // `resuming` — tugamagan urinishga qaytish: PIN so'ralmaydi, yuz esa so'raladi.
    const [dialog, setDialog] = useState<{ test: AvailableTest; resuming: boolean; faceStep: boolean } | null>(null);
    const [pin, setPin] = useState('');
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [faceResult, setFaceResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [verifying, setVerifying] = useState(false);
    const dialogMode = dialog?.test.proctoring_mode ?? 'standard';
    const { status: cameraStatus } = useCameraAvailability(Boolean(dialog) && dialogMode !== 'standard');

    const openDialog = (test: AvailableTest, resuming: boolean, faceStep = false) => {
        setPin('');
        setDialogError(null);
        setFaceResult(null);
        setDialog({ test, resuming, faceStep });
    };

    const begin = async (test: AvailableTest, resuming: boolean, inDialog: boolean, withPin?: string) => {
        setStartingId(test.id);
        try {
            const state = await generalTestService.start(test.id, withPin);
            setDialog(null);
            navigate(attemptPath(state.attempt_id));
        } catch (e) {
            // PIN to'g'ri, ruxsat bor — endi yuz (server shunday javob beradi).
            if (apiErrorCode(e) === 'face_verification_required') {
                setFaceResult(null);
                setDialogError(null);
                setDialog({ test, resuming, faceStep: true });
                return;
            }
            const message = apiErrorMessage(e, 'Testni boshlab bo\'lmadi');
            // Noto'g'ri PIN — oyna ochiq qoladi, talaba qayta yozadi.
            if (inDialog) setDialogError(message);
            else toast.error(message);
            refetch();
        } finally {
            setStartingId(null);
        }
    };

    const onStartClick = (test: AvailableTest, resuming: boolean) => {
        // Qaytishda oyna kerak emas: PIN so'ralmaydi, yuz kerak bo'lsa server aytadi.
        if (resuming) return begin(test, true, false);
        if (test.pin_required || (test.proctoring_mode ?? 'standard') !== 'standard') return openDialog(test, false);
        return begin(test, false, false);
    };

    const submitDialog = () => {
        if (!dialog) return;
        if (dialog.test.pin_required && !dialog.resuming && !pin.trim()) {
            setDialogError('PIN kodni kiriting');
            return;
        }
        begin(dialog.test, dialog.resuming, true, pin.trim() || undefined);
    };

    const captureFace = async (image: string) => {
        if (!dialog) return;
        setVerifying(true);
        setDialogError(null);
        try {
            const res = await generalTestService.verifyEntryFace(dialog.test.id, image, pin.trim() || undefined);
            setFaceResult({ ok: res.verified, text: res.message });
            if (res.verified) await begin(dialog.test, dialog.resuming, true, pin.trim() || undefined);
        } catch (e) {
            setFaceResult({ ok: false, text: apiErrorMessage(e, "Yuzni tekshirib bo'lmadi. Qayta urinib ko'ring.") });
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="space-y-6">
            {studentHub ? (
                <>
                    <PageHeader title="Test ishlash" description="Sizga biriktirilgan elementar testlar" />
                    <StudentTestTabs section="take" />
                </>
            ) : (
                <PageHeader title="Elementar testlar" description="Sizga biriktirilgan faol testlar" />
            )}

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
                                        onClick={() => onStartClick(test, resumable)}
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

            {!studentHub && <MyResultsCard />}
            <Modal isOpen={dialog !== null} onClose={() => setDialog(null)} title={`Testni boshlash: ${dialog?.test.title ?? ''}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        submitDialog();
                    }}
                >
                    {dialogMode === 'face' && (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                            Test davomida kamera yoqiladi va yuzingiz kuzatiladi. Kadrda boshqa odam paydo bo'lsa,
                            test to'xtatiladi.
                        </p>
                    )}
                    {dialogMode === 'face_entry' && !dialog?.faceStep && (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                            Bu testga kirishda yuzingiz profil suratingiz bilan solishtiriladi. Test davomida kamera ishlamaydi.
                        </p>
                    )}
                    {dialogMode !== 'standard' && cameraStatus !== 'checking' && cameraStatus !== 'available' && (
                        <div className="flex gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                                {cameraStatus === 'missing' &&
                                    "Bu qurilmada kamera topilmadi. Bu test kamera orqali nazorat qilinadi — o'qituvchiga murojaat qiling."}
                                {cameraStatus === 'insecure' &&
                                    'Kamera ishlamaydi: sahifa xavfsiz ulanish (https) orqali ochilmagan. Administratorga murojaat qiling.'}
                                {cameraStatus === 'error' && "Kamerani tekshirib bo'lmadi. Test kamera bilan nazorat qilinadi."}
                            </span>
                        </div>
                    )}
                    {dialog?.faceStep ? (
                        <FaceEntryCamera
                            onCapture={captureFace}
                            busy={verifying || startingId === dialog.test.id}
                            result={faceResult}
                        />
                    ) : (
                        dialog?.test.pin_required && !dialog.resuming && (
                            <Input
                                label="PIN kod"
                                inputMode="numeric"
                                autoComplete="off"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="O'qituvchi bergan PIN"
                                autoFocus
                            />
                        )
                    )}
                    {dialogError && (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{dialogError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                            Bekor qilish
                        </Button>
                        {!dialog?.faceStep && (
                            <Button type="submit" isLoading={startingId === dialog?.test.id}>
                                Boshlash
                            </Button>
                        )}
                    </div>
                </form>
            </Modal>
        </div>
    );
}
