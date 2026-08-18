/**
 * Card.tsx
 *
 * Design decisions:
 * - Restrained style: no hover lift, no heavy shadows.
 * - Consistent padding (p-6) across all card sections.
 * - Added CardBadge — for record count or status inside card headers.
 * - CardContent has no top-padding by default (aligns with CardHeader's bottom).
 */
import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ className, children, ...props }) => (
    <div
        className={cn('rounded-xl border border-border/50 bg-card text-card-foreground shadow-sm transition-all duration-300', className)}
        {...props}
    >
        {children}
    </div>
);

export const CardHeader: React.FC<CardProps> = ({ className, children, ...props }) => (
    <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props}>
        {children}
    </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, children, ...props }) => (
    <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props}>
        {children}
    </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, children, ...props }) => (
    <p className={cn('text-sm text-muted-foreground', className)} {...props}>
        {children}
    </p>
);

export const CardContent: React.FC<CardProps> = ({ className, children, ...props }) => (
    <div className={cn('p-6 pt-0', className)} {...props}>
        {children}
    </div>
);

export const CardFooter: React.FC<CardProps> = ({ className, children, ...props }) => (
    <div className={cn('flex items-center p-6 pt-0', className)} {...props}>
        {children}
    </div>
);

/** Inline badge for use inside CardHeader — e.g. record count */
interface CardBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    children: React.ReactNode;
}

export const CardBadge: React.FC<CardBadgeProps> = ({ className, children, ...props }) => (
    <span
        className={cn(
            'ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground',
            className
        )}
        {...props}
    >
        {children}
    </span>
);
