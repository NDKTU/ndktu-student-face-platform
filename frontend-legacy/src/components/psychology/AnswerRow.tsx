import type { QuestionResponse } from '@/services/psychologyService';

function resolveAnswerLabel(question: QuestionResponse | undefined, value: unknown): string {
    if (!question) return String(value ?? '—');

    switch (question.question_type) {
        case 'true_false':
            if (value === true || value === 1 || value === '1') return 'Ha';
            if (value === false || value === 0 || value === '0') return "Yo'q";
            return String(value ?? '—');
        case 'scale':
            return String(value ?? '—');
        case 'text':
        case 'image_stimulus': {
            const opts = (question.options ?? []) as Array<{ text?: string; value: unknown }>;
            const found = opts.find(o => o.value === value);
            return found?.text ?? String(value ?? '—');
        }
        case 'image_choice': {
            const opts = (question.options ?? []) as Array<{ image_url?: string; value: unknown }>;
            const idx = opts.findIndex(o => o.value === value);
            return idx >= 0 ? `Variant ${idx + 1}` : String(value ?? '—');
        }
        case 'multi_choice': {
            const opts = (question.options ?? []) as Array<{ description?: string; value: unknown }>;
            const found = opts.find(o => o.value === value);
            return found?.description ?? String(value ?? '—');
        }
        default:
            return String(value ?? '—');
    }
}

export function AnswerRow({
    index,
    question,
    value,
}: {
    index: number;
    question: QuestionResponse | undefined;
    value: unknown;
}) {
    const questionText = (question?.content as Record<string, unknown> | undefined)?.text as string | undefined;
    const isImageChoice = question?.question_type === 'image_choice';
    const isMultiChoice = question?.question_type === 'multi_choice';
    const opts = (question?.options ?? []) as Array<{ image_url?: string; description?: string; value: unknown }>;
    const selectedOpt = (isImageChoice || isMultiChoice) ? opts.find(o => o.value === value) : null;
    const selectedImage = selectedOpt?.image_url ?? null;
    const selectedDescription = isMultiChoice ? (selectedOpt as { description?: string } | null)?.description ?? null : null;

    return (
        <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Savol {index + 1}</p>
                    <p className="text-sm text-foreground line-clamp-2">{questionText || '—'}</p>
                </div>
                {selectedImage && (
                    <img src={selectedImage} alt="" className="h-14 w-14 shrink-0 rounded-md border border-border object-cover" />
                )}
            </div>
            {isMultiChoice ? (
                selectedDescription ? (
                    <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary/90">
                        {selectedDescription}
                    </div>
                ) : null
            ) : (
                <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Javob:</span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {resolveAnswerLabel(question, value)}
                    </span>
                </div>
            )}
        </div>
    );
}
