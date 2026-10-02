import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, ChevronDown, ChevronRight, Lock, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useDeleteQuestion } from '@/hooks/useQuestions';
import type { Question } from '@/services/questionService';
import { sanitizeHtml } from '@/utils/sanitize';
import { apiErrorMessage } from '@/utils/apiError';

interface Props {
    questions: Question[];
    /** Tahrirlash va o'chirish tugmalari. */
    canManage?: boolean;
    /** Tahrirlashdan keyin qaytib keladigan sahifa. */
    returnTo?: string;
    /**
     * Berilsa, o'chirish o'rniga shu chaqiriladi — masalan, savolni oraliq
     * nazoratdan olib tashlash. Savol testda bo'lsa ham tugma ochiq qoladi:
     * aynan testdan chiqarish so'ralyapti.
     */
    onRemove?: (question: Question) => void;
    removeLabel?: string;
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * Savollar ro'yxati: bosilganda variantlari ochiladi.
 *
 * Nega yopiq holatda. O'qituvchining bankida yuzlab savol bo'ladi va
 * ularning variantlari bilan birga chizilsa, ro'yxat o'nlab ekran
 * bo'yiga cho'ziladi — kerakli savolni topib bo'lmaydi. Shuning uchun
 * ro'yxat qisqa: faqat savol matni, variantlar esa so'ralganda.
 */
export const QuestionAccordionList = ({
    questions,
    canManage = false,
    returnTo,
    onRemove,
    removeLabel = "Savolni o'chirish",
}: Props) => {
    const navigate = useNavigate();
    const [openId, setOpenId] = useState<number | null>(null);
    const [toDelete, setToDelete] = useState<Question | null>(null);
    const deleteQuestion = useDeleteQuestion();

    const optionsOf = (question: Question): { letter: string; text: string; correct: boolean }[] => {
        const values = [question.option_a, question.option_b, question.option_c, question.option_d];
        // `QUIZ` dan boshqa turlarda variantlar `payload` da saqlanadi va
        // bu ustunlar bo'sh bo'ladi.
        if (!values.some((value) => (value ?? '').trim())) return [];
        const correct = (question.correct_option ?? 'a').toLowerCase();
        return values.map((text, index) => ({
            letter: LETTERS[index],
            text: text ?? '',
            correct: LETTERS[index].toLowerCase() === correct,
        }));
    };

    return (
        <>
            <ol className="space-y-1.5">
                {questions.map((question, index) => {
                    const isOpen = openId === question.id;
                    const options = optionsOf(question);
                    return (
                        <li
                            key={question.id}
                            className="overflow-hidden rounded-xl border border-border/60 transition-colors hover:border-primary/30"
                        >
                            <div className="flex items-start gap-2 px-3.5 py-2.5">
                                <button
                                    type="button"
                                    onClick={() => setOpenId(isOpen ? null : question.id)}
                                    aria-expanded={isOpen}
                                    className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    <span
                                        className={`min-w-0 flex-1 text-sm leading-snug [&_p]:m-0 ${isOpen ? '' : 'line-clamp-2'}`}
                                        // Savol matni HTML (jodit) — tozalanib chiqariladi.
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.text || '') }}
                                    />
                                    {isOpen ? (
                                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    )}
                                </button>

                                {canManage && (
                                    <div className="flex shrink-0 gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Savolni tahrirlash"
                                            onClick={() =>
                                                navigate(
                                                    `/questions/${question.id}/edit${returnTo ? `?return_to=${returnTo}` : ''}`,
                                                )
                                            }
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        {onRemove ? (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={removeLabel}
                                                title={removeLabel}
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => onRemove(question)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        ) : question.in_quiz ? (
                                            // Testga olingan savol o'chirilmaydi: test tarkibi
                                            // va javoblar unga tayanadi. Tugmani yashirmay,
                                            // sababi bilan ko'rsatamiz.
                                            <span
                                                title="Savol testga olingan — o'chirib bo'lmaydi"
                                                className="flex h-9 w-9 items-center justify-center text-muted-foreground/60"
                                            >
                                                <Lock className="h-4 w-4" />
                                            </span>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Savolni o'chirish"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => setToDelete(question)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {isOpen && (
                                <div className="border-t border-border/60 bg-muted/20 px-3.5 py-3">
                                    {options.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            Bu savol turida variantlar boshqa shaklda saqlanadi — tahrirlash
                                            sahifasida ko'rinadi.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1.5">
                                            {options.map((option) => (
                                                <li
                                                    key={option.letter}
                                                    className={
                                                        option.correct
                                                            ? 'flex items-start gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-2.5 py-1.5'
                                                            : 'flex items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5'
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            option.correct
                                                                ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-[11px] font-bold text-emerald-700 dark:text-emerald-400'
                                                                : 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground'
                                                        }
                                                    >
                                                        {option.letter}
                                                    </span>
                                                    <span
                                                        className="min-w-0 flex-1 text-sm leading-snug [&_p]:m-0"
                                                        dangerouslySetInnerHTML={{
                                                            __html: sanitizeHtml(option.text),
                                                        }}
                                                    />
                                                    {option.correct && (
                                                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                                            <Check className="h-3.5 w-3.5" />
                                                            To'g'ri javob
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>

            <ConfirmDialog
                isOpen={toDelete !== null}
                onClose={() => setToDelete(null)}
                onConfirm={() => {
                    if (!toDelete) return;
                    deleteQuestion.mutate(toDelete.id, {
                        onSuccess: () => {
                            toast.success("Savol o'chirildi");
                            setToDelete(null);
                        },
                        onError: (error) =>
                            toast.error(apiErrorMessage(error, "Savolni o'chirib bo'lmadi")),
                    });
                }}
                title="Savolni o'chirish"
                description="Savol bankdan olib tashlanadi. Uni qaytarib bo'lmaydi."
                confirmText="O'chirish"
                isLoading={deleteQuestion.isPending}
                variant="danger"
            />
        </>
    );
};
