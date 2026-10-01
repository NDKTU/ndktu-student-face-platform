import { useState } from 'react';
import { ChevronDown, ChevronRight, FileQuestion, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useLessonQuestions } from '@/hooks/useQuestions';
import { QuestionAccordionList } from '@/components/questions/QuestionAccordionList';
import {
    useCreateIndependentTopic,
    useDeleteIndependentTopic,
    useIndependentTopics,
    useUpdateIndependentTopic,
} from '@/hooks/useIndependentTopics';
import type { IndependentTopic } from '@/services/independentTopicService';
import type { Lesson } from '@/services/lessonService';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/date';
import { IndependentTopicModal } from './IndependentTopicModal';

interface Props {
    courseId: number;
    lessons: Lesson[];
    isLoadingLessons: boolean;
    /** Savollar bloki — faqat `read:question` bor foydalanuvchiga. */
    canSeeQuestions: boolean;
    /** Mavzu qo'shish/tahrirlash/o'chirish. */
    canManageTopics: boolean;
}

/**
 * Darsning savollari — faqat ochilganda so'raladi.
 *
 * Kursda o'nlab dars bo'ladi; hammasining savolini birdan yuklash o'nlab
 * so'rov degani va ro'yxat o'qib bo'lmas holga kelardi. Shuning uchun
 * savollar dars ochilganda keladi — foydalanuvchi aynan shu darsni
 * so'ragan paytda.
 */
const LessonQuestions = ({ lessonId, canManage }: { lessonId: number; canManage: boolean }) => {
    const { data, isLoading, isError } = useLessonQuestions(lessonId);
    const questions = data?.questions ?? [];

    if (isLoading) {
        return (
            <div className="space-y-2 px-4 pb-4">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-4/5 rounded-lg" />
            </div>
        );
    }

    if (isError) {
        return (
            <p className="px-4 pb-4 text-sm text-destructive">
                Savollarni yuklab bo'lmadi.
            </p>
        );
    }

    if (questions.length === 0) {
        return (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
                Bu darsga savol qo'shilmagan. Dars sahifasida «Savol qo'shish» tugmasi bor.
            </p>
        );
    }

    return (
        <div className="px-4 pb-4">
            {/* Dars sahifasidagi bilan bitta komponent: savol bosilganda
                variantlari ochiladi, ishlatilmagan savolni o'chirish
                mumkin. Ikki joyda ikki xil ro'yxat bo'lsa, ular vaqt
                o'tib bir-biridan uzoqlashardi. */}
            <QuestionAccordionList
                questions={questions}
                canManage={canManage}
                returnTo={`/lessons/${lessonId}`}
            />
        </div>
    );
};

/**
 * «Fan topshiriqlari» — kursning savollari va mustaqil ish mavzulari.
 *
 * Savollar darslar bo'yicha guruhlangan va yopiq turadi: fan bo'yicha
 * ularning soni yuzlab bo'ladi, bitta ro'yxatda esa ular o'qilmaydi va
 * qaysi mavzuga tegishli ekani ham ko'rinmasdi.
 */
