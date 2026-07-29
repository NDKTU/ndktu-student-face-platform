/**
 * Button.tsx — NDKTU LMS design
 *
 * - Primary: deep indigo with a soft brand shadow (matches the mockup's add/CTA buttons).
 * - Restrained motion: subtle active press, no lift.
 * - `outline`/`secondary` cover the white-bordered and soft-grey fills seen in the mockup.
 */
import React from 'react';
import { cn } from '@/utils/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    className,
    variant = 'primary',
    size = 'md',
    isLoading,
    disabled,
    children,
    ...props
}) => {
    const base =
        'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[11px] text-sm font-semibold ' +
        'transition-[background,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
        'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';

    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
        primary:   'bg-primary font-bold text-primary-foreground shadow-[var(--shadow-primary)] hover:bg-[#1B2596] hover:shadow-[0_4px_14px_rgba(40,54,199,.36)]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[#E4E7F0]',
        outline:   'border border-border bg-card text-[color:var(--text-body)] hover:bg-[#F4F5FA] hover:text-foreground',
        ghost:     'text-[color:var(--text-body)] hover:bg-accent hover:text-primary',
        danger:    'bg-destructive font-bold text-destructive-foreground shadow-[0_2px_8px_rgba(196,54,59,.24)] hover:bg-[#A92D31]',
        link:      'text-primary underline-offset-4 hover:underline p-0 h-auto',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
        sm:   'h-9 px-3.5 text-[13px]',
        md:   'h-10 px-4',
        lg:   'h-11 px-6 text-[15px]',
        icon: 'h-10 w-10 p-0',
    };

    return (
        <button
            className={cn(base, variants[variant], sizes[size], className)}
            disabled={isLoading || disabled}
            {...props}
        >
            {isLoading && (
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {children}
        </button>
    );
};
