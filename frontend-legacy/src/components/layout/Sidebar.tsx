import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/utils/utils';
import { useAuth } from '@/context/AuthContext';
import { buildSidebar } from '@/constants/resources';
import Avatar from '@/components/ui/Avatar';
import logo from '@/assets/logo.png';

interface SidebarProps {
    collapsed: boolean;
    mobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
}

const Sidebar = ({ collapsed, mobileOpen, setMobileOpen }: SidebarProps) => {
    const location = useLocation();
    const { user, permissions } = useAuth();

    const sections = useMemo(() => {
        const roleNames = (user?.roles ?? []).map((r) => r.name);
        return buildSidebar(permissions, roleNames);
    }, [user, permissions]);

    // Labels are hidden only on the desktop icon-rail (collapsed & not the mobile drawer).
    const showLabels = mobileOpen || !collapsed;

    const displayName = user?.student
        ? `${user.student.first_name} ${user.student.last_name}`.trim() || user.username
        : user?.username ?? 'User';
    const roleLabel = user?.roles?.[0]?.name ?? 'Foydalanuvchi';

    const isActive = (href: string) =>
        href === '/'
            ? location.pathname === '/'
            : location.pathname === href || location.pathname.startsWith(href + '/');

    return (
        <>
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-[rgba(20,22,40,.45)] md:hidden [animation:dcfade_.16s_ease]"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                data-open={mobileOpen}
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex h-screen flex-none flex-col overflow-hidden border-r border-border bg-card transition-[width,transform] duration-200 md:static md:h-auto',
                    'w-[276px] max-w-[85vw] shadow-[0_24px_60px_rgba(20,22,40,.28)] md:max-w-none md:shadow-none',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
                    collapsed ? 'md:w-[68px]' : 'md:w-64',
                )}
            >
                {/* Brand — only shown inside the mobile drawer (header carries it on desktop) */}
                <div className="flex items-center gap-[11px] px-4 pb-2 pt-4 md:hidden">
                    <img src={logo} alt="NDKTU" className="h-9 w-9 object-contain" />
                    <div className="leading-[1.05]">
                        <div className="text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
                            NDKTU <span className="text-primary">LMS</span>
                        </div>
                        <div className="text-[10px] font-medium text-[color:var(--text-label)]">O'quv boshqaruv tizimi</div>
                    </div>
                </div>

                <nav className="custom-scrollbar flex flex-1 flex-col gap-[3px] overflow-y-auto overflow-x-hidden px-3 py-4">
                    {sections.filter((s) => s.items.length > 0).map((section) => (
                        <div key={section.label} className="flex flex-col gap-[3px]">
                            {showLabels && (
                                <div className="px-3 pb-2 pt-3 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#B4B8CC] first:pt-1.5">
                                    {section.label}
                                </div>
                            )}
                            {section.items.map((item) => {
                                const active = isActive(item.href);
                                return (
                                    <div key={item.href} className="group relative">
                                        <Link
                                            to={item.href}
                                            onClick={() => setMobileOpen(false)}
                                            data-tip={item.name}
                                            className={cn(
                                                'flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors',
                                                !showLabels && 'justify-center',
                                                active
                                                    ? 'bg-accent font-bold text-primary'
                                                    : 'font-medium text-[color:var(--text-body)] hover:bg-accent',
                                            )}
                                        >
                                            <item.icon size={20} strokeWidth={1.8} className="flex-none" />
                                            {showLabels && <span className="truncate whitespace-nowrap">{item.name}</span>}
                                        </Link>
                                        {!showLabels && (
                                            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-pop transition-opacity group-hover:opacity-100">
                                                {item.name}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* Footer user card */}
                <div className="flex-none border-t border-[#EEF0F6] p-3">
                    <div
                        className={cn(
                            'flex items-center gap-[11px] rounded-[12px] border border-[#EEF0F6] bg-[color:var(--surface-subtle)] p-2.5',
                            !showLabels && 'justify-center',
                        )}
                    >
                        <Avatar name={displayName} src={user?.student?.image_path} size={34} shape="rounded" />
                        {showLabels && (
                            <div className="min-w-0 leading-[1.15]">
                                <div className="truncate text-[12.5px] font-bold text-foreground">{displayName}</div>
                                <div className="text-[11px] text-[color:var(--text-label)]">{roleLabel}</div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
