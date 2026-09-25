import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Dashboard bloki: sarlavha, ixtiyoriy «Barchasi» havolasi va tana. */
export const DashboardSection = ({
    title,
    action,
    children,
    className,
}: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) => (
    <section className={cn('flex min-w-0 flex-col rounded-lg bg-card shadow-[var(--surface-shadow)]', className)}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {action}
        </div>
        <div className="flex-1">{children}</div>
    </section>
);

export const DashboardSectionLink = ({ to, label }: { to: string; label: string }) => (
    <Link to={to} className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
        {label}
        <ChevronRight className="h-4 w-4" />
    </Link>
);

export const DashboardEmpty = ({ children }: { children: React.ReactNode }) => (
    <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>
);
