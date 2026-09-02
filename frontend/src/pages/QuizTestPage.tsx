import { toast } from 'sonner';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { logger } from '@/utils/logger';
import { useAuth } from '@/context/AuthContext';
import { type StartQuizResponse, type EndQuizResponse } from '@/services/quizProcessService';
import type { ProctoringMode } from '@/services/quizService';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
    Loader2,
    PlayCircle,
    ChevronLeft,
    ChevronRight,
    CheckCircle,
    XCircle,
    Trophy,
    Clock,
    ArrowLeft,
    AlertTriangle
} from 'lucide-react';
import { useStartQuiz, useSubmitAnswer, useEndQuiz } from '@/hooks/useQuizProcess';
import { useActiveQuizzes } from '@/hooks/useQuizzes';
import { Modal } from '@/components/ui/Modal';
import { QuizVideoMonitoring } from '@/components/QuizVideoMonitoring';
import { ENABLE_QUIZ_PROCTORING, FACE_DETECTION_SERVICE_URL } from '@/config/env';
import { useCameraAvailability } from '@/hooks/useCameraAvailability';
import { cheatingImageService } from '@/services/cheatingImageService';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
// Bug#13 fix: sanitize HTML content to prevent XSS attacks.
// Общая реализация в utils/sanitize — список вывода HTML шире одной страницы.
import { sanitizeHtml } from '@/utils/sanitize';

type QuizPhase = 'start' | 'quiz' | 'results';


/** Test topshirish paytida sidebar ko'rinmasin — sahifa butun ekranni egallaydi.
 *
 *  Оверлей рендерится порталом в <body>, а не по месту в дереве страницы:
 *  `position: fixed` считает размеры от ближайшего предка с transform/filter,
 *  а не от вьюпорта. Обёртка анимации перехода между страницами таким предком
 *  и была — оверлей получал нулевую высоту, `overflow-y-auto` срезал тест, и
 *  студент видел белый экран (см. комментарий у `pageEnter` в index.css).
 *  Портал делает оверлей независимым от любых стилей предков. */
const FocusOverlay = ({ children }: { children: React.ReactNode }) => createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">{children}</div>
    </div>,
    document.body,
);

