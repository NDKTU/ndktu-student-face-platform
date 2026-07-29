import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/features/auth/model/session.store';
import {
  notificationsForRole,
  type AppNotification,
} from '@/entities/notification/model/notifications';
import { notificationGlyph, notificationTone } from '@/entities/notification/model/tone';
import { useToast } from '@/shared/ui/Toast';
import { usePopover } from '@/shared/ui/popover.store';

export function NotificationsMenu() {
  const { t } = useTranslation('common');
  const role = useSessionStore((s) => s.role);
  const toast = useToast();

  const { open, toggle, close } = usePopover('notifications');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const feed = useMemo(() => notificationsForRole(role), [role]);
  const unreadCount = feed.filter((n) => n.unread && !readIds.has(n.id)).length;

  // Смена роли — это смена ленты; прочитанное от прежней роли не переносим.
  useEffect(() => {
    setReadIds(new Set());
    close();
  }, [role, close]);

  // Клик вне меню закрывает его. Без этого открытых поповеров может стать два.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  function markAllRead() {
    setReadIds(new Set(feed.map((n) => n.id)));
    toast(t('notifications.allMarked'));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('notifications.title')}
        aria-expanded={open}
        className="relative grid size-[38px] cursor-pointer place-items-center rounded-10 border border-line bg-surface text-ink-secondary hover:bg-brand-soft"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full border-[1.5px] border-surface bg-[#E5484D] px-[3px] text-[9px] leading-none font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-[46px] right-0 z-[60] w-[344px] animate-drop overflow-hidden rounded-14 border border-line bg-surface shadow-popover">
          <div className="flex items-center justify-between gap-2.5 border-b border-surface-sunken px-4 py-[13px]">
            <span className="text-14 font-bold text-ink">{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <span className="flex-none rounded-20 bg-brand-soft px-2 py-[3px] text-11 font-bold text-brand">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="max-h-[352px] overflow-y-auto p-1.5">
            {feed.length === 0 ? (
              <div className="px-4 py-8 text-center text-ink-subtle">
                <div className="mx-auto mb-[11px] grid size-[42px] place-items-center rounded-12 bg-canvas text-line-bold">
                  <BellIcon />
                </div>
                <div className="text-13-5 font-semibold text-ink-secondary">
                  {t('notifications.empty')}
                </div>
              </div>
            ) : (
              feed.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  read={readIds.has(item.id) || !item.unread}
                  onClick={() => {
                    setReadIds((prev) => new Set(prev).add(item.id));
                    close();
                    toast(item.title);
                  }}
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-surface-sunken px-3 py-[9px]">
            <button
              type="button"
              onClick={markAllRead}
              className="cursor-pointer border-none bg-transparent p-0 text-12 font-bold text-brand hover:underline"
            >
              {t('notifications.markAllRead')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  read,
  onClick,
}: {
  item: AppNotification;
  read: boolean;
  onClick: () => void;
}) {
  const tone = notificationTone(item.type);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer gap-[11px] rounded-10 border-none p-[10px_11px] text-left ${
        read ? 'bg-transparent' : 'bg-surface-raised'
      } hover:bg-surface-muted`}
    >
      <span
        className="grid size-[34px] flex-none place-items-center rounded-10"
        style={{ background: tone.bg, color: tone.fg }}
      >
        <GlyphIcon type={item.type} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block text-13 leading-[1.35] text-ink ${read ? 'font-medium' : 'font-bold'}`}
        >
          {item.title}
        </span>
        <span className="mt-0.5 block truncate text-11-5 text-ink-subtle">{item.sub}</span>
        <span className="mt-[3px] block text-11 text-line-bold">{item.time}</span>
      </span>

      {!read && <span className="mt-[5px] size-2 flex-none rounded-full bg-brand" />}
    </button>
  );
}

function GlyphIcon({ type }: { type: AppNotification['type'] }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {notificationGlyph(type).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9a6 6 0 1 1 12 0c0 4.5 1.6 5.8 2 6H4c.4-.2 2-1.5 2-6z" />
      <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}
