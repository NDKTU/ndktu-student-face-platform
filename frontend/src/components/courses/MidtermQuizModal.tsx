import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useCreateQuiz, useUpdateQuiz } from '@/hooks/useQuizzes';
import type { CourseGroupInfo } from '@/services/courseService';
import type { Lesson } from '@/services/lessonService';
import type { ProctoringMode, Quiz, QuizCreateRequest } from '@/services/quizService';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/date';

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    courseId: number;
    lessons: Lesson[];
    groups: CourseGroupInfo[];
    /** Yangi test uchun taklif qilinadigan nom: «2-oraliq nazorat». */
    defaultTitle: string;
    /** Berilgan bo'lsa — tahrirlash rejimi. */
    quiz?: Quiz | null;
}

/**
 * Oraliq nazorat oynasi.
 *
 * Savollar o'qituvchi tanlagan darslardan olinadi: oraliq nazorat odatda
 * semestrning bir qismini (masalan, 1–6-mavzular) qamraydi. Testning
 * o'ziga alohida savol qo'shish — ro'yxatdagi kartochkada.
 *
 * Fan va ma'ruzachi so'ralmaydi — bekend ularni kursdan oladi.
 */
export const MidtermQuizModal = ({ isOpen, onClose, courseId, lessons, groups, defaultTitle, quiz }: Props) => {
    const createMut = useCreateQuiz();
    const updateMut = useUpdateQuiz();

    const [title, setTitle] = useState('');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [lessonSearch, setLessonSearch] = useState('');
    const [groupId, setGroupId] = useState('');
    const [questionNumber, setQuestionNumber] = useState('20');
    const [duration, setDuration] = useState('40');
    const [pin, setPin] = useState('');
    const [proctoringMode, setProctoringMode] = useState<ProctoringMode>('standard');
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setTitle(quiz?.title ?? defaultTitle);
        setSelected(new Set(quiz?.lesson_ids ?? []));
        setLessonSearch('');
        setGroupId(quiz?.group_id ? String(quiz.group_id) : '');
        setQuestionNumber(String(quiz?.question_number ?? 20));
        setDuration(String(quiz?.duration ?? 40));
        setPin(quiz?.pin ?? Math.random().toString().slice(2, 6));
        setProctoringMode(quiz?.proctoring_mode ?? 'standard');
        setIsActive(quiz?.is_active ?? false);
        setError('');
        // `defaultTitle` ataylab kuzatilmaydi: ro'yxat yangilanganda
        // o'qituvchi yozayotgan nom ustidan yozilib ketmasin.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, quiz]);

    const visibleLessons = useMemo(() => {
        const needle = lessonSearch.trim().toLocaleLowerCase();
        return needle ? lessons.filter((lesson) => lesson.topic.toLocaleLowerCase().includes(needle)) : lessons;
    }, [lessons, lessonSearch]);

    const toggleLesson = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allVisibleSelected = visibleLessons.length > 0 && visibleLessons.every((lesson) => selected.has(lesson.id));
    const toggleAllVisible = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const lesson of visibleLessons) {
                if (allVisibleSelected) next.delete(lesson.id);
                else next.add(lesson.id);
            }
            return next;
        });
    };

    const handleSubmit = () => {
        const questions = parseInt(questionNumber, 10);
        const minutes = parseInt(duration, 10);
        if (!title.trim()) {
            setError('Test nomini kiriting');
            return;
        }
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
        const payload: QuizCreateRequest = {
            title: title.trim(),
            quiz_type: 'MIDTERM',
            course_id: courseId,
            // Kurs tartibida (sana bo'yicha) yuboriladi.
            lesson_ids: lessons.filter((lesson) => selected.has(lesson.id)).map((lesson) => lesson.id),
            group_id: groupId ? Number(groupId) : null,
            question_number: questions,
            duration: minutes,
            pin: pin.trim(),
            is_active: isActive,
            proctoring_mode: proctoringMode,
        };

        const onError = (cause: unknown) => setError(apiErrorMessage(cause, 'Testni saqlashda xatolik yuz berdi'));

        if (quiz) {
            updateMut.mutate({ id: quiz.id, data: payload }, {
                onSuccess: () => {
                    toast.success('Oraliq nazorat yangilandi');
                    onClose();
                },
                onError,
            });
        } else {
            createMut.mutate(payload, {
                onSuccess: () => {
                    toast.success('Oraliq nazorat yaratildi');
                    onClose();
                },
                onError,
            });
        }
    };

    const isPending = createMut.isPending || updateMut.isPending;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={quiz ? 'Oraliq nazoratni tahrirlash' : 'Oraliq nazorat'}
            className="md:max-w-2xl"
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Nomi</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="1-oraliq nazorat" />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-medium">Savollar olinadigan darslar</label>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {selected.size} / {lessons.length} tanlandi
                        </span>
                    </div>
                    {lessons.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border/80 p-3 text-sm text-muted-foreground">
                            Kursda hali dars yo'q. Testga savollarni keyin alohida qo'shishingiz mumkin.
                        </p>
                    ) : (
                        <div className="rounded-xl border border-border/60">
                            <div className="flex items-center gap-2 border-b border-border/60 p-2">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={lessonSearch}
                                        onChange={(e) => setLessonSearch(e.target.value)}
                                        placeholder="Mavzu bo'yicha qidirish"
                                        className="h-9 pl-8"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAllVisible}
                                    disabled={visibleLessons.length === 0}
                                >
                                    {allVisibleSelected ? 'Bekor qilish' : 'Hammasini tanlash'}
                                </Button>
                            </div>
                            <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
                                {visibleLessons.map((lesson) => (
                                    <li key={lesson.id}>
                                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/40">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 shrink-0 accent-primary"
                                                checked={selected.has(lesson.id)}
                                                onChange={() => toggleLesson(lesson.id)}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm">{lesson.topic}</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {formatDate(lesson.date)}
                                                </span>
                                            </span>
                                        </label>
                                    </li>
                                ))}
                                {visibleLessons.length === 0 && (
                                    <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                                        Mos dars topilmadi
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Tanlangan darslarga keyin qo'shilgan savollar ham testga avtomatik tushadi.
                    </p>
                </div>

                {groups.length > 1 && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Guruh</label>
                        <select className={selectClassName} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                            <option value="">Kursning barcha guruhlari</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Savollar soni</label>
                        <Input type="number" min={1} value={questionNumber} onChange={(e) => setQuestionNumber(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Davomiyligi (daqiqa)</label>
                        <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">PIN</label>
                        <Input value={pin} onChange={(e) => setPin(e.target.value)} />
                    </div>
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
                            Faol testda «Savollar soni»dan kam bo'lmagan savol bo'lishi shart.
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
