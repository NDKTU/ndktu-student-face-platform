import type { QuestionType } from '@/services/psychologyService';
import { QUESTION_TYPE_COLORS, QUESTION_TYPE_ICONS, QUESTION_TYPE_LABELS } from './constants';

export function QuestionTypeBadge({ type }: { type: QuestionType }) {
    const Icon = QUESTION_TYPE_ICONS[type];
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${QUESTION_TYPE_COLORS[type]}`}>
            <Icon className="h-3 w-3" />
            {QUESTION_TYPE_LABELS[type]}
        </span>
    );
}
