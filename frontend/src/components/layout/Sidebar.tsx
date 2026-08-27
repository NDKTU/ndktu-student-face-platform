import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { buildSidebar } from '@/constants/resources';
import { BRAND } from '@/config/branding';
import logo from '@/assets/logo.png';

interface SidebarProps {
    mobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
}

/**
 * Сайдбар в стиле референса: без сворачивания и аккордеонов — все разделы
 * и пункты видны сразу. На мобильных остаётся выдвижным ящиком.
 */
const Sidebar = ({ mobileOpen, setMobileOpen }: SidebarProps) => {
    const location = useLocation();
    const { t } = useTranslation();
    const { user, permissions, activeRole } = useAuth();

    const sections = useMemo(() => {
        // Ko'rinish tanlangan bo'lsa — faqat o'sha rol, aks holda barchasi.
        const roleNames = (activeRole ? [activeRole] : (user?.roles ?? [])).map((r) => r.name);
        return buildSidebar(permissions, roleNames);
    }, [user, permissions, activeRole]);

    return (
        <>
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col bg-sidebar transition-transform duration-300 md:static',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
                )}
            >
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <img src={logo} alt={BRAND.shortName} className="h-8 w-8 shrink-0 rounded-lg bg-white/90 object-contain p-0.5" />
                        <span className="text-[12px] font-bold leading-tight text-sidebar-foreground line-clamp-2">
                            {BRAND.appName}
                        </span>
                    </div>
                    <button
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground md:hidden"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Yopish"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                    <nav className="flex flex-col gap-5 px-2">
                        {sections.filter(s => s.items.length > 0).map((section) => (
                            <div key={section.label} className="flex flex-col">
                                <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-sidebar-muted">
                                    {t(section.label)}
                                </p>
                                <div className="flex flex-col gap-1">
                                    {section.items.map((item) => {
                                        const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                                        return (
                                            <Link
                                                key={item.href}
                                                to={item.href}
                                                onClick={() => setMobileOpen(false)}
                                                className={cn(
                                                    'relative flex h-10 items-center gap-3 rounded-lg px-3 mx-1 text-sm font-medium transition-all duration-200',
                                                    isActive
                                                        ? 'bg-sidebar-active text-sidebar-foreground font-semibold'
                                                        : 'text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground'
                                                )}
                                            >
                                                {isActive && (
                                                    <span className="absolute left-[-4px] top-2 bottom-2 w-1 rounded-r-full bg-sidebar-accent shadow-[0_0_8px_color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)]" />
                                                )}
                                                <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-sidebar-accent')} />
                                                <span className="truncate">{t(item.name)}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </div>

                <div className="shrink-0 border-t border-white/10 p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-bold text-sidebar-accent">
                            {user?.username?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="flex flex-col">
                            <span className="max-w-[150px] truncate text-sm font-medium text-sidebar-foreground">{user?.username}</span>
                            <span className="max-w-[150px] truncate text-xs text-sidebar-muted">{activeRole?.name || user?.roles?.[0]?.name || t('Foydalanuvchi')}</span>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
