import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { PERSONAS } from '@/entities/access/model/roles';
import { useSessionStore } from '@/features/auth/model/session.store';
import { initials } from '@/entities/university/mock/rng';
import { usePopover } from '@/shared/ui/popover.store';

export function AvatarMenu() {
  const { t } = useTranslation('common');
  const { t: ta } = useTranslation('auth');
  const { role, roleColor, canAccess } = usePermissions();
  const signOut = useSessionStore((s) => s.signOut);
  const navigate = useNavigate();

  const { open, toggle, close } = usePopover('avatar');
  const containerRef = useRef<HTMLDivElement>(null);
  // Имя — настоящего владельца токена; подпись под ним — название его роли.
  const persona = PERSONAS[role];
  const userName = useSessionStore((s) => s.user?.displayName) ?? persona.user;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  function go(path: string) {
    close();
    void navigate(path);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-10 cursor-pointer items-center gap-[9px] rounded-22 border border-line bg-surface py-[3px] pr-[9px] pl-[3px] hover:bg-surface-raised"
      >
        <span
          className="grid size-8 flex-none place-items-center rounded-full text-12-5 font-bold text-white"
          style={{ background: roleColor }}
        >
          {initials(userName)}
        </span>
        <span className="hdr-user-text text-left leading-[1.1]">
          <span className="block text-13 font-bold text-ink">{userName}</span>
          <span className="block text-11 text-ink-subtle">{persona.title}</span>
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="absolute top-[46px] right-0 z-[60] w-[236px] animate-drop overflow-hidden rounded-14 border border-line bg-surface shadow-popover">
          <div className="flex items-center gap-[11px] border-b border-surface-sunken px-4 py-[13px]">
            <span
              className="grid size-[34px] flex-none place-items-center rounded-9 text-12 font-bold text-white"
              style={{ background: roleColor }}
            >
              {initials(userName)}
            </span>
            <span className="min-w-0 leading-[1.15]">
              <span className="block truncate text-12-5 font-bold text-ink">{userName}</span>
              <span className="block text-11 text-ink-subtle">{persona.title}</span>
            </span>
          </div>

          <div className="p-1.5">
            <MenuItem onClick={() => go('/profil')}>{t('profile')}</MenuItem>
            {/* «Sozlamalar» есть не у всех ролей — показываем только если раздел доступен. */}
            {canAccess('sozlamalar') && (
              <MenuItem onClick={() => go('/sozlamalar')}>{t('settings')}</MenuItem>
            )}
            <MenuItem danger onClick={signOut}>
              {ta('logout')}
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-9 border-none bg-transparent px-[11px] py-[9px] text-13-5 font-semibold hover:bg-surface-muted ${
        danger ? 'text-danger' : 'text-ink-secondary'
      }`}
    >
      {children}
    </button>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="mr-0.5 text-ink-subtle"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
