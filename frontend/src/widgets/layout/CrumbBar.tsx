import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  /** Последняя крошка некликабельна — у неё onClick не задан. */
  onClick?: () => void;
}

interface CrumbBarProps {
  crumbs: Crumb[];
  actions?: ReactNode;
}

export function CrumbBar({ crumbs, actions }: CrumbBarProps) {
  return (
    <div className="crumb-bar flex h-13 flex-none items-center justify-between gap-4 border-b border-line bg-surface px-7">
      <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronIcon />}
              {crumb.onClick && !isLast ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className="cursor-pointer truncate border-none bg-transparent p-0 text-13-5 font-medium text-ink-muted hover:text-brand"
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  className="truncate text-13-5 font-bold text-ink"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none text-line-bold"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
