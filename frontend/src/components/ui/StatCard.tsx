import React from 'react';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatCardColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red' | 'yellow';

/* Пастельные плитки в духе референс-дизайна: разные оттенки для плиток-иконок,
   осознанное исключение из правила «только семантические токены».
   dark:-варианты обязательны — плитки должны читаться в тёмной теме. */
const colorMap: Record<StatCardColor, string> = {
    blue:   'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
    purple: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20',
    cyan:   'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20',
    green:  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    orange: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    yellow: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20',
    red:    'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20',
    pink:   'bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/20',
};

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
    label,
    value,
    icon: Icon,
    className,
    description,
    isLoading,
    color = 'blue',
}) => (
    <div className={cn('rounded-xl border border-border/50 bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ease-in-out', className)}>
        <div className="flex items-start justify-between">
            <div className="space-y-0.5">
                <p className="text-sm text-muted-foreground font-medium">{label}</p>
                {isLoading ? (
                    <div className="mt-1 h-8 w-20 animate-pulse rounded bg-muted" />
                ) : (
                    <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
                )}
                {description && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5">
                        <TrendingUp className="h-3 w-3 text-success" />
                        {description}
                    </p>
                )}
            </div>
            <div className={cn('rounded-xl p-2.5 flex items-center justify-center transition-all duration-300', colorMap[color])}>
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </div>
);

export default StatCard;
