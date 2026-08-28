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
 * Wowdash uslubidagi zamonaviy yon panel (Sidebar).
 * Yorug' mavzuda toza oq, qorong'i mavzuda nafis to'q slate (#273142).
 * Faol sahifa yorqin moviy (#487FFF) pill bilan ajralib turadi.
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

    // Faol bo'lim — yo'lga eng aniq mos keladigani.
    const activeHref = useMemo(() => {
        const candidates = sections
            .flatMap((section) => section.items)
            .filter((item) =>
                location.pathname === item.href || location.pathname.startsWith(item.href + '/'))
            .sort((a, b) => b.href.length - a.href.length);
        return candidates[0]?.href;
    }, [sections, location.pathname]);

    return (
        <>
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex h-screen w-68 shrink-0 flex-col border-r border-border bg-card transition-transform duration-300 ease-in-out',
                    'md:static md:inset-auto md:h-auto md:self-stretch',
                    mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
                )}
            >
                {/* Brand Logo Header */}
                <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border px-5">
                    <Link to="/" className="flex items-center gap-3 overflow-hidden group">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 p-1.5 ring-1 ring-primary/20 transition-all duration-200 group-hover:scale-105">
                            <img src={logo} alt={BRAND.shortName} className="h-full w-full object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[13px] font-bold leading-tight text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                                {BRAND.appName}
                            </span>
                            <span className="text-[11px] font-medium text-muted-foreground">
                                {BRAND.shortName} LMS
                            </span>
                        </div>
                    </Link>
                    <button
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 md:hidden"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Yopish"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Navigation Menu */}
                <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                    <nav className="flex flex-col gap-6 px-3">
                        {sections.filter(s => s.items.length > 0).map((section) => (
                            <div key={section.label} className="flex flex-col">
                                <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {t(section.label)}
                                </p>
                                <div className="flex flex-col gap-1.5">
                                    {section.items.map((item) => {
                                        const isActive = item.href === activeHref;
                                        return (
                                            <Link
                                                key={item.href}
                                                to={item.href}
                                                onClick={() => setMobileOpen(false)}
                                                className={cn(
                                                    'group relative flex h-11 items-center gap-3.5 rounded-xl px-3.5 text-sm transition-all duration-200',
                                                    isActive
                                                        ? 'bg-primary text-white font-bold shadow-md shadow-primary/25 ring-1 ring-primary/50'
                                                        : 'text-slate-700 dark:text-slate-300 font-semibold hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15'
                                                )}
                                            >
                                                <item.icon className={cn(
                                                    'h-[19px] w-[19px] shrink-0 transition-transform duration-200 group-hover:scale-110',
                                                    isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-primary'
                                                )} />
                                                <span className="truncate">{t(item.name)}</span>
                                                {isActive && (
                                                    <span className="ml-auto h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </div>

                {/* Footer User Profile Card */}
                <div className="shrink-0 p-3">
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 p-2.5 transition-all duration-200 hover:bg-muted/50">
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-bold text-primary">
                            {user?.username?.charAt(0).toUpperCase() || 'U'}
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{user?.username}</span>
                            <span className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-400">{activeRole?.name || user?.roles?.[0]?.name || t('Foydalanuvchi')}</span>
                        </div>
                    </div>
                </div>

            </aside>
        </>
    );
};

export default Sidebar;

