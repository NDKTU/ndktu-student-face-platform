import {
    AlignLeft,
    CheckSquare,
    Image,
    SlidersHorizontal,
    ToggleLeft,
} from 'lucide-react';
import type { QuestionType } from '@/services/psychologyService';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    text: 'Matnli savol',
    true_false: "Ha / Yo'q",
    scale: 'Shkala',
    image_stimulus: 'Rasm + matnli variantlar',
    image_choice: 'Rasmli variantlar',
    multi_choice: 'Psixologik tanlov',
};

export const QUESTION_TYPE_ICONS: Record<QuestionType, React.ElementType> = {
    text: AlignLeft,
    true_false: ToggleLeft,
    scale: SlidersHorizontal,
    image_stimulus: Image,
    image_choice: Image,
    multi_choice: CheckSquare,
};

// Шесть типов — семантических токенов не хватает, поэтому оттенки палитры
// через прозрачность: одинаково читаются в светлой и тёмной теме.
export const QUESTION_TYPE_COLORS: Record<QuestionType, string> = {
    text: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    true_false: 'bg-success/15 text-success',
    scale: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    image_stimulus: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    image_choice: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
    multi_choice: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
};
