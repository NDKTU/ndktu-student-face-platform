import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import type { GeneralTestQuestion, OptionLetter, QuestionPayload } from '@/services/generalTestService';

const LETTERS: OptionLetter[] = ['a', 'b', 'c', 'd'];

interface Props {
    editing: GeneralTestQuestion | null;
    onClose: () => void;
    onSubmit: (payload: QuestionPayload) => void;
    isPending: boolean;
}

const fieldClass =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function QuestionFormModal({ editing, onClose, onSubmit, isPending }: Props) {
    const [text, setText] = useState(editing?.text ?? '');
    const [options, setOptions] = useState<Record<OptionLetter, string>>({
        a: editing?.option_a ?? '',
        b: editing?.option_b ?? '',
        c: editing?.option_c ?? '',
        d: editing?.option_d ?? '',
    });
    const [correct, setCorrect] = useState<OptionLetter>(editing?.correct_option ?? 'a');
    const [error, setError] = useState<string | null>(null);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return setError('Savol matnini kiriting');
        if (LETTERS.some((l) => !options[l].trim())) return setError("To'rttala variantni ham to'ldiring");
        setError(null);
        onSubmit({
            text: text.trim(),
            option_a: options.a.trim(),
            option_b: options.b.trim(),
            option_c: options.c.trim(),
            option_d: options.d.trim(),
            correct_option: correct,
        });
    };

    return (
        <Modal isOpen onClose={onClose} title={editing ? 'Savolni tahrirlash' : "Savol qo'shish"} className="md:max-w-2xl">
            <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="gtq-text" className="text-sm font-medium text-foreground">
                        Savol
                    </label>
                    <textarea
                        id="gtq-text"
                        className={cn(fieldClass, 'min-h-24')}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                        Variantlar <span className="font-normal text-muted-foreground">— to'g'ri javobni belgilang</span>
                    </p>
                    {LETTERS.map((letter) => (
                        <div key={letter} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setCorrect(letter)}
                                aria-label={`${letter.toUpperCase()} — to'g'ri javob`}
                                aria-pressed={correct === letter}
                                className={cn(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold uppercase transition-colors',
                                    correct === letter
                                        ? 'border-emerald-500 bg-emerald-500 text-white'
                                        : 'border-border text-muted-foreground hover:border-emerald-500/60',
                                )}
                            >
                                {letter}
                            </button>
                            <input
                                className={fieldClass}
                                value={options[letter]}
                                onChange={(e) => setOptions((prev) => ({ ...prev, [letter]: e.target.value }))}
                                placeholder={`${letter.toUpperCase()} variant`}
                            />
                        </div>
                    ))}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" isLoading={isPending}>
                        Saqlash
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
