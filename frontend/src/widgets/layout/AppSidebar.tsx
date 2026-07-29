import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import emblem from '@/assets/ndktu-emblem.png';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { NavKey } from '@/entities/access/model/roles';
import { NavIcon } from './NavIcon';

/** Разделы нижней группы меню — выводятся под заголовком «Boshqaruv». */
const MANAGEMENT_KEYS: readonly NavKey[] = ['foydalanuvchilar', 'rollar', 'sozlamalar'];

interface AppSidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
}

export function AppSidebar({ collapsed, mobileOpen, onNavigate }: AppSidebarProps) {
  const { t } = useTranslation('nav');
  const { nav } = usePermissions();

  const main = nav.filter((key) => !MANAGEMENT_KEYS.includes(key));
  const management = nav.filter((key) => MANAGEMENT_KEYS.includes(key));

  return (
    <aside
      className="app-sidebar flex flex-none flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-200"
      style={{ width: collapsed ? 76 : 248 }}
      data-open={mobileOpen}
    >
      {/* Логотип виден только в мобильном оверлее — в десктопе он в шапке. */}
      <div className="sidebar-logo hidden items-center gap-[11px] px-4 pt-4 pb-2">
        <img src={emblem} alt="" className="size-9 object-contain" />
        <div className="leading-[1.05]">
          <div className="text-15 font-extrabold tracking-[-0.02em] text-ink">
            NDKTU <span className="text-brand">LMS</span>
          </div>
          <div className="text-10 font-medium text-ink-subtle">{t('section.asosiy')}</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-[3px] overflow-x-hidden overflow-y-auto px-3 py-4">
        {!collapsed && <SectionLabel>{t('section.asosiy')}</SectionLabel>}
        {main.map((key) => (
          <SidebarLink key={key} navKey={key} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        {management.length > 0 && (
          <>
            {!collapsed && <SectionLabel>{t('section.boshqaruv')}</SectionLabel>}
            {management.map((key) => (
              <SidebarLink key={key} navKey={key} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-1.5 pb-2 text-[10.5px] font-bold tracking-[0.06em] text-line-bold uppercase">
      {children}
    </div>
  );
}

interface SidebarLinkProps {
  navKey: NavKey;
  collapsed: boolean;
  onNavigate: () => void;
}

function SidebarLink({ navKey, collapsed, onNavigate }: SidebarLinkProps) {
  const { t } = useTranslation('nav');
  const label = t(navKey);

  return (
    <NavLink
      to={`/${navKey}`}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        [
          'flex w-full cursor-pointer items-center gap-3 rounded-10 px-3 py-2.5 text-14 transition-colors duration-150',
          isActive
            ? 'bg-brand-soft font-bold text-brand shadow-[inset_3px_0_0_var(--color-brand)]'
            : 'font-semibold text-ink-secondary hover:bg-brand-soft',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <span className={`grid flex-none place-items-center ${isActive ? 'text-brand' : 'text-ink-faint'}`}>
            <NavIcon navKey={navKey} />
          </span>
          {!collapsed && <span className="whitespace-nowrap">{label}</span>}
        </>
      )}
    </NavLink>
  );
}
