export interface InstructionTemplate {
    id: string;
    name: string;
    hint: string;
    instruction: Record<string, unknown>;
}

// ── Form-builder shape ──────────────────────────────────────────────────────

export interface InterpretationRow {
    min: number;
    max: number;
    label: string;
    description: string;
}

export interface CategoryRow {
    name: string;
    interpretation: InterpretationRow[];
}

export interface MethodFormState {
    method: 'sum' | 'category';
    reverse: number[];
    sumInterpretation: InterpretationRow[];
    categories: CategoryRow[];
}

const DEFAULT_RANGE: InterpretationRow = { min: 0, max: 0, label: '', description: '' };

export function emptyMethodFormState(): MethodFormState {
    return {
        method: 'sum',
        reverse: [],
        sumInterpretation: [{ ...DEFAULT_RANGE }],
        categories: [],
    };
}

function rowFromAny(r: Record<string, unknown>): InterpretationRow {
    return {
        min: Number(r.min ?? 0),
        max: Number(r.max ?? 0),
        label: String(r.label ?? ''),
        description: String(r.description ?? ''),
    };
}

export function instructionToFormState(instruction: Record<string, unknown> | null | undefined): MethodFormState {
    if (!instruction) return emptyMethodFormState();
    const scoring = (instruction.scoring as Record<string, unknown> | undefined) ?? {};
    const method = (scoring.method as 'sum' | 'category') ?? 'sum';
    const reverse = Array.isArray(scoring.reverse) ? (scoring.reverse as unknown[]).map(v => Number(v)).filter(n => Number.isFinite(n)) : [];

    if (method === 'category') {
        const categoriesMap = (scoring.categories as Record<string, unknown[]> | undefined) ?? {};
        const catInterp = (instruction.category_interpretations as Record<string, Array<Record<string, unknown>>> | undefined) ?? {};
        const names = Array.from(new Set([...Object.keys(categoriesMap), ...Object.keys(catInterp)]));
        const categories: CategoryRow[] = names.map(name => ({
            name,
            interpretation: (catInterp[name] ?? []).map(rowFromAny),
        }));
        return {
            method: 'category',
            reverse,
            sumInterpretation: [],
            categories: categories.length > 0 ? categories : [{ name: '', interpretation: [{ ...DEFAULT_RANGE }] }],
        };
    }

    const interpretation = (instruction.interpretation as Array<Record<string, unknown>> | undefined) ?? [];
    return {
        method: 'sum',
        reverse,
        sumInterpretation: interpretation.length > 0 ? interpretation.map(rowFromAny) : [{ ...DEFAULT_RANGE }],
        categories: [],
    };
}

export function formStateToInstruction(state: MethodFormState): Record<string, unknown> {
    if (state.method === 'sum') {
        return {
            scoring: { method: 'sum', reverse: [...state.reverse] },
            interpretation: state.sumInterpretation.map(r => ({ ...r })),
        };
    }
    const categories: Record<string, number[]> = {};
    const category_interpretations: Record<string, InterpretationRow[]> = {};
    for (const cat of state.categories) {
        const key = cat.name.trim();
        if (!key) continue;
        // Empty array preserves the legacy "all questions" semantics for single-category
        // methods and acts as a harmless placeholder when scoring uses question.category.
        categories[key] = [];
        category_interpretations[key] = cat.interpretation.map(r => ({ ...r }));
    }
    return {
        scoring: { method: 'category', reverse: [...state.reverse], categories },
        category_interpretations,
    };
}

export function templateToFormState(template: InstructionTemplate): MethodFormState {
    return instructionToFormState(template.instruction);
}

// ── Templates ──────────────────────────────────────────────────────────────

export const INSTRUCTION_TEMPLATES: InstructionTemplate[] = [
    {
        id: 'simple-3',
        name: 'Sodda 3-darajali (Past / O\'rta / Yuqori)',
        hint: 'Bitta xususiyat o\'lchanadi, jami ball 0-15 oraliqda',
        instruction: {
            scoring: { method: 'sum', reverse: [] },
            interpretation: [
                { min: 0, max: 5, label: 'Past', description: 'Past darajadagi izoh — bu yerga to\'ldiring' },
                { min: 6, max: 10, label: "O'rtacha", description: "O'rta darajadagi izoh — bu yerga to'ldiring" },
                { min: 11, max: 15, label: 'Yuqori', description: 'Yuqori darajadagi izoh — bu yerga to\'ldiring' },
            ],
        },
    },
    {
        id: 'stress',
        name: 'Stress darajasi (5 savol)',
        hint: 'Tayyor stress testi shabloni, jami ball 0-15',
        instruction: {
            scoring: { method: 'sum', reverse: [3] },
            interpretation: [
                { min: 0, max: 4, label: 'Past stress', description: 'Sizda stress darajasi past. Hayotingiz muvozanatda, kundalik vazifalar sizni charchatmaydi.' },
                { min: 5, max: 9, label: "O'rtacha stress", description: "Vaqti-vaqti bilan dam olish, sport bilan shug'ullanish va to'g'ri ovqatlanishga e'tibor bering." },
                { min: 10, max: 15, label: 'Yuqori stress', description: 'Psixolog bilan maslahatlashing, kun tartibini qayta ko\'rib chiqing va relaksatsiya texnikalarini o\'rganing.' },
            ],
        },
    },
    {
        id: 'fatigue',
        name: 'Charchoq darajasi (10 ta Ha/Yo\'q)',
        hint: 'Har bir Ha — 1 ball; jami 0-10',
        instruction: {
            scoring: { method: 'sum', reverse: [] },
            interpretation: [
                { min: 0, max: 3, label: 'Charchamagan', description: 'Energiya darajangiz yaxshi.' },
                { min: 4, max: 7, label: 'Sal charchagan', description: 'Vaqti-vaqti bilan dam olishga ehtiyoj bor.' },
                { min: 8, max: 10, label: 'Juda charchagan', description: 'Dam olish va uyquga jiddiy e\'tibor bering.' },
            ],
        },
    },
    {
        id: 'eysenck',
        name: 'Eysenck shaxsiyat (Ekstraversiya + Neyrotizm)',
        hint: "Kategoriya rejimida 2 xususiyat. Savollarni qo'shgandan keyin har birining kategoriyasini tanlang.",
        instruction: {
            scoring: {
                method: 'category',
                reverse: [],
                categories: {
                    ekstraversiya: [],
                    neyrotizm: [],
                },
            },
            category_interpretations: {
                ekstraversiya: [
                    { min: 0, max: 2, label: 'Introvert', description: 'Yopiq, mulohazali xarakter.' },
                    { min: 3, max: 5, label: 'Ekstravert', description: 'Ochiq, kommunikabel xarakter.' },
                ],
                neyrotizm: [
                    { min: 0, max: 2, label: 'Barqaror', description: 'Hissiyotlarni boshqara oladi.' },
                    { min: 3, max: 5, label: 'Hissiyotchang', description: 'Stressga moyil, sezgir.' },
                ],
            },
        },
    },
    {
        id: 'scale-5',
        name: '5 ta savol shkalada (1-5)',
        hint: 'Har bir savol 1-5; jami 5-25',
        instruction: {
            scoring: { method: 'sum', reverse: [] },
            interpretation: [
                { min: 5, max: 11, label: 'Past', description: '...' },
                { min: 12, max: 18, label: "O'rtacha", description: '...' },
                { min: 19, max: 25, label: 'Yuqori', description: '...' },
            ],
        },
    },
];
