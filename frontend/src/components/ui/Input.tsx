/**
 * Input.tsx
 *
 * Design decisions:
 * - h-9 default aligns with sm Button height for consistent action bars.
 * - Optional `label` prop renders an accessible label above the field.
 * - ring-based focus (not border-color shift) for predictable layout.
 * - Password toggle button is aria-labelled.
 * - Error state uses red ring + red text helper below.
 * - Optional `leftAddon`/`rightAddon` slots for icons inside the field.
 * - When type="number", native spinner is hidden globally and custom
 *   ChevronUp/ChevronDown buttons are rendered on the right. Steppers
 *   respect min/max/step and dispatch a React-observable input event.
 */
import React, { useRef, useState, forwardRef } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
    error?: string;
    label?: string;
    leftAddon?: React.ReactNode;
    rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    className,
    type,
    error,
    label,
    leftAddon,
    rightAddon,
    id,
    ...props
}, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const isNumber = type === 'number';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    const innerRef = useRef<HTMLInputElement | null>(null);

    const setCombinedRef = (el: HTMLInputElement | null) => {
        innerRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    };

    const step = (dir: 1 | -1) => {
        const el = innerRef.current;
        if (!el || el.disabled || el.readOnly) return;
        const stepAttr = Number(el.step) > 0 ? Number(el.step) : 1;
        const current = Number(el.value);
        const base = Number.isFinite(current) ? current : 0;
        const next = base + dir * stepAttr;
        const min = el.min !== '' ? Number(el.min) : -Infinity;
        const max = el.max !== '' ? Number(el.max) : Infinity;
        const clamped = Math.min(max, Math.max(min, next));
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set;
        setter?.call(el, String(clamped));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    return (
        <div className="w-full">
            {label && (
                <label
                    htmlFor={inputId}
                    className="mb-1.5 block text-sm font-medium text-foreground"
                >
                    {label}
                </label>
            )}

            <div className="relative">
                {leftAddon && (
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {leftAddon}
                    </div>
                )}

                <input
                    ref={setCombinedRef}
                    id={inputId}
                    type={inputType}
                    className={cn(
                        'flex h-9 w-full rounded-xl border border-input/60 bg-transparent px-3 py-1 text-sm shadow-sm',
                        'placeholder:text-muted-foreground',
                        'transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        error && 'border-destructive focus-visible:ring-destructive',
                        leftAddon && 'pl-9',
                        (rightAddon || isPassword) && 'pr-9',
                        isNumber && 'pr-8 tabular-nums',
                        className,
                    )}
                    {...props}
                />

                {isPassword && (
                    <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                )}

                {rightAddon && !isPassword && !isNumber && (
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {rightAddon}
                    </div>
                )}

                {isNumber && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-label="Ko'paytirish"
                            onClick={() => step(1)}
                            onMouseDown={(e) => e.preventDefault()}
                            className="flex h-3.5 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
                        </button>
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-label="Kamaytirish"
                            onClick={() => step(-1)}
                            onMouseDown={(e) => e.preventDefault()}
                            className="flex h-3.5 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <p className="mt-1.5 text-xs text-destructive" role="alert">{error}</p>
            )}
        </div>
    );
});

Input.displayName = 'Input';
