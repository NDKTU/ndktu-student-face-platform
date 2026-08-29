import React from 'react';
import { ChevronRight, Building2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: React.ElementType;
}

interface OrganizationBreadcrumbsProps {
    items: BreadcrumbItem[];
    onBack?: () => void;
    title?: string;
    description?: string;
    actions?: React.ReactNode;
    className?: string;
}

export const OrganizationBreadcrumbs: React.FC<OrganizationBreadcrumbsProps> = ({
    items,
    onBack,
    title,
    description,
    actions,
    className,
}) => {
    const hasBack = Boolean(onBack);
    const lastItem = items[items.length - 1];
    const displayTitle = title || lastItem?.label;

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            {/* Breadcrumb path bar */}
            <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1.5 overflow-x-auto text-xs font-medium text-muted-foreground custom-scrollbar py-0.5"
            >
                <button
                    type="button"
                    onClick={items[0]?.onClick}
                    className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors',
                        items.length === 1
                            ? 'bg-primary/10 font-bold text-primary dark:bg-primary/20'
                            : 'hover:bg-muted hover:text-foreground'
                    )}
                >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{items[0]?.label || 'Tuzilma'}</span>
                </button>

                {items.slice(1).map((item, index) => {
                    const isLast = index === items.length - 2;
                    return (
                        <React.Fragment key={index}>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                            {isLast ? (
                                <span
                                    className="flex items-center gap-1 truncate rounded-md bg-primary/10 px-2 py-1 font-bold text-primary dark:bg-primary/20"
                                    aria-current="page"
                                >
                                    {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" />}
                                    <span className="truncate max-w-[240px] sm:max-w-md">{item.label}</span>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={item.onClick}
                                    className="flex items-center gap-1 truncate rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" />}
                                    <span className="truncate max-w-[160px] sm:max-w-[200px]">{item.label}</span>
                                </button>
                            )}
                        </React.Fragment>
                    );
                })}
            </nav>

            {/* Header with Title and Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    {hasBack && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onBack}
                            className="h-9 gap-1.5 border-border/80 bg-card hover:bg-muted font-medium text-xs sm:text-sm"
                            aria-label="Orqaga"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span>Orqaga</span>
                        </Button>
                    )}
                    <div>
                        <h1 className="page-title text-xl sm:text-2xl font-bold tracking-tight capitalize text-foreground">
                            {displayTitle}
                        </h1>
                        {description && (
                            <p className="page-description text-xs sm:text-sm mt-0.5">{description}</p>
                        )}
                    </div>
                </div>

                {actions && (
                    <div className="flex flex-wrap items-center gap-2 sm:self-center">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};
