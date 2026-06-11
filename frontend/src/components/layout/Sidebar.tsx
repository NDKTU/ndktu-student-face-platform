import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { useAuth } from '@/context/AuthContext';
import { buildSidebar } from '@/constants/resources';
import logo from '@/assets/logo.png';

interface SidebarProps {
    mobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
}

const Sidebar = ({ mobileOpen, setMobileOpen }: SidebarProps) => {
    const location = useLocation();
    const { user, permissions } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(true);

    const sections = useMemo(() => {
        const roleNames = (user?.roles ?? []).map((r) => r.name);
        return buildSidebar(permissions, roleNames);
    }, [user, permissions]);

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
                    'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-border bg-card transition-all duration-300 md:static',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
                    isCollapsed ? 'w-14' : 'w-60'
                )}
            >
                <div
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={cn(
                        'flex h-14 shrink-0 cursor-pointer items-center border-b border-border transition-colors hover:bg-accent',
                        isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'
                    )}
                >
                    <img src={logo} alt="NDKTU" className="h-8 w-8 shrink-0 object-contain rounded-lg" />
                    {!isCollapsed && (
                        <span className="text-[11px] font-semibold leading-snug text-foreground/75 line-clamp-2">
                            Navoiy davlat konchilik va texnologiyalar universiteti
                        </span>
                    )}
                </div>

                {mobileOpen && (
                    <button
                        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent md:hidden"
                        onClick={() => setMobileOpen(false)}
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}

                <div className="flex-1 overflow-y-auto py-3">
                    <nav className="flex flex-col gap-5 px-2">
                        {sections.map((section) => (
                            <div key={section.label}>
                                {!isCollapsed && (
                                    <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
                                        {section.label}
                                    </p>
                                )}
                                {isCollapsed && <div className="mb-1.5 h-px bg-border mx-1" />}

                                <div className="flex flex-col gap-0.5">
                                    {section.items.map((item) => {
                                        const isActive = location.pathname === item.href;
                                        return (
                                            <Link
                                                key={item.href}
                                                to={item.href}
                                                title={isCollapsed ? item.name : undefined}
                                                onClick={() => setMobileOpen(false)}
                                                className={cn(
                                                    'group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                                                    isCollapsed
                                                        ? 'h-9 w-9 justify-center mx-auto'
                                                        : 'h-9 gap-3 px-3',
                                                    isActive
                                                        ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]'
                                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                                )}
                                            >
                                                {isActive && (
                                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
                                                )}
                                                <item.icon className={cn('h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110', isActive && 'text-primary')} />
                                                {!isCollapsed && <span>{item.name}</span>}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </div>

                {!isCollapsed && (
                    <div className="shrink-0 border-t border-border px-4 py-3">
                        <p className="text-[10px] font-display italic text-muted-foreground/50 text-center">NDKTU © 2025</p>
                    </div>
                )}
            </aside>
        </>
    );
};

export default Sidebar;