export const CourseAssignments = ({
    courseId,
    lessons,
    isLoadingLessons,
    canSeeQuestions,
    canManageTopics,
}: Props) => {
    const navigate = useNavigate();
    const [openLessonId, setOpenLessonId] = useState<number | null>(null);
    const [topicModalOpen, setTopicModalOpen] = useState(false);
    const [editingTopic, setEditingTopic] = useState<IndependentTopic | null>(null);
    const [topicToDelete, setTopicToDelete] = useState<IndependentTopic | null>(null);

    const topicsQuery = useIndependentTopics(courseId);
    const createTopic = useCreateIndependentTopic(courseId);
    const updateTopic = useUpdateIndependentTopic(courseId);
    const deleteTopic = useDeleteIndependentTopic(courseId);
    const topics = topicsQuery.data?.topics ?? [];

    return (
        <div className="space-y-6">
            {canSeeQuestions && (
                <section className="rounded-2xl border border-border bg-card">
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                <FileQuestion className="h-[18px] w-[18px]" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold">Darslar bo'yicha savollar</h2>
                                <p className="text-xs text-muted-foreground">
                                    Darsni oching — o'sha mavzuning savollari ko'rinadi
                                </p>
                            </div>
                        </div>
                    </header>

                    {isLoadingLessons ? (
                        <div className="space-y-2 p-4">
                            <Skeleton className="h-12 w-full rounded-xl" />
                            <Skeleton className="h-12 w-full rounded-xl" />
                        </div>
                    ) : lessons.length === 0 ? (
                        <EmptyState
                            icon={<ListChecks className="h-6 w-6" />}
                            title="Darslar yo'q"
                            description="Avval dars qo'shing — savollar darsga biriktiriladi."
                            className="py-8"
                        />
                    ) : (
                        <ul className="divide-y divide-border/60">
                            {lessons.map((lesson) => {
                                const isOpen = openLessonId === lesson.id;
                                return (
                                    <li key={lesson.id}>
                                        <button
                                            type="button"
                                            onClick={() => setOpenLessonId(isOpen ? null : lesson.id)}
                                            aria-expanded={isOpen}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                                        >
                                            {isOpen ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium">{lesson.topic}</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {formatDate(lesson.date)}
                                                </span>
                                            </span>
                                            <span
                                                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    navigate(`/lessons/${lesson.id}`);
                                                }}
                                            >
                                                Darsga o'tish
                                            </span>
                                        </button>
                                        {isOpen && <LessonQuestions lessonId={lesson.id} canManage={canManageTopics} />}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            )}

            <section className="rounded-2xl border border-border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <ListChecks className="h-[18px] w-[18px]" />
                        </span>
                        <div>
                            <h2 className="text-sm font-semibold">Mustaqil ishlar mavzulari</h2>
                            <p className="text-xs text-muted-foreground">
                                Talaba mustaqil o'rganadigan mavzular ro'yxati
                            </p>
                        </div>
                    </div>
                    {canManageTopics && (
                        <Button
                            size="sm"
                            onClick={() => { setEditingTopic(null); setTopicModalOpen(true); }}
                            className="h-9 gap-1.5"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Mavzu qo'shish</span>
                        </Button>
                    )}
                </header>

                {topicsQuery.isLoading ? (
                    <div className="space-y-2 p-4">
                        <Skeleton className="h-12 w-full rounded-xl" />
                        <Skeleton className="h-12 w-full rounded-xl" />
                    </div>
                ) : topics.length === 0 ? (
                    <EmptyState
                        icon={<ListChecks className="h-6 w-6" />}
                        title="Mavzu yo'q"
                        description={
                            canManageTopics
                                ? "Mustaqil ish mavzularini qo'shing — talaba ularni shu yerda ko'radi."
                                : "O'qituvchi hali mustaqil ish mavzularini e'lon qilmagan."
                        }
                        className="py-8"
                    />
                ) : (
                    <ol className="divide-y divide-border/60">
                        {topics.map((topic, index) => (
                            <li key={topic.id} className="group/t flex items-start gap-3 px-4 py-3">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                                    {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium leading-snug">{topic.title}</p>
                                    {topic.description && (
                                        <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                                            {topic.description}
                                        </p>
                                    )}
                                </div>
                                {canManageTopics && (
                                    <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover/t:opacity-100">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Mavzuni tahrirlash"
                                            onClick={() => { setEditingTopic(topic); setTopicModalOpen(true); }}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Mavzuni o'chirish"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => setTopicToDelete(topic)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <IndependentTopicModal
                isOpen={topicModalOpen}
                onClose={() => setTopicModalOpen(false)}
                topic={editingTopic}
                isSubmitting={createTopic.isPending || updateTopic.isPending}
                onSubmit={(values) => {
                    const onDone = {
                        onSuccess: () => {
                            toast.success(editingTopic ? 'Mavzu yangilandi' : "Mavzu qo'shildi");
                            setTopicModalOpen(false);
                        },
                        onError: (error: unknown) =>
                            toast.error(apiErrorMessage(error, 'Mavzuni saqlab bo‘lmadi')),
                    };
                    if (editingTopic) {
                        updateTopic.mutate({ id: editingTopic.id, data: values }, onDone);
                    } else {
                        createTopic.mutate(values, onDone);
                    }
                }}
            />

            <ConfirmDialog
                isOpen={topicToDelete !== null}
                onClose={() => setTopicToDelete(null)}
                onConfirm={() => {
                    if (!topicToDelete) return;
                    deleteTopic.mutate(topicToDelete.id, {
                        onSuccess: () => {
                            toast.success("Mavzu o'chirildi");
                            setTopicToDelete(null);
                        },
                        onError: (error) =>
                            toast.error(apiErrorMessage(error, 'Mavzuni o‘chirib bo‘lmadi')),
                    });
                }}
                title="Mavzuni o'chirish"
                description={`«${topicToDelete?.title ?? ''}» mavzusi ro'yxatdan olib tashlanadi.`}
                confirmText="O'chirish"
                isLoading={deleteTopic.isPending}
                variant="danger"
            />
        </div>
    );
};
