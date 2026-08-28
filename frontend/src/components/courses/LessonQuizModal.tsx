import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useCreateQuiz, useUpdateQuiz } from '@/hooks/useQuizzes';
import { QUIZ_TYPE_LABELS } from '@/services/quizService';
import type { ProctoringMode, Quiz, QuizType } from '@/services/quizService';

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    lessonId: number;
    /** Berilgan bo'lsa — tahrirlash rejimi. */
    quiz?: Quiz | null;
}

/**
 * Dars sahifasidagi test oynasi.
 *
 * Guruh, fan va ma'ruzachi bu yerda so'ralmaydi: dars allaqachon guruhga va
 * o'qituvchi-fan juftligiga bog'langan, bekend `lesson_id` bo'yicha o'zi
 * to'ldiradi. Shuning uchun forma qisqa — o'qituvchi darsdan chiqmasdan test
 * tuzadi.
 */
export const LessonQuizModal = ({ isOpen, onClose, lessonId, quiz }: Props) => {
    const createMut = useCreateQuiz();
    const updateMut = useUpdateQuiz();

    const [quizType, setQuizType] = useState<QuizType>('LESSON_QUIZ');
    const [questionNumber, setQuestionNumber] = useState('10');
    const [duration, setDuration] = useState('30');
    const [pin, setPin] = useState('');
    const [proctoringMode, setProctoringMode] = useState<ProctoringMode>('standard');
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setQuizType(quiz?.quiz_type ?? 'LESSON_QUIZ');
        setQuestionNumber(String(quiz?.question_number ?? 10));
        setDuration(String(quiz?.duration ?? 30));
        setPin(quiz?.pin ?? Math.random().toString().slice(2, 6));
        setProctoringMode(quiz?.proctoring_mode ?? 'standard');
        setIsActive(quiz?.is_active ?? false);
        setError('');
    }, [isOpen, quiz]);

    const handleSubmit = () => {
        const questions = parseInt(questionNumber, 10);
        const minutes = parseInt(duration, 10);
        if (!questions || questions < 1) {
            setError("Savollar soni musbat son bo'lishi kerak");
            return;
        }
        if (!minutes || minutes < 1) {
            setError("Davomiylik musbat son bo'lishi kerak");
            return;
        }
        if (pin.trim().length < 4) {
            setError("PIN kamida 4 belgidan iborat bo'lsin");
            return;
        }

        setError('');
        const payload = {
            lesson_id: lessonId,
            question_number: questions,
            duration: minutes,
            pin: pin.trim(),
            quiz_type: quizType,
            is_active: isActive,
            proctoring_mode: proctoringMode,
        };

        const onError = (cause: unknown) => {
            // Bekend 409 da mazmunli xabar qaytaradi (savollar yetarli emas va h.k.).
            const response = (cause as { response?: { data?: { detail?: string | { message?: string } } } })?.response;
            const detail = response?.data?.detail;
            const message = typeof detail === 'string' ? detail : detail?.message;
            setError(message || 'Testni saqlashda xatolik yuz berdi');
        };

        if (quiz) {
            updateMut.mutate({ id: quiz.id, data: payload }, {
                onSuccess: () => {
                    toast.success('Test yangilandi');
                    onClose();
                },
                onError,
            });
        } else {
            createMut.mutate(payload, {
                onSuccess: () => {
                    toast.success('Test yaratildi');
                    onClose();
                },
                onError,
            });
        }
    };

    const isPending = createMut.isPending || updateMut.isPending;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={quiz ? 'Testni tahrirlash' : 'Dars testi'}>
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Nazorat turi</label>
                    <select
                        className={selectClassName}
                        value={quizType}
                        onChange={(e) => setQuizType(e.target.value as QuizType)}
                    >
                        {(Object.keys(QUIZ_TYPE_LABELS) as QuizType[]).map((value) => (
                            <option key={value} value={value}>{QUIZ_TYPE_LABELS[value]}</option>
                        ))}
                    </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Savollar soni</label>
                        <Input type="number" min={1} value={questionNumber} onChange={(e) => setQuestionNumber(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Davomiyligi (daqiqa)</label>
                        <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">PIN</label>
                    <Input value={pin} onChange={(e) => setPin(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Talaba testni shu PIN bilan boshlaydi.</p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Proktoring</label>
                    <select
                        className={selectClassName}
                        value={proctoringMode}
                        onChange={(e) => setProctoringMode(e.target.value as ProctoringMode)}
                    >
                        <option value="standard">Oddiy</option>
                        <option value="face">Yuz nazorati</option>
                    </select>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                    <div>
                        <p className="text-sm font-medium">Faol</p>
                        <p className="text-xs text-muted-foreground">
                            Faol testda ma'ruzachi bankida yetarli savol bo'lishi shart.
                        </p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>Bekor qilish</Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {quiz ? 'Saqlash' : 'Yaratish'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
