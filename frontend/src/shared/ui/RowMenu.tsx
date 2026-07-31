import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface RowMenuItem {
  /** Подпись: видна в меню и всегда доступна экранному диктору. */
  label: string;
  /** С иконкой пункт рисуется квадратной кнопкой без текста. */
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

/**
 * Троеточие-меню строки: правки/удаление. Тот же паттерн, что в карточках
 * структуры, — вынесен, чтобы не копировать логику закрытия по клику вне.
 */
export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  // Меню из одних иконок помещается в строку и не закрывает содержимое.
  const iconsOnly = items.length > 0 && items.every((item) => item.icon);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-label="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid size-[30px] cursor-pointer place-items-center rounded-8 border-none bg-transparent text-line-bold hover:bg-surface-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute top-[34px] right-0 z-30 animate-drop rounded-12 border border-line bg-surface p-1.5 shadow-popover ${
            iconsOnly ? 'flex gap-1' : 'min-w-[168px]'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-9 border-none bg-transparent text-13-5 font-semibold hover:bg-surface-muted ${
                iconsOnly ? 'size-[34px] justify-center' : 'w-full px-[11px] py-[9px]'
              } ${item.danger ? 'text-danger' : 'text-ink-secondary'}`}
            >
              {item.icon ?? item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
