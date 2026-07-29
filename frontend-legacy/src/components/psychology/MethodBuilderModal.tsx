import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { InstructionPreview } from './InstructionPreview';
import {
    INSTRUCTION_TEMPLATES,
    emptyMethodFormState,
    formStateToInstruction,
    instructionToFormState,
    templateToFormState,
    type CategoryRow,
    type InterpretationRow,
    type MethodFormState,
} from './instructionTemplates';

import type { MethodResponse, QuestionResponse } from '@/services/psychologyService';

// ── Small reusable building blocks ──────────────────────────────────────────

function NumberChipInput({
    values,
    onChange,
    placeholder = 'Savol raqami',
}: {
    values: number[];
    onChange: (next: number[]) => void;
    placeholder?: string;
}) {
    const [draft, setDraft] = useState('');

    const commit = () => {
        const n = Number(draft.trim());
        if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) { setDraft(''); return; }
        if (values.includes(n)) { setDraft(''); return; }
        onChange([...values, n].sort((a, b) => a - b));
        setDraft('');
    };

    const remove = (n: number) => onChange(values.filter(v => v !== n));

    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background p-2">
            {values.map(n => (
                <span key={n} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {n}
                    <button type="button" onClick={() => remove(n)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
            <input
                type="number"
                inputMode="numeric"
                min={1}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); commit(); }
                    if (e.key === 'Backspace' && !draft && values.length > 0) { onChange(values.slice(0, -1)); }
                }}
                onBlur={commit}
                placeholder={placeholder}
                className="min-w-[80px] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
        </div>
    );
}

