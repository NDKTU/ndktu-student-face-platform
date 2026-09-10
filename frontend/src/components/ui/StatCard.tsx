import React from 'react';
import { cn } from '@/lib/utils';

export type StatCardColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red' | 'yellow' | 'teal';

export interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    className?: string;
    description?: string;
    isLoading?: boolean;
    color?: StatCardColor;
}

export const StatCard: React.FC<StatCardProps> = ({
    label, value, icon: Icon, className, description, isLoading, color = 'teal',
}) => (
    <div
        className={cn('stat-card rounded-lg p-5', className)}
        style={{ '--stat-color': `var(--stat-${color})` } as React.CSSProperties}
        aria-busy={isLoading}
    >
        <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--stat-color)] text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </div>
        {isLoading ? (
            <div className="mt-4 h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
            <p className="mt-4 font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground tabular-nums">
                {typeof value === 'number' ? value.toLocaleString('uz-UZ') : value}
            </p>
        )}
        {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
    </div>
);

export default StatCard;
