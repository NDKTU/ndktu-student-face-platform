import { useTranslation } from 'react-i18next';
import emblem from '@/assets/ndktu-emblem.png';
import { AvatarMenu } from '@/features/auth/AvatarMenu';

interface AppHeaderProps {
  onToggleSidebar: () => void;
}

export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  const { t } = useTranslation('auth');
  const { t: tn } = useTranslation('nav');

  return (
    <header className="app-header relative z-40 flex h-[62px] flex-none items-center gap-4 border-b border-line bg-surface px-5">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={tn('menu')}
        className="grid size-[38px] flex-none cursor-pointer place-items-center rounded-10 border-none bg-transparent text-ink-muted"
      >
        <MenuIcon />
      </button>

      <div className="hdr-logo flex flex-none items-center gap-[11px]">
        <img src={emblem} alt="" className="size-[38px] object-contain" />
        <div className="leading-[1.05]">
          <div className="text-16 font-extrabold tracking-[-0.02em] text-ink">
            {t('brand')} <span className="text-brand">{t('brandSuffix')}</span>
          </div>
          <div className="text-[10.5px] font-medium tracking-[0.02em] text-ink-subtle">
            {t('tagline')}
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* Колокольчик уведомлений убран вместе с лентой: она была фиксированным
          демо-набором на роль, а источника для неё на бэкенде нет. Вернётся,
          когда появится настоящий. */}
      <div className="flex flex-none items-center gap-1.5">
        <AvatarMenu />
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
