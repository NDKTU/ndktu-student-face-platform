import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from './Table';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
    key: string;
    header: React.ReactNode;
    cell: (row: T) => React.ReactNode;
    className?: string;
    headClassName?: string;
    /** Скрыть колонку на экранах уже указанного брейкпоинта */
    hideBelow?: 'sm' | 'md' | 'lg';
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    data: T[] | undefined;
    rowKey: (row: T) => React.Key;
    isLoading?: boolean;
    isError?: boolean;
    onRetry?: () => void;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyAction?: React.ReactNode;
    emptyIcon?: React.ReactNode;
    onRowClick?: (row: T) => void;
    /** Карточный рендер для мобильных. Без него таблица скроллится по горизонтали. */
    renderCard?: (row: T) => React.ReactNode;
    skeletonRows?: number;
    className?: string;
}

const HIDE_BELOW: Record<NonNullable<DataTableColumn<unknown>['hideBelow']>, string> = {
    sm: 'hidden sm:table-cell',
    md: 'hidden md:table-cell',
    lg: 'hidden lg:table-cell',
};

/**
 * Таблица со встроенными состояниями: скелетон загрузки, ошибка с повтором,
 * пустое состояние — и карточным режимом на мобильных через renderCard.
 */
export function DataTable<T>({
    columns,
    data,
    rowKey,
    isLoading = false,
    isError = false,
    onRetry,
    emptyTitle,
    emptyDescription,
    emptyAction,
    emptyIcon,
    onRowClick,
    renderCard,
    skeletonRows = 6,
    className,
}: DataTableProps<T>) {
    if (isError) {
        return <ErrorState onRetry={onRetry} className={className} />;
    }

    const rows = data ?? [];
    const isEmpty = !isLoading && rows.length === 0;

    if (isEmpty) {
        return (
            <EmptyState
                title={emptyTitle}
                description={emptyDescription}
                action={emptyAction}
                icon={emptyIcon}
                className={className}
            />
        );
    }

    const table = (
        <Table>
            <TableHeader>
                <TableRow>
                    {columns.map((col) => (
                        <TableHead
                            key={col.key}
                            className={cn(col.hideBelow && HIDE_BELOW[col.hideBelow], col.headClassName)}
                        >
                            {col.header}
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading
                    ? Array.from({ length: skeletonRows }, (_, i) => (
                          <TableRow key={`skeleton-${i}`}>
                              {columns.map((col) => (
                                  <TableCell
                                      key={col.key}
                                      className={cn(col.hideBelow && HIDE_BELOW[col.hideBelow])}
                                  >
                                      <Skeleton className="h-4 w-full max-w-32" />
                                  </TableCell>
                              ))}
                          </TableRow>
                      ))
                    : rows.map((row) => (
                          <TableRow
                              key={rowKey(row)}
                              onClick={onRowClick ? () => onRowClick(row) : undefined}
                              className={cn(onRowClick && 'cursor-pointer')}
                          >
                              {columns.map((col) => (
                                  <TableCell
                                      key={col.key}
                                      className={cn(col.hideBelow && HIDE_BELOW[col.hideBelow], col.className)}
                                  >
                                      {col.cell(row)}
                                  </TableCell>
                              ))}
                          </TableRow>
                      ))}
            </TableBody>
        </Table>
    );

    if (!renderCard) {
        return <div className={className}>{table}</div>;
    }

    return (
        <div className={className}>
            {/* Десктоп: таблица */}
            <div className="hidden md:block">{table}</div>
            {/* Мобильные: карточки */}
            <div className="flex flex-col gap-3 md:hidden">
                {isLoading
                    ? Array.from({ length: 4 }, (_, i) => (
                          <Skeleton key={`card-skeleton-${i}`} className="h-24 w-full rounded-xl" />
                      ))
                    : rows.map((row) => (
                          <div
                              key={rowKey(row)}
                              onClick={onRowClick ? () => onRowClick(row) : undefined}
                              className={cn(onRowClick && 'cursor-pointer')}
                          >
                              {renderCard(row)}
                          </div>
                      ))}
            </div>
        </div>
    );
}
