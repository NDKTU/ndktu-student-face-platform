import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { trackOpenList } from '@/components/ui/openLists';
import { cn } from '@/lib/utils';

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface Props {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    /** Qiymat ro'yxatda bo'lmasa (yoki bo'sh) — tugmada shu. */
    placeholder?: string;
    disabled?: boolean;
    id?: string;
    ariaLabel?: string;
    className?: string;
    /** `sm` — jadval/sahifalash yonidagi ixcham variant. */
    size?: 'md' | 'sm';
}

/**
 * Ochiladigan ro'yxat — `<select>` o'rniga.
 *
 * Brauzerning `<select>` ro'yxati tizim shrifti va ranglarida chiziladi
 * (Linux'da monospace, ko'k ajratish) va saytning qolgan qismiga
 * o'xshamaydi. Bu yerda — maydonlar bilan bir xil tugma, ro'yxat esa
 * `Combobox` dagi panel, faqat qidiruvsiz (variantlar kam).
 *
 * Klaviatura: ↑/↓ — yurish, Enter/Space — tanlash, Esc — yopish,
 * Home/End, harf — shu harfdan boshlanuvchi variant.
 */
export function Select({
    value,
    onChange,
    options,
    placeholder = 'Tanlang',
    disabled = false,
    id,
    ariaLabel,
    className,
    size = 'md',
}: Props) {
    const autoId = useId();
    const buttonId = id ?? autoId;
    const listId = `${buttonId}-list`;
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const selectedIndex = options.findIndex((option) => option.value === value);
    const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

    useEffect(() => {
        if (!open) return;
        const untrack = trackOpenList();
        const close = (event: MouseEvent | TouchEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('touchstart', close);
        return () => {
            untrack();
            document.removeEventListener('mousedown', close);
            document.removeEventListener('touchstart', close);
        };
    }, [open]);

    // Faol variant ko'rinib tursin (uzun ro'yxatda pastga tushganda).
    useEffect(() => {
        if (!open || active < 0) return;
        listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
    }, [open, active]);

    const openList = () => {
        if (disabled) return;
        setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
        setOpen(true);
    };
    const choose = (index: number) => {
        const option = options[index];
        if (!option || option.disabled) return;
        if (option.value !== value) onChange(option.value);
        setOpen(false);
    };
    const step = (from: number, direction: 1 | -1) => {
        for (let index = from + direction; index >= 0 && index < options.length; index += direction) {
            if (!options[index].disabled) return index;
        }
        return from;
    };

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!open) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                openList();
            }
            return;
        }
        if (event.key === 'Escape') {
            // Modal ham Esc ni tinglaydi — avval ro'yxat yopiladi (`trackOpenList`).
            event.preventDefault();
            setOpen(false);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => step(current, 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => step(current, -1));
        } else if (event.key === 'Home') {
            event.preventDefault();
            setActive(step(-1, 1));
        } else if (event.key === 'End') {
            event.preventDefault();
            setActive(step(options.length, -1));
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(active);
        } else if (event.key === 'Tab') {
            setOpen(false);
        } else if (event.key.length === 1) {
            const letter = event.key.toLowerCase();
            const match = options.findIndex(
                (option, index) => index > active && !option.disabled && option.label.toLowerCase().startsWith(letter),
            );
            const wrapped = match >= 0 ? match : options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(letter));
            if (wrapped >= 0) setActive(wrapped);
        }
    };

    return (
        <div ref={rootRef} className={cn('relative', className)}>
            <button
                id={buttonId}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={ariaLabel}
                aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={onKeyDown}
                className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    size === 'sm' ? 'h-9 font-semibold' : 'h-10',
                    open && 'border-primary ring-2 ring-primary/20',
                )}
            >
                <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    aria-labelledby={buttonId}
                    className="absolute z-50 mt-1.5 max-h-64 w-full min-w-[10rem] overflow-auto rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-xl custom-scrollbar animate-fade-scale"
                >
                    {options.map((option, index) => {
                        const isSelected = option.value === value;
                        return (
                            <li
                                key={`${option.value}-${index}`}
                                id={`${listId}-${index}`}
                                role="option"
                                aria-selected={isSelected}
                                aria-disabled={option.disabled}
                                onMouseEnter={() => !option.disabled && setActive(index)}
                                // `mousedown` emas `click`: tugmadan fokus ketmasin, tashqariga bosish esa yopsin.
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => choose(index)}
                                className={cn(
                                    'flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                                    option.disabled && 'cursor-not-allowed opacity-40',
                                    index === active && !option.disabled && 'bg-primary/10 text-primary',
                                    isSelected && 'font-semibold text-primary',
                                )}
                            >
                                <span className="truncate">{option.label}</span>
                                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
