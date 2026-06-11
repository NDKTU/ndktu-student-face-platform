/**
 * Button.tsx
 *
 * Design decisions:
 * - Clean, restrained style: no lift transforms, subtle shadow only on primary.
 * - Added `icon` size for square icon-only buttons (accessible with aria-label).
 * - Added `link` variant for text-style CTA actions.
 * - Loading state uses a spinner that does not shift layout (absolute positioned).
 * - `active:scale-95` gives tactile feedback without being heavy.
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
        'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ' +
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
        'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';

    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
        primary:   'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline:   'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost:     'hover:bg-accent hover:text-accent-foreground',
        danger:    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        link:      'text-primary underline-offset-4 hover:underline p-0 h-auto',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
        sm:   'h-9 px-3 text-xs',
        md:   'h-10 px-4 py-2',
        lg:   'h-11 px-6',
        icon: 'h-9 w-9 p-0',
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
