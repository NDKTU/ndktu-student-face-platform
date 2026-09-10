/**
 * Card.tsx
 *
 * EduDash dashboard uslubidagi zamonaviy kartochka komponenti.
 */
import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ className, children, ...props }) => (
    <div
        className={cn('rounded-lg border border-border/50 bg-card text-card-foreground shadow-[var(--surface-shadow)]', className)}
        {...props}
    >
        {children}
    </div>
);

export const CardHeader: React.FC<CardProps> = ({ className, children, ...props }) => (
    <div className={cn('flex flex-col space-y-1.5 px-5 py-4 border-b border-border/60', className)} {...props}>
        {children}
    </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, children, ...props }) => (
    <h3 className={cn('text-lg font-semibold font-display leading-tight tracking-tight text-foreground', className)} {...props}>
        {children}
    </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, children, ...props }) => (
    <p className={cn('text-sm text-muted-foreground', className)} {...props}>
        {children}
    </p>
);

export const CardContent: React.FC<CardProps> = ({ className, children, ...props }) => (
    <div className={cn('p-6', className)} {...props}>
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
            'ml-2 inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary',
            className
        )}
        {...props}
    >
        {children}
    </span>
);

