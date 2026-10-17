import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { MONTHS, WEEKDAYS, addDays, parseIsoDate, toIsoDate } from '@/components/schedule/scheduleUtils';
import { formatDate } from '@/utils/date';
import { formatLongDate } from '@/utils/dateTimeInput';
import { cn } from '@/lib/utils';

interface Props {
    /** `YYYY-MM-DD`. */
    value: string;
    onChange: (value: string) => void;
    label?: string;
    /** Bundan oldingi / keyingi kunlar tanlanmaydi (`YYYY-MM-DD`). */
    min?: string;
    max?: string;
    id?: string;
    /** Bo'sh qoldirish mumkin (filtrlar, ixtiyoriy sana): «Tozalash» va ✕. */
    clearable?: boolean;
    placeholder?: string;
    /** `short` — «17.10.2026», tor ustunlar (filtrlar) uchun; aks holda «Shanba, 17-oktabr 2026». */
    format?: 'long' | 'short';
    /** Yorliq ko'rinmasa — ekran o'quvchisi uchun nom. */
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
}

/**
 * Sana tanlash — o'zimizning kalendar.
 *
 * `<input type="date">` brauzer tilida chiziladi: inglizcha tizimda
 * «10/17/2026» (oy oldin), ruschada — «17.10.2026»; talaba va o'qituvchi bir
 * sanani turlicha o'qirdi. Bu yerda doim «Shanba, 17-oktabr 2026»,
 * hafta dushanbadan, «Bugun» / «Ertaga» bir bosishda.
 */
export function DatePicker({
    value,
    onChange,
    label,
    min,
    max,
    id,
    clearable = false,
    placeholder = 'Sanani tanlang',
    format = 'long',
    ariaLabel,
    disabled = false,
    className,
}: Props) {
    const autoId = useId();
    const buttonId = id ?? autoId;
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const selected = value ? parseIsoDate(value) : new Date();
    const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
    const today = toIsoDate(new Date());

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent | KeyboardEvent) => {
            if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);

    const pick = (iso: string) => {
        onChange(iso);
        setOpen(false);
    };
    const toggle = () => {
        // Ochilganda tanlangan sananing oyi ko'rinsin, oxirgi varaqlangan oy emas.
        if (!open) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
        setOpen((current) => !current);
    };

    const leading = (month.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const quick = [
        { label: 'Bugun', iso: today },
        { label: 'Ertaga', iso: toIsoDate(addDays(new Date(), 1)) },
    ].filter((item) => (!min || item.iso >= min) && (!max || item.iso <= max));

    return (
        <div ref={rootRef} className={cn('relative space-y-1.5', className)}>
            {label && (
                <label htmlFor={buttonId} className="text-sm font-medium text-foreground">
                    {label}
                </label>
            )}
            <div className="relative">
                <button
                    id={buttonId}
                    type="button"
                    onClick={toggle}
                    disabled={disabled}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    aria-label={ariaLabel}
                    className={cn(
                        'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                        clearable && value && 'pr-8',
                    )}
                >
                    <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                    <span className={cn('truncate tabular-nums', !value && 'text-muted-foreground')}>
                        {value ? (format === 'short' ? formatDate(value) : formatLongDate(value)) : placeholder}
                    </span>
                </button>
                {clearable && value && !disabled && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        aria-label="Sanani tozalash"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            {open && (
                <div role="dialog" aria-label={label ?? 'Sana'} className="absolute z-30 mt-1 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                            aria-label="Oldingi oy"
                            className="rounded-lg p-2 hover:bg-muted"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-semibold">
                            {MONTHS[month.getMonth()]} {month.getFullYear()}
                        </span>
                        <button
                            type="button"
                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                            aria-label="Keyingi oy"
                            className="rounded-lg p-2 hover:bg-muted"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                        {WEEKDAYS.map((day) => (
                            <span key={day} className="py-1.5">
                                {day.slice(0, 2)}
                            </span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center">
                        {Array.from({ length: leading }, (_, index) => (
                            <span key={`empty-${index}`} />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, index) => {
                            const iso = toIsoDate(new Date(month.getFullYear(), month.getMonth(), index + 1));
                            const outOfRange = Boolean((min && iso < min) || (max && iso > max));
                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    disabled={outOfRange}
                                    onClick={() => pick(iso)}
                                    aria-pressed={iso === value}
                                    aria-label={formatLongDate(iso)}
                                    className={cn(
                                        'h-9 rounded-lg text-sm transition-colors',
                                        outOfRange
                                            ? 'cursor-not-allowed text-muted-foreground/40'
                                            : iso === value
                                              ? 'bg-primary font-semibold text-primary-foreground'
                                              : iso === today
                                                ? 'text-primary ring-1 ring-primary hover:bg-primary/10'
                                                : 'hover:bg-primary/10',
                                    )}
                                >
                                    {index + 1}
                                </button>
                            );
                        })}
                    </div>
                    {(quick.length > 0 || (clearable && value)) && (
                        <div className="mt-2 flex gap-2">
                            {quick.map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => pick(item.iso)}
                                    className="flex-1 rounded-lg bg-primary/10 py-2 text-xs font-semibold text-primary hover:bg-primary/15"
                                >
                                    {item.label}
                                </button>
                            ))}
                            {clearable && value && (
                                <button
                                    type="button"
                                    onClick={() => pick('')}
                                    className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                                >
                                    Tozalash
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