const QuizTestPage = () => {
    const { user } = useAuth();

    // Phase management
    const [phase, setPhase] = useState<QuizPhase>('start');

    // Start phase
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const { data: quizzesData, isLoading: isLoadingQuizzes, isFetching: isFetchingQuizzes, isError: isQuizzesError } = useActiveQuizzes(currentPage, pageSize);
    const [selectedQuiz, setSelectedQuiz] = useState<{ id: number; title: string } | null>(null);
    const [pin, setPin] = useState('');
    const [startError, setStartError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Quiz phase
    const [quizData, setQuizData] = useState<StartQuizResponse | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // Javoblar — ko'rsatilgan variantlarning o'rinlari. Bir nechta to'g'ri
    // javobli savolda bir nechta o'rin bo'ladi, shuning uchun har doim ro'yxat.
    const [answers, setAnswers] = useState<Record<number, number[]>>({});
    // Matnli javoblar alohida saqlanadi: ular o'rin emas, matn.
    const [textAnswers, setTextAnswers] = useState<Record<number, string>>({});
    const [timeLeft, setTimeLeft] = useState(0);

    // Cheating detection
    const [cheatingDetected, setCheatingDetected] = useState(false);
    const [cheatingReason, setCheatingReason] = useState('Multiple faces detected');
    const [cheatingImageUrl, setCheatingImageUrl] = useState<string | undefined>(undefined);

    // Results phase
    const [results, setResults] = useState<EndQuizResponse | null>(null);

    const isAdmin = user?.roles?.some(role => role.name.toLowerCase() === 'admin');

    const startQuizMutation = useStartQuiz();
    const submitAnswerMutation = useSubmitAnswer();
    const endQuizMutation = useEndQuiz();


    const handleOpenStartModal = (quiz: { id: number; title: string }) => {
        setSelectedQuiz(quiz);
        setPin('');
        setStartError('');
        setProctoringOverride(null);
        setIsModalOpen(true);
    };

    const [searchParams, setSearchParams] = useSearchParams();
    const quizIdParam = searchParams.get('quizId');
    const modeParam = searchParams.get('mode');
    const [proctoringOverride, setProctoringOverride] = useState<ProctoringMode | null>(null);

    // Наличие камеры проверяется до начала теста: раньше тест с режимом `face`
    // просто шёл без надзора, и ни студент, ни преподаватель об этом не знали.
    const selectedQuizMode = quizzesData?.quizzes.find((q) => q.id === selectedQuiz?.id)?.proctoring_mode;
    const startNeedsCamera = ENABLE_QUIZ_PROCTORING && (proctoringOverride ?? selectedQuizMode) === 'face';
    const { status: cameraStatus } = useCameraAvailability(isModalOpen && startNeedsCamera);

    const autoOpenedRef = useRef(false);
    useEffect(() => {
        if (autoOpenedRef.current || !quizIdParam) return;
        const quiz = quizzesData?.quizzes.find((q) => q.id === Number(quizIdParam));
        if (quiz) {
            autoOpenedRef.current = true;
            handleOpenStartModal({ id: quiz.id, title: quiz.title });
            if (modeParam === 'face' || modeParam === 'standard') {
                setProctoringOverride(modeParam);
            }
            searchParams.delete('quizId');
            searchParams.delete('mode');
            setSearchParams(searchParams, { replace: true });
        }
    }, [quizIdParam, modeParam, quizzesData, searchParams, setSearchParams]);

    const handleCloseStartModal = () => {
        setIsModalOpen(false);
        setSelectedQuiz(null);
        setPin('');
        setStartError('');
    };

    const handleStartQuiz = () => {
        if (!selectedQuiz || !pin) {
            setStartError('PIN kodni kiriting');
            return;
        }

        setStartError('');
        startQuizMutation.mutate({
            quiz_id: selectedQuiz.id,
            pin,
        }, {
            onSuccess: (data) => {
                setQuizData(data);
                // Остаток времени считает сервер от момента создания попытки, поэтому
                // перезагрузка страницы больше не выдаёт полный запас заново.
                setTimeLeft(data.remaining_seconds);
                setCurrentQuestionIndex(0);
                // При возвращении в прерванную попытку восстанавливаем отметки,
                // иначе студент увидит пустой бланк и станет отвечать заново.
                const restored: Record<number, number[]> = {};
                const restoredText: Record<number, string> = {};
                for (const submitted of data.submitted_answers ?? []) {
                    if (submitted.text_answer) {
                        restoredText[submitted.question_id] = submitted.text_answer;
                        continue;
                    }
                    const positions = submitted.answer_indexes?.length
                        ? submitted.answer_indexes
                        : [submitted.answer_index];
                    restored[submitted.question_id] = positions;
                }
                setAnswers(restored);
                setTextAnswers(restoredText);
                setPhase('quiz');
                handleCloseStartModal();
            },
            onError: (error: any) => {
                const message = error.response?.data?.detail || error.response?.data?.message || 'Testni boshlashda xatolik yuz berdi. PIN kodni tekshiring.';
                setStartError(typeof message === 'string' ? message : 'Testni boshlashda xatolik.');
            }
        });
    };

    // Matn yozilgach avtomatik yuboriladi: talaba javobni yozib, darhol
    // «Yakunlash» ni bosishi mumkin — fokusni yo'qotishni kutib bo'lmaydi.
    const textTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    const handleTextAnswer = (questionId: number, value: string) => {
        setTextAnswers((prev) => ({ ...prev, [questionId]: value }));
        clearTimeout(textTimers.current[questionId]);
        textTimers.current[questionId] = setTimeout(() => {
            submitTextAnswer(questionId, value);
        }, 800);
    };

    const submitTextAnswer = (questionId: number, value: string) => {
        if (!quizData) return;
        submitAnswerMutation.mutate({
            result_id: quizData.result_id,
            question_id: questionId,
            answer_index: 0,
            text_answer: value,
        }, {
            onError: (error) => {
                logger.error('Failed to submit answer', error);
            },
        });
    };

    const handleSelectAnswer = (questionId: number, position: number) => {
        if (!quizData) return;
        const question = quizData.questions.find((q) => q.id === questionId);
        if (!question) return;

        // Tanlov turi bo'yicha: tartib savolida navbat, bir nechta javobli
        // savolda to'plam, oddiy savolda bittasi ikkinchisini almashtiradi.
        const previous = answers[questionId] ?? [];
        const positions = question.ordered
            ? (previous.includes(position)
                ? previous.filter((item) => item !== position)
                : [...previous, position])
            : question.multiple
                ? (previous.includes(position)
                    ? previous.filter((item) => item !== position)
                    : [...previous, position].sort((a, b) => a - b))
                : [position];

        setAnswers((prev) => ({ ...prev, [questionId]: positions }));

        // Bo'sh tanlov serverga yuborilmaydi: javobni «olib tashlash» yo'li yo'q,
        // keyingi bosishda to'g'ri to'plam ketadi.
        if (positions.length === 0) return;

        // Отправляется позиция варианта, а не его текст: сервер сам знает, какой
        // порядок показал этому студенту, и сравнивает по позиции. Текст варианта
        // в проверку правильности больше не попадает.
        submitAnswerMutation.mutate({
            result_id: quizData.result_id,
            question_id: questionId,
            answer_index: positions[0],
            answer_indexes: (question.multiple || question.ordered) ? positions : undefined,
        }, {
            onError: (error) => {
                logger.error('Failed to submit answer', error);
            },
        });
    };

    const handleSubmit = useCallback((isCheatingOverride?: boolean, reasonOverride?: string, imageUrlOverride?: string) => {
        if (!quizData || endQuizMutation.isPending) return;

        // Kutayotgan matnli javoblar yakunlashdan oldin yuboriladi.
        for (const [questionId, timer] of Object.entries(textTimers.current)) {
            clearTimeout(timer);
            const value = textAnswers[Number(questionId)];
            if (value?.trim()) submitTextAnswer(Number(questionId), value);
        }

        const isCurrentlyCheating = isCheatingOverride ?? cheatingDetected;
        const currentReason = reasonOverride ?? (isCurrentlyCheating ? cheatingReason : undefined);
        const currentImageUrl = imageUrlOverride ?? (isCurrentlyCheating ? cheatingImageUrl : undefined);
        const totalQuestions = quizData.questions.length;

        // Answers were already sent one-by-one via submit_answer as the student
        // picked them — end_quiz only finalizes the attempt now.
        endQuizMutation.mutate({
            quiz_id: quizData.quiz_id,
            result_id: quizData.result_id,
            cheating_detected: isCurrentlyCheating,
            reason: isCurrentlyCheating ? currentReason : undefined,
            cheating_image_url: currentImageUrl,
        }, {
            onSuccess: (data) => {
                setResults(data);
                setPhase('results');
            },
            onError: (error: any) => {
                logger.error('Failed to submit quiz', error);

                // If it was a cheating submission, we still want to show the results phase
                // even if the backend call failed (e.g., due to duplicate submission)
                if (isCurrentlyCheating) {
                    setResults({
                        total_questions: totalQuestions,
                        correct_answers: 0,
                        wrong_answers: totalQuestions,
                        grade: 2,
                        cheating_detected: true,
                        reason: currentReason || 'Ko\'p juzli shaxs aniqlandi'
                    });
                    setPhase('results');
                } else {
                    toast.error('Testni yuborishda xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
                }
            }
        });
        // Bug#4 fix: added cheatingImageUrl to dependency list to avoid stale closure
    }, [quizData, endQuizMutation, cheatingDetected, cheatingReason, cheatingImageUrl]);

    // Timer — Bug#12 fix: use a ref to prevent duplicate submit on cheating race condition
    const isSubmittingRef = useRef(false);
    useEffect(() => {
        if (phase !== 'quiz' || timeLeft <= 0 || cheatingDetected) return;

        const timer = setInterval(() => {
            setTimeLeft((prev: number) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [phase, timeLeft, cheatingDetected, handleSubmit]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleRestart = useCallback(() => {
        // We use window.location.reload() to ensure a completely fresh state 
        // when starting a new quiz session, which solves issues with state lingering.
        window.location.reload();
    }, []);

    const handleDifferentPersonDetected = useCallback(async (imageData: string) => {
        // Bug#12 fix: guard against race condition where both timer & cheating trigger submit
        if (cheatingDetected || isSubmittingRef.current) return;
        isSubmittingRef.current = true;

        setCheatingDetected(true);
        const reason = 'Different person detected';
        setCheatingReason(reason);

        if (quizData && user) {
            try {
                const response = await cheatingImageService.uploadCheatingImage({
                    quiz_id: quizData.quiz_id,
                    user_id: user.id || null,
                    image_data: imageData,
                });
                if (response.success && response.image_url) {
                    setCheatingImageUrl(response.image_url);
                    handleSubmit(true, reason, response.image_url);
                } else {
                    handleSubmit(true, reason);
                }
            } catch (error) {
                logger.error('Failed to upload cheating evidence:', error);
                handleSubmit(true, reason);
            }
        } else {
            handleSubmit(true, reason);
        }
    }, [quizData, user, handleSubmit, cheatingDetected]);

    // ================================
    // START PHASE
    // ================================
    if (phase === 'start') {
        const activeQuizzes = quizzesData?.quizzes || [];
        const totalPages = quizzesData ? Math.ceil(quizzesData.total / pageSize) : 1;

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Test ishlash</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Ishlash uchun testlarni tanlang
                        </p>
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        {isLoadingQuizzes ? (
                            <div className="flex h-40 items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            </div>
                        ) : isQuizzesError ? (
                            <p className="py-8 text-center text-sm text-destructive">Xatolik yuz berdi</p>
                        ) : activeQuizzes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                                <PlayCircle className="h-12 w-12 mb-4 opacity-20" />
                                <h3 className="text-lg font-semibold">Faol testlar mavjud emas</h3>
                                <p>Hozircha ishlash uchun testlar yo'q.</p>
                            </div>
                        ) : (
                            <>
                                {/* Десктоп: таблица */}
                                <div className="hidden md:block">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Test nomi</TableHead>
                                                <TableHead>Savollar soni</TableHead>
                                                <TableHead>Davomiyligi</TableHead>
                                                <TableHead>Holati</TableHead>
                                                <TableHead className="text-right">Amal</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {activeQuizzes.map((quiz) => (
                                                <TableRow key={quiz.id} className={cn(!quiz.is_active && "opacity-60")}>
                                                    <TableCell className="font-medium">{quiz.title}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Trophy className="h-4 w-4 text-muted-foreground" />
                                                            <span>{quiz.question_number} ta savol</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                                            <span>{quiz.duration} daqiqa</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={cn(
                                                            "badge",
                                                            quiz.is_active ? "badge-success" : "badge-muted"
                                                        )}>
                                                            {quiz.is_active ? 'Faol' : 'Faol emas'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant={quiz.is_active ? "primary" : "outline"}
                                                            onClick={() => handleOpenStartModal(quiz)}
                                                            disabled={!quiz.is_active}
                                                        >
                                                            <PlayCircle className="mr-2 h-4 w-4" />
                                                            {quiz.is_active ? 'Ishlash' : 'Yopiq'}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                {/* Мобильные: карточки с крупной кнопкой */}
                                <div className="flex flex-col gap-3 p-4 md:hidden">
                                    {activeQuizzes.map((quiz) => (
                                        <div
                                            key={quiz.id}
                                            className={cn(
                                                "rounded-xl border border-border bg-background p-4",
                                                !quiz.is_active && "opacity-60"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="font-medium text-foreground">{quiz.title}</p>
                                                <span className={cn("badge shrink-0", quiz.is_active ? "badge-success" : "badge-muted")}>
                                                    {quiz.is_active ? 'Faol' : 'Faol emas'}
                                                </span>
                                            </div>
                                            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                                                <span className="flex items-center gap-1.5">
                                                    <Trophy className="h-3.5 w-3.5" />
                                                    {quiz.question_number} savol
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {quiz.duration} daqiqa
                                                </span>
                                            </div>
                                            <Button
                                                className="mt-3 w-full"
                                                variant={quiz.is_active ? "primary" : "outline"}
                                                onClick={() => handleOpenStartModal(quiz)}
                                                disabled={!quiz.is_active}
                                            >
                                                <PlayCircle className="mr-2 h-4 w-4" />
                                                {quiz.is_active ? 'Ishlash' : 'Yopiq'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {totalPages > 1 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        isLoading={isFetchingQuizzes}
                    />
                )}

                <Modal
                    isOpen={isModalOpen}
                    onClose={handleCloseStartModal}
                    title={`Testni boshlash: ${selectedQuiz?.title}`}
                >
                    <div className="space-y-4">
                        {startNeedsCamera && cameraStatus !== 'checking' && cameraStatus !== 'available' && (
                            <div className="flex gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>
                                    {cameraStatus === 'missing' &&
                                        'Bu kompyuterda veb-kamera topilmadi. Bu test kamera orqali nazorat qilinadi — o‘qituvchiga murojaat qiling.'}
                                    {cameraStatus === 'insecure' &&
                                        'Kamera ishlamaydi: sahifa xavfsiz ulanish (https) orqali ochilmagan. Administratorga murojaat qiling.'}
                                    {cameraStatus === 'error' &&
                                        'Veb-kamerani tekshirib bo‘lmadi. Test kamera bilan nazorat qilinadi.'}
                                </span>
                            </div>
                        )}
                        <Input
                            label="PIN Kod"
                            type="text"
                            value={pin}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
                            placeholder="PIN kodni kiriting"
                            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleStartQuiz()}
                            autoFocus
                        />
                        {startError && (
                            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {startError}
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={handleCloseStartModal}>
                                Bekor qilish
                            </Button>
                            <Button
                                onClick={handleStartQuiz}
                                isLoading={startQuizMutation.isPending}
                            >
                                Boshlash
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        );
    }

    // ================================
    // RESULTS PHASE
    // ================================
    if (phase === 'results' && results) {
        const percentage = results.total_questions > 0
            ? Math.round((results.correct_answers / results.total_questions) * 100)
            : 0;

        const gradeColor =
            results.grade === 5 ? 'text-success' :
                (results.grade === 4 || results.grade === 3) ? 'text-warning' :
                    'text-destructive';

        const showCheatingAlert = results.cheating_detected || false;

        return (
            <FocusOverlay>
            <div className="flex items-center justify-center min-h-[80vh]">
                <Card className="w-full max-w-lg">
                    {showCheatingAlert && (
                        <div className="bg-destructive/10 border-b border-destructive/20 px-6 py-4">
                            <div className="flex gap-3">
                                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-semibold text-destructive">Test to'xtatildi</h3>
                                    <p className="text-sm text-destructive/80 mt-1">
                                        {results.reason || 'Ko\'p juzli shaxs aniqlandi. Test to\'xtatildi.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    <CardHeader className="text-center">
                        <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${showCheatingAlert ? 'bg-destructive/15' : 'bg-primary/10'}`}>
                            {showCheatingAlert ? (
                                <AlertTriangle className="h-10 w-10 text-destructive" />
                            ) : (
                                <Trophy className="h-10 w-10 text-primary" />
                            )}
                        </div>
                        <CardTitle className="text-2xl">
                            {showCheatingAlert ? 'Test bekor qilindi' : 'Test yakunlandi!'}
                        </CardTitle>
                        <p className="text-muted-foreground mt-1">{quizData?.title}</p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {/* Grade Circle */}
                            <div className="flex justify-center">
                                <div className={`font-display text-6xl font-bold ${showCheatingAlert ? 'text-destructive' : gradeColor}`}>
                                    {results.grade}
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="rounded-lg bg-muted p-4 text-center">
                                    <div className="text-2xl font-bold">{results.total_questions}</div>
                                    <div className="text-xs text-muted-foreground mt-1">Jami</div>
                                </div>
                                <div className="rounded-lg bg-success/10 p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <CheckCircle className="h-4 w-4 text-success" />
                                        <span className="text-2xl font-bold text-success">{results.correct_answers}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">To'g'ri</div>
                                </div>
                                <div className="rounded-lg bg-destructive/10 p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <XCircle className="h-4 w-4 text-destructive" />
                                        <span className="text-2xl font-bold text-destructive">{results.wrong_answers}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">Noto'g'ri</div>
                                </div>
                            </div>

                            {/* Progress bar */}
                            {!showCheatingAlert && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Natija foizi</span>
                                        <span className="font-medium">{percentage}%</span>
                                    </div>
                                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <Button type="button" className="w-full" onClick={handleRestart}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Boshqa test ishlash
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
            </FocusOverlay>
        );
    }

    // ================================
    // QUIZ PHASE
    // ================================
    if (!quizData) return null;

    const currentQuestion = quizData.questions[currentQuestionIndex];
    const totalQuestions = quizData.questions.length;
    const answeredCount = new Set([
        ...Object.entries(answers).filter(([, positions]) => positions.length > 0).map(([id]) => id),
        ...Object.entries(textAnswers).filter(([, text]) => text.trim()).map(([id]) => id),
    ]).size;
    const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
    const isFirstQuestion = currentQuestionIndex === 0;
    const selectedPositions = answers[currentQuestion.id] ?? [];

    // Variantlar serverdan ko'rsatilgan tartibda keladi. Eski javob shakli
    // (`option_a..d`) zaxira sifatida qoladi: test yangilanishdan oldin
    // boshlangan bo'lishi mumkin.
    const optionTexts = currentQuestion.options?.length
        ? currentQuestion.options
        : [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d];
    const options = optionTexts.map((value, index) => ({
        key: String.fromCharCode(65 + index),
        value,
        index,
    }));
    const isMultiple = Boolean(currentQuestion.multiple);
    const isOrdered = Boolean(currentQuestion.ordered);
    const isFreeText = Boolean(currentQuestion.free_text);

    const timeWarning = timeLeft < 60;

    const effectiveProctoringMode = proctoringOverride ?? quizData.proctoring_mode;
    const shouldProctor = effectiveProctoringMode === 'face';

    return (
        <FocusOverlay>
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Video Monitoring Component */}
            {shouldProctor && (
                <QuizVideoMonitoring
                    active={phase === 'quiz' && !cheatingDetected}
                    onCheatingDetected={handleDifferentPersonDetected}
                    onDifferentPersonDetected={handleDifferentPersonDetected}
                    faceDetectionServiceUrl={FACE_DETECTION_SERVICE_URL}
                    token={quizData.face_ws_token}
                    imageUrl={quizData.image_url}
                />
            )}

            {/* Header with timer and progress — на мобильных складывается в колонку */}
            <div className="flex flex-col gap-3 bg-card p-4 rounded-xl shadow-sm border border-border sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">{quizData.title}</h1>
                        <p className="text-sm text-muted-foreground">
                            Savol: {currentQuestionIndex + 1} / {totalQuestions} • {answeredCount} javob berildi
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                    {isAdmin && (
                        <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                            <span className="text-[10px] font-bold text-primary uppercase leading-none">
                                Rejim: {shouldProctor ? 'Kamera bilan' : 'Standart'}
                            </span>
                        </div>
                    )}

                    <div className={cn(
                        "flex items-center gap-2 rounded-xl px-4 py-2 text-lg font-mono font-bold transition-all duration-300 shadow-sm",
                        timeWarning ? "bg-destructive text-destructive-foreground animate-pulse shadow-lg shadow-destructive/30" : "bg-muted text-foreground"
                    )}>
                        <Clock className={cn("h-5 w-5", timeWarning ? "animate-spin-slow" : "")} />
                        {formatTime(timeLeft)}
                    </div>
                </div>
            </div>

            {/* Question navigation dots */}
            <div className="flex flex-wrap gap-2">
                {quizData.questions.map((q, index) => {
                    const isAnswered = (answers[q.id]?.length ?? 0) > 0 || Boolean(textAnswers[q.id]?.trim());
                    const isCurrent = index === currentQuestionIndex;
                    return (
                        <button
                            key={q.id}
                            onClick={() => setCurrentQuestionIndex(index)}
                            className={cn(
                                "h-8 w-8 rounded-full text-xs font-semibold transition-all duration-200",
                                isCurrent
                                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_color-mix(in_srgb,var(--primary)_50%,transparent)] scale-105"
                                    : isAnswered
                                        ? "bg-success/15 text-success border border-success/30"
                                        : "bg-card border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                        >
                            {index + 1}
                        </button>
                    );
                })}
            </div>

            {/* Question Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                            {currentQuestionIndex + 1}
                        </span>
                        <div
                            className="text-lg font-medium leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentQuestion.text) }}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                        {isMultiple && (
                            <p className="text-xs text-muted-foreground">
                                Bir nechta javob to'g'ri — hammasini belgilang. Ball to'liq mos kelganda beriladi.
                            </p>
                        )}
                        {isOrdered && (
                            <p className="text-xs text-muted-foreground">
                                Bo'laklarni to'g'ri tartibda bosing. Qayta bossangiz, navbatdan chiqadi.
                            </p>
                        )}
                        {isFreeText && (
                            <input
                                value={textAnswers[currentQuestion.id] ?? ''}
                                onChange={(event) => handleTextAnswer(currentQuestion.id, event.target.value)}
                                onBlur={(event) => submitTextAnswer(currentQuestion.id, event.target.value)}
                                placeholder="Javobingizni yozing"
                                className="h-11 w-full rounded-xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-ring"
                            />
                        )}
                        {!isFreeText && options.map((option) => {
                            const isSelected = selectedPositions.includes(option.index);
                            return (
                                <button
                                    key={option.key}
                                    onClick={() => handleSelectAnswer(currentQuestion.id, option.index)}
                                    className={cn(
                                        "group flex items-start gap-3 rounded-2xl border p-4 text-left cursor-pointer transition-all duration-150 active:scale-[0.99]",
                                        isSelected
                                            ? "border-primary bg-primary/10 shadow-sm shadow-primary/20 scale-[1.005] ring-2 ring-primary/20"
                                            : "border-border/70 bg-card hover:border-primary/40 hover:bg-primary/[0.03]"
                                    )}
                                >
                                    <span className={cn(
                                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-transform duration-150",
                                        isSelected
                                            ? "bg-primary text-primary-foreground scale-110 shadow-xs"
                                            : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                                    )}>
                                        {isOrdered && isSelected
                                            ? (selectedPositions.indexOf(option.index) + 1)
                                            : option.key}
                                    </span>
                                    <span
                                        className="pt-0.5 text-foreground leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(option.value) }}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    onClick={() => setCurrentQuestionIndex((prev: number) => prev - 1)}
                    disabled={isFirstQuestion}
                >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Oldingi
                </Button>

                <div className="flex gap-2">
                    {isLastQuestion ? (
                        <Button
                            onClick={() => handleSubmit()}
                            isLoading={endQuizMutation.isPending}
                            disabled={answeredCount === 0}
                        >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Testni yakunlash ({answeredCount}/{totalQuestions})
                        </Button>
                    ) : (
                        <Button
                            onClick={() => setCurrentQuestionIndex((prev: number) => prev + 1)}
                        >
                            Keyingi
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
        </FocusOverlay>
    );
};

export default QuizTestPage;