function RangeRow({
    value,
    onChange,
    onRemove,
    errors,
}: {
    value: InterpretationRow;
    onChange: (next: InterpretationRow) => void;
    onRemove: () => void;
    errors?: string[];
}) {
    const set = <K extends keyof InterpretationRow>(key: K, v: InterpretationRow[K]) =>
        onChange({ ...value, [key]: v });

    return (
        <div className="rounded-lg border border-border bg-muted/20 p-2.5">
            <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2">
                <Input
                    label="Min"
                    type="number"
                    value={Number.isFinite(value.min) ? value.min : 0}
                    onChange={e => set('min', Number(e.target.value))}
                />
                <Input
                    label="Max"
                    type="number"
                    value={Number.isFinite(value.max) ? value.max : 0}
                    onChange={e => set('max', Number(e.target.value))}
                />
                <Input
                    label="Yorliq"
                    value={value.label}
                    onChange={e => set('label', e.target.value)}
                    placeholder="Masalan: Past"
                />
                <div className="flex items-end">
                    <button
                        type="button"
                        onClick={onRemove}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-destructive hover:bg-destructive/10"
                        title="Oraliqni o'chirish"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>
            <div className="mt-2">
                <label className="text-xs font-medium text-muted-foreground">Izoh</label>
                <textarea
                    value={value.description}
                    onChange={e => set('description', e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Talabaga ko'rsatiladigan izoh..."
                />
            </div>
            {errors && errors.length > 0 && (
                <ul className="mt-1.5 list-disc pl-5 text-[11px] text-destructive">
                    {errors.map((err, idx) => <li key={idx}>{err}</li>)}
                </ul>
            )}
        </div>
    );
}

function CategoryQuestionsPreview({
    categoryName,
    questions,
}: {
    categoryName: string;
    questions: QuestionResponse[];
}) {
    const trimmed = categoryName.trim();
    const matched = trimmed
        ? questions.filter(q => (q.category ?? '').trim() === trimmed)
        : [];

    return (
        <div className="mt-2">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Biriktirilgan savollar
            </label>
            {!trimmed ? (
                <p className="text-[11px] text-muted-foreground">
                    Avval kategoriya nomini kiriting.
                </p>
            ) : matched.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                    Bu kategoriyaga hali savol biriktirilmagan. Savollar ro'yxatida tahrirlab biriktiring.
                </p>
            ) : (
                <ul className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-2">
                    {matched.map(q => {
                        const c = q.content as Record<string, unknown>;
                        const text = (c.text as string) || (c.image_url as string) || '—';
                        return (
                            <li key={q.id} className="flex items-baseline gap-2 text-[11px] text-foreground">
                                <span className="shrink-0 font-mono text-muted-foreground">#{q.order}</span>
                                <span className="truncate">{text}</span>
                            </li>
                        );
                    })}
                    <li className="pt-1 text-[10px] text-muted-foreground">
                        Jami: {matched.length} ta
                    </li>
                </ul>
            )}
        </div>
    );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export interface MethodBuilderPayload {
    name: string;
    description: string;
    instruction: Record<string, unknown>;
}

export function MethodBuilderModal({
    open,
    editing,
    onClose,
    onCreate,
    onUpdate,
    isPending,
}: {
    open: boolean;
    editing: MethodResponse | null;
    onClose: () => void;
    onCreate: (data: MethodBuilderPayload) => void;
    onUpdate: (data: MethodBuilderPayload) => void;
    isPending: boolean;
}) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [state, setState] = useState<MethodFormState>(() => emptyMethodFormState());
    const [showTemplates, setShowTemplates] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    // Reset form on open / when editing changes
    useEffect(() => {
        if (!open) return;
        if (editing) {
            setName(editing.name ?? '');
            setDescription(editing.description ?? '');
            setState(instructionToFormState(editing.instruction as Record<string, unknown> | null));
        } else {
            setName('');
            setDescription('');
            setState(emptyMethodFormState());
        }
        setShowTemplates(false);
        setSubmitAttempted(false);
    }, [open, editing]);

    const instruction = useMemo(() => formStateToInstruction(state), [state]);

    // ── Validation ──────────────────────────────────────────────────────────
    const errors = useMemo(() => {
        const errs: { form?: string; name?: string; ranges: Record<number, string[]>; categories: Record<number, { name?: string; ranges: Record<number, string[]> }> } = {
            ranges: {},
            categories: {},
        };
        if (!name.trim()) errs.name = 'Nomi kiritilishi shart';

        const validateRanges = (rows: InterpretationRow[]) => {
            const list: Record<number, string[]> = {};
            rows.forEach((r, i) => {
                const rowErrs: string[] = [];
                if (!r.label.trim()) rowErrs.push("Yorliq bo'sh");
                if (!Number.isFinite(r.min) || !Number.isFinite(r.max)) rowErrs.push('Min/Max raqam bo\'lishi kerak');
                else if (r.min > r.max) rowErrs.push('Min ≤ Max bo\'lishi kerak');
                if (rowErrs.length > 0) list[i] = rowErrs;
            });
            return list;
        };

        if (state.method === 'sum') {
            if (state.sumInterpretation.length === 0) errs.form = 'Kamida bitta oraliq qo\'shing';
            else errs.ranges = validateRanges(state.sumInterpretation);
        } else {
            if (state.categories.length === 0) errs.form = 'Kamida bitta kategoriya qo\'shing';
            state.categories.forEach((cat, ci) => {
                const catErr: { name?: string; ranges: Record<number, string[]> } = { ranges: {} };
                if (!cat.name.trim()) catErr.name = 'Kategoriya nomi bo\'sh';
                if (cat.interpretation.length === 0) catErr.ranges = { [-1]: ['Kamida bitta oraliq qo\'shing'] };
                else catErr.ranges = validateRanges(cat.interpretation);
                errs.categories[ci] = catErr;
            });
        }
        return errs;
    }, [name, state]);

    const hasErrors = useMemo(() => {
        if (errors.name || errors.form) return true;
        if (Object.values(errors.ranges).some(arr => arr.length > 0)) return true;
        for (const cat of Object.values(errors.categories)) {
            if (cat.name) return true;
            if (Object.values(cat.ranges).some(arr => arr.length > 0)) return true;
        }
        return false;
    }, [errors]);

    // ── Mutators ───────────────────────────────────────────────────────────
    const updateState = (patch: Partial<MethodFormState>) => setState(s => ({ ...s, ...patch }));

    const addSumRange = () =>
        updateState({ sumInterpretation: [...state.sumInterpretation, { min: 0, max: 0, label: '', description: '' }] });

    const updateSumRange = (idx: number, next: InterpretationRow) => {
        const copy = [...state.sumInterpretation];
        copy[idx] = next;
        updateState({ sumInterpretation: copy });
    };

    const removeSumRange = (idx: number) =>
        updateState({ sumInterpretation: state.sumInterpretation.filter((_, i) => i !== idx) });

    const addCategory = () =>
        updateState({
            categories: [
                ...state.categories,
                { name: '', interpretation: [{ min: 0, max: 0, label: '', description: '' }] },
            ],
        });

    const updateCategory = (idx: number, patch: Partial<CategoryRow>) => {
        const copy = [...state.categories];
        copy[idx] = { ...copy[idx], ...patch };
        updateState({ categories: copy });
    };

    const removeCategory = (idx: number) =>
        updateState({ categories: state.categories.filter((_, i) => i !== idx) });

    const addCategoryRange = (catIdx: number) => {
        const cat = state.categories[catIdx];
        updateCategory(catIdx, {
            interpretation: [...cat.interpretation, { min: 0, max: 0, label: '', description: '' }],
        });
    };

    const updateCategoryRange = (catIdx: number, rowIdx: number, next: InterpretationRow) => {
        const cat = state.categories[catIdx];
        const rows = [...cat.interpretation];
        rows[rowIdx] = next;
        updateCategory(catIdx, { interpretation: rows });
    };

    const removeCategoryRange = (catIdx: number, rowIdx: number) => {
        const cat = state.categories[catIdx];
        updateCategory(catIdx, { interpretation: cat.interpretation.filter((_, i) => i !== rowIdx) });
    };

    const applyTemplate = (tplId: string) => {
        const tpl = INSTRUCTION_TEMPLATES.find(t => t.id === tplId);
        if (!tpl) return;
        setState(templateToFormState(tpl));
        setShowTemplates(false);
    };

    // ── Submit ─────────────────────────────────────────────────────────────
    const handleSubmit = () => {
        setSubmitAttempted(true);
        if (hasErrors) return;
        const payload: MethodBuilderPayload = {
            name: name.trim(),
            description: description.trim(),
            instruction,
        };
        if (editing) onUpdate(payload); else onCreate(payload);
    };

    const showErr = submitAttempted;

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title={editing ? 'Metodni tahrirlash' : 'Yangi metod'}
        >
            <div className="flex flex-col gap-4">
                <Input
                    label="Nomi"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Metod nomi..."
                    error={showErr ? errors.name : undefined}
                />
                <Input
                    label="Tavsif"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Qisqacha tavsif..."
                />

                {/* Template picker */}
                <div>
                    <button
                        type="button"
                        onClick={() => setShowTemplates(s => !s)}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                        <Sparkles className="h-3 w-3" />
                        {showTemplates ? 'Shablonlarni yopish' : 'Shablondan boshlash'}
                    </button>
                    {showTemplates && (
                        <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
                            {INSTRUCTION_TEMPLATES.map(tpl => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => applyTemplate(tpl.id)}
                                    className="flex flex-col items-start rounded-md px-2.5 py-2 text-left transition-colors hover:bg-primary/10"
                                >
                                    <span className="text-xs font-semibold text-foreground">{tpl.name}</span>
                                    <span className="text-[11px] text-muted-foreground">{tpl.hint}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Mode toggle */}
                <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Hisoblash rejimi</label>
                    <div className="inline-flex rounded-lg border border-border bg-muted/20 p-0.5">
                        <button
                            type="button"
                            onClick={() => updateState({ method: 'sum' })}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${state.method === 'sum' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Sodda yig'indi (sum)
                        </button>
                        <button
                            type="button"
                            onClick={() => updateState({ method: 'category' })}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${state.method === 'category' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Kategoriyalar (category)
                        </button>
                    </div>
                </div>

                {/* Reverse */}
                <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Teskari savollar (ixtiyoriy) <span className="text-muted-foreground/70">— savol tartib raqami</span>
                    </label>
                    <NumberChipInput
                        values={state.reverse}
                        onChange={(next) => updateState({ reverse: next })}
                        placeholder="Raqam yozib Enter"
                    />
                </div>

                {/* sum: ranges */}
                {state.method === 'sum' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Oraliqlar</label>
                            <Button type="button" variant="outline" size="sm" onClick={addSumRange}>
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Oraliq qo'shish
                            </Button>
                        </div>
                        {state.sumInterpretation.map((row, idx) => (
                            <RangeRow
                                key={idx}
                                value={row}
                                onChange={next => updateSumRange(idx, next)}
                                onRemove={() => removeSumRange(idx)}
                                errors={showErr ? errors.ranges[idx] : undefined}
                            />
                        ))}
                        {showErr && errors.form && state.sumInterpretation.length === 0 && (
                            <p className="text-xs text-destructive">{errors.form}</p>
                        )}
                    </div>
                )}

                {/* category */}
                {state.method === 'category' && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Kategoriyalar</label>
                                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                                    Bitta kategoriya — barcha savollar avtomatik. Bir nechta — har biri uchun savol raqamlarini kiriting.
                                </p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={addCategory}>
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Kategoriya qo'shish
                            </Button>
                        </div>
                        {state.categories.map((cat, ci) => {
                            const catErr = errors.categories[ci] ?? { ranges: {} };
                            const isSingle = state.categories.length === 1;
                            return (
                                <div key={ci} className="rounded-lg border border-border bg-muted/10 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <Input
                                                label="Kategoriya nomi"
                                                value={cat.name}
                                                onChange={e => updateCategory(ci, { name: e.target.value })}
                                                placeholder="Masalan: ekstraversiya"
                                                error={showErr ? catErr.name : undefined}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeCategory(ci)}
                                            className="mt-6 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-destructive hover:bg-destructive/10"
                                            title="Kategoriyani o'chirish"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {isSingle ? (
                                        <div className="mt-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
                                            <p className="text-[11px] text-muted-foreground">
                                                <b className="text-foreground">Yagona kategoriya</b> — barcha savollar avtomatik shu kategoriyaga tushadi.
                                                Savol raqamlarini qo'lda kiritish shart emas.
                                            </p>
                                        </div>
                                    ) : (
                                        <CategoryQuestionsPreview
                                            categoryName={cat.name}
                                            questions={editing?.questions ?? []}
                                        />
                                    )}

                                    <div className="mt-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-medium text-muted-foreground">Oraliqlar</label>
                                            <Button type="button" variant="outline" size="sm" onClick={() => addCategoryRange(ci)}>
                                                <Plus className="mr-1 h-3.5 w-3.5" />
                                                Oraliq qo'shish
                                            </Button>
                                        </div>
                                        {cat.interpretation.map((row, ri) => (
                                            <RangeRow
                                                key={ri}
                                                value={row}
                                                onChange={next => updateCategoryRange(ci, ri, next)}
                                                onRemove={() => removeCategoryRange(ci, ri)}
                                                errors={showErr ? catErr.ranges[ri] : undefined}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        {showErr && errors.form && state.categories.length === 0 && (
                            <p className="text-xs text-destructive">{errors.form}</p>
                        )}
                    </div>
                )}

                <InstructionPreview instruction={instruction} />

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Bekor</Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editing ? 'Saqlash' : 'Yaratish'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
