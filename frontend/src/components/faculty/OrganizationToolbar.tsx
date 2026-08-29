import React from 'react';
import { Search, X, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export interface FilterChipOption<T extends string = string> {
    value: T;
    label: string;
    count?: number;
}

export interface FilterChipGroupProps<T extends string = string> {
    label?: string;
    options: FilterChipOption<T>[];
    value: T;
    onChange: (val: T) => void;
}

export function FilterChipGroup<T extends string = string>({
    label,
    options,
    value,
    onChange,
}: FilterChipGroupProps<T>) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {label && (
                <span className="text-xs font-semibold text-muted-foreground mr-1">
                    {label}:
                </span>
            )}
            <div className="inline-flex rounded-xl border border-border/80 bg-muted/40 p-0.5">
                {options.map((opt) => {
                    const active = opt.value === value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange(opt.value)}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                                active
                                    ? 'bg-card text-foreground shadow-sm font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <span>{opt.label}</span>
                            {opt.count !== undefined && (
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 py-0.2 text-[10px]',
                                        active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    {opt.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

interface OrganizationToolbarProps {
    search: string;
    onSearchChange: (val: string) => void;
    searchPlaceholder?: string;
    viewMode: 'table' | 'grid';
    onViewModeChange: (mode: 'table' | 'grid') => void;
    totalCount?: number;
    totalLabel?: string;
    chips?: React.ReactNode;
    extraFilters?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

export const OrganizationToolbar: React.FC<OrganizationToolbarProps> = ({
    search,
    onSearchChange,
    searchPlaceholder = 'Qidirish...',
    viewMode,
    onViewModeChange,
    totalCount,
    totalLabel = 'Jami',
    chips,
    extraFilters,
    actions,
    className,
}) => {
    return (
        <div className={cn('flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm', className)}>
            {/* Top Toolbar Row */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2.5">
                    {/* Search Bar */}
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 pr-8 h-9 text-xs sm:text-sm bg-background border-border/80"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => onSearchChange('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                                aria-label="Qidiruvni tozalash"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {extraFilters}

                    {/* Total Count Badge */}
                    {totalCount !== undefined && (
                        <div className="hidden sm:flex items-center rounded-xl bg-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                            <span>{totalLabel}:</span>
                            <span className="ml-1 text-foreground font-bold font-mono">{totalCount}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    {/* View Switcher (Table vs Grid) */}
                    <div className="flex items-center rounded-xl border border-border/80 bg-muted/40 p-0.5" role="group" aria-label="Ko'rinish turi">
                        <button
                            type="button"
                            onClick={() => onViewModeChange('table')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                                viewMode === 'table'
                                    ? 'bg-card text-primary shadow-sm font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                            title="Jadval ko'rinishi"
                        >
                            <TableIcon className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Jadval</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewModeChange('grid')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                                viewMode === 'grid'
                                    ? 'bg-card text-primary shadow-sm font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                            title="Kartochka ko'rinishi"
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Karta</span>
                        </button>
                    </div>

                    {actions}
                </div>
            </div>

            {/* Bottom Chips / Secondary Filter Row if present */}
            {chips && (
                <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-2.5 text-xs">
                    {chips}
                </div>
            )}
        </div>
    );
};
