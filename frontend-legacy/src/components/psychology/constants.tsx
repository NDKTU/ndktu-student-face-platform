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

export const QUESTION_TYPE_COLORS: Record<QuestionType, string> = {
    text: 'bg-blue-100 text-blue-700',
    true_false: 'bg-green-100 text-green-700',
    scale: 'bg-purple-100 text-purple-700',
    image_stimulus: 'bg-orange-100 text-orange-700',
    image_choice: 'bg-pink-100 text-pink-700',
    multi_choice: 'bg-teal-100 text-teal-700',
};
