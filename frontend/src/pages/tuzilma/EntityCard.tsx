import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilIcon, TrashIcon } from '@/shared/ui/icons';

export interface CardStat {
  value: number | string;
  label: string;
}

export interface CardChip {
  text: string;
  bg: string;
  fg: string;
}

export interface CardLead {
  label: string;
  name: string;
  initials: string;
}

export interface EntityMenuItem {
  /** Подпись: видна в меню, если нет иконки, и всегда — экранному диктору. */
  label: string;
  /** С иконкой пункт становится квадратной кнопкой без текста. */
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

export interface EntityCardProps {
  title: string;
  /** Код специальности или номер курса — выводится моноширинным под заголовком. */
  subtitle?: string;
  /** Произвольная строка под заголовком вместо моноширинного `subtitle`. */
  subtitleNode?: ReactNode;
  badgeText: string;
  badgeBg: string;
  badgeFg: string;
  chips?: CardChip[];
  lead?: CardLead;
  stats: CardStat[];
  canWrite: boolean;
  /** Без обработчика карточка не кликабельна (нет уровня, куда проваливаться). */
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Полностью заменяет пункты меню «...» (по умолчанию — правка и удаление). */
  menuItems?: EntityMenuItem[];
}

export function EntityCard({
  title,
  subtitle,
  subtitleNode,
  badgeText,
  badgeBg,
  badgeFg,
  chips,
  lead,
  stats,
  canWrite,
  onOpen,
  onEdit,
  onDelete,
  menuItems,
}: EntityCardProps) {
  const { t } = useTranslation('common');
  const [menuOpen, setMenuOpen] = useState(false);

  const defaults: (EntityMenuItem | false | undefined)[] = [
    onEdit && { label: t('edit'), icon: <PencilIcon />, onClick: onEdit },
    onDelete && { label: t('delete'), icon: <TrashIcon />, danger: true, onClick: onDelete },
  ];
  const items: EntityMenuItem[] =
    menuItems ?? defaults.filter((x): x is EntityMenuItem => Boolean(x));

  // Меню из одних иконок помещается в строку и не перекрывает карточку.
  const iconsOnly = items.length > 0 && items.every((item) => item.icon);

  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`relative rounded-16 border border-line bg-surface p-5 shadow-card transition-[box-shadow,border-color] duration-200 hover:border-brand-border hover:shadow-popover ${
        onOpen ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className="grid size-[46px] flex-none place-items-center rounded-12 text-14 font-extrabold"
          style={{ background: badgeBg, color: badgeFg }}
          aria-hidden="true"
        >
          {badgeText}
        </div>

        <div className="min-w-0 flex-1">
          {/* Две строки, дальше многоточие: без ограничения длинное название
              растягивало карточку и разъезжалась вся сетка. */}
          <div
            title={title}
            className="line-clamp-2 text-15-5 leading-[1.3] font-bold tracking-[-0.01em] break-words text-ink"
          >
            {title}
          </div>
          {subtitleNode ??
            (subtitle && (
              <div className="mt-1 font-mono text-12 font-medium text-ink-code">{subtitle}</div>
            ))}
        </div>

        {canWrite && items.length > 0 && (
          <div className="relative flex-none">
            <button
              type="button"
              aria-label={t('edit')}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
              className="grid size-[30px] cursor-pointer place-items-center rounded-8 border-none bg-transparent text-line-bold hover:bg-surface-muted"
            >
              <DotsIcon />
            </button>

            {menuOpen && (
              <div
                className={`absolute top-[34px] right-0 z-30 animate-drop rounded-12 border border-line bg-surface p-1.5 shadow-popover ${
                  iconsOnly ? 'flex gap-1' : 'min-w-[168px]'
                }`}
              >
                {items.map((item) => (
                  <MenuItem
                    key={item.label}
                    label={item.label}
                    iconOnly={iconsOnly}
                    danger={item.danger}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      item.onClick();
                    }}
                  >
                    {item.icon ?? item.label}
                  </MenuItem>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {chips && chips.length > 0 && (
        <div className="mt-[13px] flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.text}
              className="rounded-20 px-2.5 py-1 text-11 font-bold"
              style={{ background: chip.bg, color: chip.fg }}
            >
              {chip.text}
            </span>
          ))}
        </div>
      )}

      {lead && (
        <div className="mt-3.5 flex items-center gap-[9px]">
          <span className="grid size-7 flex-none place-items-center rounded-full bg-brand-soft text-11 font-bold text-brand">
            {lead.initials}
          </span>
          <div className="min-w-0">
            <div className="text-11 font-medium text-ink-subtle">{lead.label}</div>
            <div className="truncate text-13 font-semibold text-ink">{lead.name}</div>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-[22px] border-t border-surface-muted pt-[15px]">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="text-18 font-extrabold tracking-[-0.01em] text-ink">{stat.value}</div>
            <div className="text-11 font-medium text-ink-subtle">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  label,
  iconOnly,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  iconOnly?: boolean;
  danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      // Подпись остаётся доступной, даже когда её не видно: без неё кнопка
      // осталась бы для экранного диктора безымянной.
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-2.5 rounded-9 border-none bg-transparent text-13-5 font-semibold hover:bg-surface-muted ${
        iconOnly ? 'size-[34px] justify-center' : 'w-full px-[11px] py-[9px]'
      } ${danger ? 'text-danger' : 'text-ink-secondary'}`}
    >
      {children}
    </button>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
