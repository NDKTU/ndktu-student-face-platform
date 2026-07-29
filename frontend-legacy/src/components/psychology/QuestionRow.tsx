import { Edit2, Loader2, Trash2 } from 'lucide-react';
import type { QuestionResponse, QuestionType } from '@/services/psychologyService';
import { QuestionTypeBadge } from './QuestionTypeBadge';

interface QuestionRowProps {
    question: QuestionResponse;
    index: number;
    showCategoryBadge: boolean;
    onEdit: () => void;
    onDelete: () => void;
    deleteArmed: boolean;
    deletePending: boolean;
}

export function QuestionRow({
    question,
    index,
    showCategoryBadge,
    onEdit,
    onDelete,
    deleteArmed,
    deletePending,
}: QuestionRowProps) {
    const c = question.content as Record<string, unknown>;
    const label = (c.text as string) || (c.image_url as string) || '—';
    return (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{index + 1}</span>
            <div className="flex-1 min-w-0">
                <p className="truncate text-sm text-foreground">{label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                    <QuestionTypeBadge type={question.question_type as QuestionType} />
                    {question.options && <span className="text-xs text-muted-foreground">{question.options.length} variant</span>}
                    {showCategoryBadge && question.category && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {question.category}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 gap-1">
                <button onClick={onEdit} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
                <button
                    onClick={onDelete}
                    className={`rounded-lg p-1.5 transition-colors ${deleteArmed ? 'bg-destructive text-white' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}`}
                >
                    {deletePending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                </button>
            </div>
        </div>
    );
}
