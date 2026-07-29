import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';

interface EntityGridProps {
  title: string;
  subtitle: string;
  isEmpty: boolean;
  emptyTitle: string;
  emptyText: string;
  canWrite: boolean;
  onAdd: () => void;
  children: ReactNode;
}

export function EntityGrid({
  title,
  subtitle,
  isEmpty,
  emptyTitle,
  emptyText,
  canWrite,
  onAdd,
  children,
}: EntityGridProps) {
  const { t } = useTranslation('common');

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      {/* Заголовок уровня. Кнопка «Qo'shish» теперь в crumb-баре (см. TuzilmaPage),
          поэтому здесь только название и счётчик. */}
      <div className="mb-5">
        <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        <div className="mt-1.5 text-13-5 text-ink-subtle">{subtitle}</div>
      </div>

      {isEmpty ? (
        <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <div className="mx-auto mb-[18px] grid size-16 place-items-center rounded-18 bg-canvas text-line-bold">
            <EmptyIcon />
          </div>
          <h3 className="m-0 text-17 font-bold text-ink">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">{emptyText}</p>
          {canWrite && (
            <Button className="mt-5" onClick={onAdd}>
              + {t('add')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
          {children}
        </div>
      )}
    </div>
  );
}

function EmptyIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
