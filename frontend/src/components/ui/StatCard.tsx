import React from 'react';
import { cn } from '@/utils/utils';

export type StatCardColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red' | 'yellow';

// Soft icon-badge pairs (bg / fg) taken from the NDKTU mockup dashboard cards.
const colorMap: Record<StatCardColor, { bg: string; fg: string }> = {
    blue:   { bg: '#EDEFFC', fg: '#2836C7' },
    purple: { bg: '#EEE7FB', fg: '#6D28D9' },
    green:  { bg: '#DDF3E6', fg: '#157A43' },
    orange: { bg: '#FBEEDD', fg: '#B45309' },
    pink:   { bg: '#FDECEC', fg: '#C4363B' },
    cyan:   { bg: '#DBF1F2', fg: '#0E7C86' },
    red:    { bg: '#FDECEC', fg: '#C4363B' },
    yellow: { bg: '#FBF3E2', fg: '#B45309' },
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
}) => {
    const c = colorMap[color];
    return (
        <div className={cn('rounded-[16px] border border-border bg-card p-5 shadow-card', className)}>
            <div className="flex items-start justify-between">
                <span
                    className="grid h-10 w-10 place-items-center rounded-[11px]"
                    style={{ background: c.bg, color: c.fg }}
                >
                    <Icon className="h-[21px] w-[21px]" strokeWidth={1.8} />
                </span>
                {description && (
                    <span
                        className="rounded-full px-2 py-[3px] text-[11.5px] font-bold"
                        style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                    >
                        {description}
                    </span>
                )}
            </div>
            {isLoading ? (
                <div className="mt-3 h-8 w-24 animate-pulse rounded bg-[#EEF0F6]" />
            ) : (
                <div className="mt-3 text-3xl font-extrabold tracking-[-0.02em] text-foreground">{value}</div>
            )}
            <div className="mt-0.5 text-[13px] font-semibold text-[color:var(--text-body)]">{label}</div>
        </div>
    );
};

export default StatCard;
