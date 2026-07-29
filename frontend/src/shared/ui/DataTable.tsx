import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'center';
  /** Фиксированная ширина колонки в px — как в прототипе. */
  width?: number;
  /** Горизонтальные отступы ячейки; в прототипе они у колонок разные. */
  padX?: number;
  render: (row: T) => ReactNode;
  /** Классы для ячейки: кегль и насыщенность у колонок отличаются. */
  cellClass?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
}

/**
 * Таблица в оформлении прототипа: серая шапка, разделители строк,
 * на узком экране строки превращаются в карточки (см. .rtab в index.css,
 * подпись подставляется из data-label).
 */
export function DataTable<T>({ columns, rows, rowKey, onRowClick }: DataTableProps<T>) {
  return (
    <table className="rtab w-full border-collapse">
      <thead>
        <tr className="bg-surface-raised">
          {columns.map((col) => (
            <th
              key={col.key}
              style={{ width: col.width, paddingInline: col.padX ?? 20 }}
              className={`border-b border-line py-[13px] text-12 font-semibold text-ink-muted ${
                col.align === 'center' ? 'text-center' : 'text-left'
              }`}
            >
              {col.label}
            </th>
          ))}
          {/* Пустая колонка под шеврон у кликабельных строк. */}
          {onRowClick && <th className="w-10" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`group border-b border-canvas last:border-b-0 ${
              onRowClick ? 'cursor-pointer hover:bg-surface-raised' : ''
            }`}
          >
            {columns.map((col) => (
              <td
                key={col.key}
                data-label={col.label}
                style={{ paddingInline: col.padX ?? 20 }}
                className={`py-[13px] ${col.align === 'center' ? 'text-center' : ''} ${
                  col.cellClass ?? 'text-14'
                }`}
              >
                {col.render(row)}
              </td>
            ))}
            {onRowClick && (
              <td className="w-10 pr-4 text-right align-middle">
                <ChevronRightIcon />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block text-line-bold transition-colors group-hover:text-ink-subtle"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Карточка-обёртка таблицы: скруглённая рамка с тенью. */
export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-16 border border-line bg-surface shadow-card">
      {children}
    </div>
  );
}
