import type { MethodResponse, QuestionResponse, QuestionType } from '@/services/psychologyService';

export interface OptionRow {
    text?: string;
    image_url?: string;
    value: number | string;
    description?: string;
    [key: string]: unknown;
}

export interface QuestionFormState {
    question_type: QuestionType;
    textContent: string;
    scaleMin: string;
    scaleMax: string;
    scaleMinLabel: string;
    scaleMaxLabel: string;
    imageUrl: string;
    questionDescription: string;
    options: OptionRow[];
    order: string;
    category: string;
}

export const emptyQuestionForm = (): QuestionFormState => ({
    question_type: 'text',
    textContent: '',
    scaleMin: '1',
    scaleMax: '5',
    scaleMinLabel: '',
    scaleMaxLabel: '',
    imageUrl: '',
    questionDescription: '',
    options: [
        { text: '', image_url: '', description: '', value: 1 },
        { text: '', image_url: '', description: '', value: 2 },
    ],
    order: '0',
    category: '',
});

export function questionToForm(q: QuestionResponse): QuestionFormState {
    const c = q.content as Record<string, unknown>;
    const opts = (q.options as OptionRow[] | null) ?? [];
    return {
        question_type: q.question_type as QuestionType,
        textContent: (c.text as string) ?? '',
        scaleMin: String(c.min ?? 1),
        scaleMax: String(c.max ?? 5),
        scaleMinLabel: (c.min_label as string) ?? '',
        scaleMaxLabel: (c.max_label as string) ?? '',
        imageUrl: (c.image_url as string) ?? '',
        questionDescription: (c.description as string) ?? '',
        options: opts.length > 0 ? opts : [{ text: '', value: 1 }],
        order: String(q.order),
        category: q.category ?? '',
    };
}

export function buildQuestionPayload(form: QuestionFormState) {
    const type = form.question_type;
    let content: Record<string, unknown> = {};
    let options: OptionRow[] | null = null;

    if (type === 'text') {
        content = { text: form.textContent };
        options = form.options.filter(o => String(o.text ?? '').trim());
    } else if (type === 'true_false') {
        content = { text: form.textContent };
    } else if (type === 'scale') {
        content = {
            text: form.textContent,
            min: Number(form.scaleMin),
            max: Number(form.scaleMax),
            ...(form.scaleMinLabel && { min_label: form.scaleMinLabel }),
            ...(form.scaleMaxLabel && { max_label: form.scaleMaxLabel }),
        };
    } else if (type === 'image_stimulus') {
        content = { image_url: form.imageUrl, text: form.textContent };
        options = form.options.filter(o => String(o.text ?? '').trim());
    } else if (type === 'image_choice') {
        content = { text: form.textContent };
        options = form.options.filter(o => String(o.image_url ?? '').trim());
    } else if (type === 'multi_choice') {
        content = {
            text: form.textContent,
            ...(form.questionDescription && { description: form.questionDescription }),
        };
        options = form.options
            .filter(o => String(o.image_url ?? '').trim() || String(o.description ?? '').trim())
            .map((o, i) => ({
                ...(o.image_url && { image_url: o.image_url }),
                ...(o.description && { description: o.description }),
                value: i + 1,
            }));
    }
    return {
        content,
        options: options?.length ? options : null,
        order: Number(form.order),
        category: form.category.trim() || null,
    };
}

export function getMethodCategories(method: MethodResponse): string[] {
    const scoring = (method.instruction as { scoring?: { method?: string; categories?: Record<string, unknown> } } | null)?.scoring;
    if (!scoring || scoring.method !== 'category') return [];
    const cats = scoring.categories;
    if (!cats || typeof cats !== 'object') return [];
    return Object.keys(cats);
}
