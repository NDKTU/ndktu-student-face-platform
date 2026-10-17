import { useId } from 'react';
import { Clock3 } from 'lucide-react';
import { normalizeTime } from '@/utils/dateTimeInput';

interface Props {
    /** «HH:MM» (24 soat). */
    value: string;
    onChange: (value: string) => void;
    label?: string;
    id?: string;
    disabled?: boolean;
    ariaLabel?: string;
}

/**
 * Vaqt — doim 24 soatlik «14:30».
 *
 * `<input type="time">` brauzer tilida chiziladi: inglizcha tizimda «02:30 PM».
 * Bu yerda oddiy matn: yozilganini maydondan chiqishda (yoki Enter'da)
 * «HH:MM» ga keltiradi, noto'g'risini avvalgi qiymatga qaytaradi.
 */
export function TimeField({ value, onChange, label, id, disabled = false, ariaLabel }: Props) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const commit = (input: HTMLInputElement) => {
        const next = normalizeTime(input.value);
        if (next) {
            input.value = next;
            if (next !== value) onChange(next);
        } else {
            input.value = value;
        }
    };
    return (
        <div className="space-y-1.5">
            {label && (
                <label htmlFor={inputId} className="text-sm font-medium text-foreground">
                    {label}
                </label>
            )}
            <div className="relative">
                <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                <input
                    // Qiymat tashqaridan (juftlik tugmasi) o'zgarsa — maydon yangidan chiziladi.
                    key={value}
                    id={inputId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="SS:DD"
                    disabled={disabled}
                    aria-label={ariaLabel}
                    defaultValue={value}
                    onBlur={(event) => commit(event.currentTarget)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit(event.currentTarget);
                        }
                    }}
                    className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>
        </div>
    );
}
