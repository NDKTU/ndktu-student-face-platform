import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsOf, tileFor } from '@/lib/avatarTiles';

export interface CatalogMetric {
    label: string;
    value: ReactNode;
    accent?: boolean;
}

interface CatalogCardProps {
    id: number;
    title: string;
    subtitle?: ReactNode;
    metrics: CatalogMetric[];
    footer?: ReactNode;
    actions?: ReactNode;
    onClick?: () => void;
    className?: string;
}

export const CatalogCard = ({ id, title, subtitle, metrics, footer, actions, onClick, className }: CatalogCardProps) => {
    const interactive = Boolean(onClick);
    const activate = () => onClick?.();

    return (
        <article
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={activate}
            onKeyDown={(event) => {
                if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    activate();
                }
            }}
            className={cn(
                'grid-stagger-card group flex min-h-44 flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-200',
                interactive && 'cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                className,
            )}
        >
            <div className="flex items-start gap-3">
                <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-transform duration-200 group-hover:scale-105', tileFor(id))}>
                    {initialsOf(title)}
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="font-display font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">{title}</h2>
                    {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
                </div>
                {actions && <div onClick={(event) => event.stopPropagation()}>{actions}</div>}
                {interactive && <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />}
            </div>

            <dl className={cn('mt-4 grid gap-2 border-t border-border/60 pt-4', metrics.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                {metrics.map((metric) => (
                    <div key={metric.label} className="min-w-0">
                        <dd className={cn('truncate font-display text-lg font-bold text-foreground', metric.accent && 'text-primary')}>
                            {metric.value}
                        </dd>
                        <dt className="truncate text-xs text-muted-foreground">{metric.label}</dt>
                    </div>
                ))}
            </dl>
            {footer && <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">{footer}</div>}
        </article>
    );
};

export const CatalogGrid = ({ children }: { children: ReactNode }) => (
    <section className="grid-stagger-container grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</section>
);
