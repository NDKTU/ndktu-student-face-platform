import React from 'react';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatCardColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red' | 'yellow';

/* Wowdash CRM ranglar palitrasi */
const colorMap: Record<StatCardColor, string> = {
    blue:   'bg-[#487FFF]/15 text-[#487FFF] dark:bg-[#487FFF]/20 border border-[#487FFF]/25',
    purple: 'bg-[#8252E9]/15 text-[#8252E9] dark:bg-[#8252E9]/20 border border-[#8252E9]/25',
    cyan:   'bg-[#00B8F2]/15 text-[#00B8F2] dark:bg-[#00B8F2]/20 border border-[#00B8F2]/25',
    green:  'bg-[#45B369]/15 text-[#45B369] dark:bg-[#45B369]/20 border border-[#45B369]/25',
    orange: 'bg-[#FF9F29]/15 text-[#FF9F29] dark:bg-[#FF9F29]/20 border border-[#FF9F29]/25',
    yellow: 'bg-[#EAB308]/15 text-[#EAB308] dark:bg-[#EAB308]/20 border border-[#EAB308]/25',
    red:    'bg-[#EF4A00]/15 text-[#EF4A00] dark:bg-[#EF4A00]/20 border border-[#EF4A00]/25',
    pink:   'bg-[#DE3ACE]/15 text-[#DE3ACE] dark:bg-[#DE3ACE]/20 border border-[#DE3ACE]/25',
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
    <div className={cn(
        'group wow-card grid-stagger-card rounded-2xl border border-border/70 bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30',
        className
    )}>
        <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                {isLoading ? (
                    <div className="mt-1 h-8 w-24 animate-pulse rounded-lg bg-muted" />
                ) : (
                    <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display transition-colors group-hover:text-primary">{value}</p>
                )}
                {description && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 pt-0.5">
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                        <span>{description}</span>
                    </p>
                )}
            </div>

            <div className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
                colorMap[color]
            )}>
                <Icon className="h-6 w-6" />
            </div>
        </div>
    </div>
);

export default StatCard;
