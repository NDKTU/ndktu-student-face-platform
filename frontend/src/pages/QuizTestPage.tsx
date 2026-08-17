import { useState, useEffect, useCallback, useRef } from 'react';
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
import { cn } from '@/utils/utils';
// Bug#13 fix: sanitize HTML content to prevent XSS attacks.
// Общая реализация в utils/sanitize — список вывода HTML шире одной страницы.
import { sanitizeHtml } from '@/utils/sanitize';

type QuizPhase = 'start' | 'quiz' | 'results';

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
    const [answers, setAnswers] = useState<Record<number, string>>({});
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
                const restored: Record<number, string> = {};
                for (const submitted of data.submitted_answers ?? []) {
                    const letter = ['A', 'B', 'C', 'D'][submitted.answer_index];
                    if (letter) restored[submitted.question_id] = letter;
                }
                setAnswers(restored);
                setPhase('quiz');
                handleCloseStartModal();
            },
            onError: (error: any) => {
                const message = error.response?.data?.detail || error.response?.data?.message || 'Testni boshlashda xatolik yuz berdi. PIN kodni tekshiring.';
                setStartError(typeof message === 'string' ? message : 'Testni boshlashda xatolik.');
            }
        });
    };

    const handleSelectAnswer = (questionId: number, option: string) => {
        setAnswers((prev: Record<number, string>) => ({ ...prev, [questionId]: option }));

        if (!quizData) return;
        const question = quizData.questions.find((q) => q.id === questionId);
        if (!question) return;

        // Отправляется позиция варианта, а не его текст: сервер сам знает, какой
        // порядок показал этому студенту, и сравнивает по позиции. Текст варианта
        // в проверку правильности больше не попадает.
        const answerIndex = ['A', 'B', 'C', 'D'].indexOf(option);
        if (answerIndex === -1) return;

        // Sent immediately as the student picks — the backend already reserved
        // this question for this attempt at start_quiz, and grades it right away.
        submitAnswerMutation.mutate({
            result_id: quizData.result_id,
            question_id: questionId,
            answer_index: answerIndex,
        }, {
            onError: (error) => {
                logger.error('Failed to submit answer', error);
            },
        });
    };

    const handleSubmit = useCallback((isCheatingOverride?: boolean, reasonOverride?: string, imageUrlOverride?: string) => {
        if (!quizData || endQuizMutation.isPending) return;

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
                    alert('Testni yuborishda xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
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
                                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                                    quiz.is_active
                                                        ? "bg-green-600 text-white dark:bg-green-500 dark:text-white"
                                                        : "bg-muted text-muted-foreground"
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
                            <div className="flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
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
            results.grade === 5 ? 'text-green-600' :
                (results.grade === 4 || results.grade === 3) ? 'text-yellow-600' :
                    'text-red-600';

        const showCheatingAlert = results.cheating_detected || false;

        return (
            <div className="flex items-center justify-center min-h-[80vh]">
                <Card className="w-full max-w-lg">
                    {showCheatingAlert && (
                        <div className="bg-red-50 border-b border-red-200 px-6 py-4">
                            <div className="flex gap-3">
                                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-semibold text-red-900">Test to'xtatildi</h3>
                                    <p className="text-sm text-red-700 mt-1">
                                        {results.reason || 'Ko\'p juzli shaxs aniqlandi. Test to\'xtatildi.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    <CardHeader className="text-center">
                        <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${showCheatingAlert ? 'bg-red-100' : 'bg-primary/10'}`}>
                            {showCheatingAlert ? (
                                <AlertTriangle className="h-10 w-10 text-red-600" />
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
                                <div className={`text-6xl font-bold ${showCheatingAlert ? 'text-red-600' : gradeColor}`}>
                                    {results.grade}
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="rounded-lg bg-muted p-4 text-center">
                                    <div className="text-2xl font-bold">{results.total_questions}</div>
                                    <div className="text-xs text-muted-foreground mt-1">Jami</div>
                                </div>
                                <div className="rounded-lg bg-green-50 p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-2xl font-bold text-green-600">{results.correct_answers}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">To'g'ri</div>
                                </div>
                                <div className="rounded-lg bg-red-50 p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <XCircle className="h-4 w-4 text-red-600" />
                                        <span className="text-2xl font-bold text-red-600">{results.wrong_answers}</span>
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
        );
    }

    // ================================
    // QUIZ PHASE
    // ================================
    if (!quizData) return null;

    const currentQuestion = quizData.questions[currentQuestionIndex];
    const totalQuestions = quizData.questions.length;
    const answeredCount = Object.keys(answers).length;
    const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
    const isFirstQuestion = currentQuestionIndex === 0;
    const selectedAnswer = answers[currentQuestion.id];

    const options = [
        { key: 'A', value: currentQuestion.option_a },
        { key: 'B', value: currentQuestion.option_b },
        { key: 'C', value: currentQuestion.option_c },
        { key: 'D', value: currentQuestion.option_d },
    ];

    const timeWarning = timeLeft < 60;

    const effectiveProctoringMode = proctoringOverride ?? quizData.proctoring_mode;
    const shouldProctor = effectiveProctoringMode === 'face';

    return (
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

            {/* Header with timer and progress */}
            <div className="flex items-center justify-between bg-card p-4 rounded-xl shadow-sm border border-border">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{quizData.title}</h1>
                        <p className="text-sm text-muted-foreground">
                            Savol: {currentQuestionIndex + 1} / {totalQuestions} • {answeredCount} javob berildi
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {isAdmin && (
                        <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                            <span className="text-[10px] font-bold text-primary uppercase leading-none">
                                Rejim: {shouldProctor ? 'Kamera bilan' : 'Standart'}
                            </span>
                        </div>
                    )}

                    <div className={cn(
                        "flex items-center gap-2 rounded-xl px-4 py-2 text-lg font-mono font-bold transition-all duration-300 shadow-sm",
                        timeWarning ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200" : "bg-muted text-foreground"
                    )}>
                        <Clock className={cn("h-5 w-5", timeWarning ? "animate-spin-slow" : "")} />
                        {formatTime(timeLeft)}
                    </div>
                </div>
            </div>

            {/* Question navigation dots */}
            <div className="flex flex-wrap gap-2">
                {quizData.questions.map((q, index) => {
                    const isAnswered = !!answers[q.id];
                    const isCurrent = index === currentQuestionIndex;
                    return (
                        <button
                            key={q.id}
                            onClick={() => setCurrentQuestionIndex(index)}
                            className={cn(
                                "h-8 w-8 rounded-full text-xs font-semibold transition-all duration-200",
                                isCurrent
                                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.5)] scale-105"
                                    : isAnswered
                                        ? "bg-green-500/15 text-green-600 border border-green-500/30 dark:bg-green-500/10 dark:text-green-400"
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
                        {options.map((option) => {
                            const isSelected = selectedAnswer === option.key;
                            return (
                                <button
                                    key={option.key}
                                    onClick={() => handleSelectAnswer(currentQuestion.id, option.key)}
                                    className={cn(
                                        "flex items-start gap-3 rounded-xl border border-border/80 p-4 text-left transition-all duration-200",
                                        isSelected
                                            ? "border-primary bg-primary/5 shadow-[0_0_12px_rgba(99,102,241,0.05)]"
                                            : "border-border/60 hover:border-primary/30 hover:bg-accent/20"
                                    )}
                                >
                                    <span className={cn(
                                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-200",
                                        isSelected
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground"
                                    )}>
                                        {option.key}
                                    </span>
                                    <span
                                        className="pt-0.5"
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
    );
};

export default QuizTestPage;
