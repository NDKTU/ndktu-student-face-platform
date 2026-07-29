import type { ReactNode } from 'react';
import { cn } from '@/utils/utils';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
    /** Compact variant for inline/dropdown empties. */
    compact?: boolean;
}

const EmptyState = ({ icon, title, description, action, className, compact }: EmptyStateProps) => (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-12', className)}>
        {icon && (
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-background text-[#B4B8CC]">
                {icon}
            </div>
        )}
        <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
        {description && <p className="mt-1.5 max-w-sm text-[13px] text-[color:var(--text-label)]">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
    </div>
);

export default EmptyState;
