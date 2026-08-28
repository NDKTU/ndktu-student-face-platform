/**
 * Button.tsx
 *
 * Wowdash dashboard uslubidagi zamonaviy tugma komponenti.
 */
import React from 'react';
import { cn } from '@/lib/utils';

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
        'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ' +
        'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
        'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] cursor-pointer';

    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
        primary:   'bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/30',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
        outline:   'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15',
        ghost:     'text-muted-foreground hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15',
        danger:    'bg-destructive text-destructive-foreground shadow-sm shadow-destructive/25 hover:bg-destructive/90',
        link:      'text-primary underline-offset-4 hover:underline p-0 h-auto font-medium',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
        sm:   'h-9 px-3 text-xs',
        md:   'h-10 px-4 py-2',
        lg:   'h-11 px-6 text-base',
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

