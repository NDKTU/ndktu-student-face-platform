/**
 * Table.tsx
 *
 * Design decisions:
 * - Clean wrapper — no extra box shadow (Card provides surface context).
 * - TableHead is uppercase small-caps for clear visual hierarchy.
 * - Row hover uses accent with fast 150ms transition.
 * - Added `TableCaption` for accessibility (screen readers).
 * - Added `TableEmpty` — consistent empty-state slot inside a table body.
 */
import React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
    ({ className, ...props }, ref) => (
        <div className="relative w-full overflow-auto">
            <table
                ref={ref}
                className={cn('w-full caption-bottom text-sm', className)}
                {...props}
            />
        </div>
    )
);
Table.displayName = 'Table';

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
    ({ className, ...props }, ref) => (
        <caption
            ref={ref}
            className={cn('mt-4 text-sm text-muted-foreground', className)}
            {...props}
        />
    )
);
TableCaption.displayName = 'TableCaption';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
    ({ className, ...props }, ref) => (
        <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
    )
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
    ({ className, ...props }, ref) => (
        <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
    )
);
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
    ({ className, ...props }, ref) => (
        <tfoot
            ref={ref}
            className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
            {...props}
        />
    )
);
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
    ({ className, ...props }, ref) => (
        <tr
            ref={ref}
            className={cn(
                'border-b transition-colors duration-150 hover:bg-muted/50 data-[state=selected]:bg-muted',
                className
            )}
            {...props}
        />
    )
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
    ({ className, ...props }, ref) => (
        <th
            ref={ref}
            className={cn(
                'h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0',
                className
            )}
            {...props}
        />
    )
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
    ({ className, ...props }, ref) => (
        <td
            ref={ref}
            className={cn('px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0', className)}
            {...props}
        />
    )
);
TableCell.displayName = 'TableCell';

/** Full-width empty state row inside a table body */
interface TableEmptyProps {
    colSpan: number;
    title?: string;
    description?: string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
}

const TableEmpty: React.FC<TableEmptyProps> = ({
    colSpan,
    title = 'Ma\'lumot topilmadi',
    description = 'Qidiruv mezonlariga mos yozuv yo\'q.',
    action,
    icon,
}) => (
    <tr>
        <td colSpan={colSpan}>
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                {icon && <div className="text-muted-foreground">{icon}</div>}
                <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
                {action && <div className="mt-2">{action}</div>}
            </div>
        </td>
    </tr>
);

export {
    Table,
    TableCaption,
    TableHeader,
    TableBody,
    TableFooter,
    TableHead,
    TableRow,
    TableCell,
    TableEmpty,
};
