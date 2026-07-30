import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  /** Optional subtitle under the title. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** md = 460px (default), lg = 680px for multi-section forms. */
  size?: 'md' | 'lg';
}

const SIZES = { md: 'max-w-[460px]', lg: 'max-w-[680px]' } as const;

export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }: ModalProps) {
  // Esc закрывает модалку; без этого она ловит фокус и её нечем закрыть с клавиатуры.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] grid place-items-center bg-[rgb(20_22_40/0.45)] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col ${SIZES[size]} animate-pop overflow-hidden rounded-18 border border-line bg-surface shadow-modal`}
      >
        <div className="flex-none border-b border-surface-sunken px-6 py-[18px]">
          <h2 className="m-0 text-17 font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-1 mb-0 text-12-5 text-ink-subtle">{subtitle}</p>}
        </div>

        <div className="flex flex-col gap-3.5 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex flex-none justify-end gap-2.5 border-t border-surface-sunken px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModalField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  /** Пояснение под полем: зачем оно и что сломается, если ввести не то. */
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-11-5 text-ink-subtle">{hint}</span>}
    </label>
  );
}

export const modalInputClass =
  'h-[42px] w-full rounded-11 border border-line bg-surface-raised px-3.5 text-14 text-ink outline-none ' +
  'focus:border-brand focus:bg-surface focus:shadow-focus';
