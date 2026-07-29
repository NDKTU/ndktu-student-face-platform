import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Правая часть: кнопка, селектор, чип года. */
  actions?: ReactNode;
}

/**
 * Заголовок раздела. В прототипе кегль 24px, а на дашборде — 25px,
 * поэтому дашборд свой заголовок рисует сам.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-24 font-extrabold tracking-[-0.025em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 mb-0 text-14 text-ink-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
