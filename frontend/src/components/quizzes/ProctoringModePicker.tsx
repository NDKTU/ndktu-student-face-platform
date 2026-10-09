import type { ProctoringMode } from '@/services/quizService';

const MODES: { value: ProctoringMode; title: string; hint: string }[] = [
    { value: 'standard', title: 'Standart', hint: 'Kamerasiz oddiy test' },
    { value: 'face', title: 'Kamera bilan', hint: 'Yuz orqali kuzatuv' },
    { value: 'face_entry', title: 'Kirishda yuz', hint: 'Faqat boshlashda tekshiriladi' },
];

interface Props {
    value: ProctoringMode;
    onChange: (mode: ProctoringMode) => void;
    error?: string;
}

/** «Test rejimi» — oddiy test va elementar test oynalarida bir xil. */
export function ProctoringModePicker({ value, onChange, error }: Props) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-medium">Test rejimi</label>
            <div className="grid gap-3 sm:grid-cols-3">
                {MODES.map((mode) => (
                    <button
                        key={mode.value}
                        type="button"
                        onClick={() => onChange(mode.value)}
                        className={`text-left rounded-lg border px-3 py-2 transition ${
                            value === mode.value
                                ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                                : 'border-input hover:border-primary/50'
                        }`}
                    >
                        <div className="text-sm font-medium">{mode.title}</div>
                        <div className="text-xs text-muted-foreground">{mode.hint}</div>
                    </button>
                ))}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
