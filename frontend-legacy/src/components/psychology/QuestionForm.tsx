import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { Plus, X } from 'lucide-react';
import type { QuestionType } from '@/services/psychologyService';
import { QUESTION_TYPE_LABELS } from './constants';
import type { OptionRow, QuestionFormState } from './questionFormHelpers';

interface QuestionFormProps {
    form: QuestionFormState;
    onChange: (f: QuestionFormState) => void;
    methodCategories: string[];
}

export function QuestionForm({ form, onChange, methodCategories }: QuestionFormProps) {
    const set = (patch: Partial<QuestionFormState>) => onChange({ ...form, ...patch });

    const updateOption = (i: number, patch: Partial<OptionRow>) => {
        const opts = form.options.map((o, idx) => idx === i ? { ...o, ...patch } : o);
        set({ options: opts });
    };
    const addOption = () => set({ options: [...form.options, { text: '', image_url: '', value: form.options.length }] });
    const removeOption = (i: number) => set({ options: form.options.filter((_, idx) => idx !== i) });

    return (
        <div className="flex flex-col gap-4">
            <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Savol turi</label>
                <Combobox
                    options={(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(t => ({
                        value: t,
                        label: QUESTION_TYPE_LABELS[t],
                    }))}
                    value={form.question_type}
                    onChange={(val) => { if (val) set({ question_type: val as QuestionType }); }}
                    placeholder="Savol turini tanlang..."
                    searchPlaceholder="Qidirish..."
                />
            </div>

            {form.question_type !== 'image_choice' && (
                <Input
                    label={form.question_type === 'true_false' ? 'Bayonot' : 'Savol matni'}
                    value={form.textContent}
                    onChange={e => set({ textContent: e.target.value })}
                    placeholder="Savol yoki bayonot kiriting..."
                />
            )}

            {form.question_type === 'image_stimulus' && (
                <ImageUploadField
                    label="Rasm (ixtiyoriy)"
                    value={form.imageUrl}
                    onChange={(url) => set({ imageUrl: url ?? '' })}
                />
            )}

            {form.question_type === 'scale' && (
                <div className="grid grid-cols-2 gap-3">
                    <Input label="Min" type="number" value={form.scaleMin} onChange={e => set({ scaleMin: e.target.value })} />
                    <Input label="Max" type="number" value={form.scaleMax} onChange={e => set({ scaleMax: e.target.value })} />
                    <Input label="Min belgisi" value={form.scaleMinLabel} onChange={e => set({ scaleMinLabel: e.target.value })} placeholder="masalan: Hech qachon" />
                    <Input label="Max belgisi" value={form.scaleMaxLabel} onChange={e => set({ scaleMaxLabel: e.target.value })} placeholder="masalan: Har doim" />
                </div>
            )}

            {(form.question_type === 'text' || form.question_type === 'image_stimulus' || form.question_type === 'image_choice' || form.question_type === 'multi_choice') && (
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-medium text-muted-foreground">Javob variantlari</label>
                        <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> Qo'shish
                        </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                        {form.options.map((opt, i) => (
                            <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/10 p-2">
                                {form.question_type === 'multi_choice' ? (
                                    <>
                                        <div className="flex items-start gap-2">
                                            <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                                            <div className="flex-1">
                                                <ImageUploadField
                                                    label=""
                                                    helperText="Rasm yuklang"
                                                    value={String(opt.image_url ?? '') || null}
                                                    onChange={(url) => updateOption(i, { image_url: url ?? '' })}
                                                    previewSize={72}
                                                />
                                            </div>
                                            <button type="button" onClick={() => removeOption(i)} className="mt-1 text-destructive shrink-0"><X className="h-4 w-4" /></button>
                                        </div>
                                        <textarea
                                            value={String(opt.description ?? '')}
                                            onChange={e => updateOption(i, { description: e.target.value })}
                                            rows={2}
                                            placeholder="Foydalanuvchi ushbu rasmni tanlasa ko'rsatiladigan tavsif..."
                                            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </>
                                ) : (
                                    <div className="flex gap-2 items-center">
                                        {form.question_type === 'image_choice' ? (
                                            <div className="flex-1">
                                                <ImageUploadField
                                                    value={String(opt.image_url ?? '') || null}
                                                    onChange={(url) => updateOption(i, { image_url: url ?? '' })}
                                                    previewSize={56}
                                                    helperText=""
                                                />
                                            </div>
                                        ) : (
                                            <Input label="" placeholder={`Variant ${i + 1}`} value={String(opt.text ?? '')} onChange={e => updateOption(i, { text: e.target.value })} className="flex-1" />
                                        )}
                                        <Input label="" type="number" placeholder="Qiymat" value={String(opt.value)} onChange={e => updateOption(i, { value: Number(e.target.value) })} className="w-20 shrink-0" />
                                        <button type="button" onClick={() => removeOption(i)} className="text-destructive shrink-0"><X className="h-4 w-4" /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Input label="Tartib raqami" type="number" value={form.order} onChange={e => set({ order: e.target.value })} />

            {methodCategories.length >= 2 && (
                <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Kategoriya</label>
                    {form.category ? (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {form.category}
                        </span>
                    ) : (
                        <select
                            value={form.category}
                            onChange={e => set({ category: e.target.value })}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="">— Tanlanmagan —</option>
                            {methodCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    )}
                </div>
            )}
        </div>
    );
}
