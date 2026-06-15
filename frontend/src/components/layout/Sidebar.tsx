import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
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
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    // Manage which sections are open
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        'Umumiy': true,
        'Boshqaruv': false,
        'Foydalanuvchilar': true,
        'Testlar': false,
        'Ruxsatlar tizimi': false,
        'Test': true // for students
    });

    const toggleSection = (label: string) => {
        setOpenSections(prev => ({
            ...prev,
            [label]: !prev[label]
        }));
    };

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
                    isCollapsed ? 'w-16' : 'w-64'
                )}
            >
                <div
                    className={cn(
                        'flex h-16 shrink-0 items-center border-b border-border transition-colors',
                        isCollapsed ? 'justify-center px-0' : 'justify-between px-4'
                    )}
                >
                    <div className={cn("flex items-center gap-3 overflow-hidden", isCollapsed && "hidden")}>
                        <img src={logo} alt="NDKTU" className="h-8 w-8 shrink-0 object-contain rounded-lg" />
                        <span className="text-[12px] font-bold leading-tight text-foreground/80 line-clamp-2">
                            LMS Admin Panel
                        </span>
                    </div>
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={cn(
                            "flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            isCollapsed && "w-full"
                        )}
                    >
                        <Menu size={20} />
                    </button>
                </div>

                {mobileOpen && (
                    <button
                        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent md:hidden"
                        onClick={() => setMobileOpen(false)}
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}

                <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                    <nav className="flex flex-col gap-2 px-2">
                        {sections.filter(s => s.items.length > 0).map((section) => (
                            <div key={section.label} className="flex flex-col">
                                {!isCollapsed ? (
                                    <button 
                                        onClick={() => toggleSection(section.label)}
                                        className="flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
                                    >
                                        <span>{section.label}</span>
                                        <ChevronDown size={14} className={cn("transition-transform duration-200", openSections[section.label] ? "rotate-180" : "rotate-0")} />
                                    </button>
                                ) : (
                                    <div className="my-2 h-px bg-border/50 mx-2" />
                                )}

                                <div className={cn(
                                    "flex flex-col gap-1 overflow-hidden transition-all duration-300",
                                    !isCollapsed && !openSections[section.label] ? "max-h-0 opacity-0" : "max-h-[1000px] opacity-100"
                                )}>
                                    {section.items.map((item) => {
                                        const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                                        return (
                                            <div key={item.href} className="relative group">
                                                <Link
                                                    to={item.href}
                                                    onClick={() => setMobileOpen(false)}
                                                    className={cn(
                                                        'relative flex items-center rounded-lg text-sm font-medium transition-all duration-200',
                                                        isCollapsed
                                                            ? 'h-10 w-10 justify-center mx-auto'
                                                            : 'h-10 gap-3 px-3 mx-1',
                                                        isActive
                                                            ? 'bg-primary/10 text-primary font-semibold'
                                                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                                    )}
                                                >
                                                    {isActive && (
                                                        <span className={cn(
                                                            "absolute bg-primary rounded-r-full shadow-[0_0_8px_hsl(var(--primary)/0.5)] transition-all",
                                                            isCollapsed ? "left-0 top-2 bottom-2 w-1" : "left-[-4px] top-2 bottom-2 w-1"
                                                        )} />
                                                    )}
                                                    <item.icon className={cn('shrink-0 transition-transform duration-200 group-hover:scale-110', isCollapsed ? 'h-5 w-5' : 'h-[18px] w-[18px]', isActive && 'text-primary')} />
                                                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                                                </Link>

                                                {/* Tooltip for collapsed state */}
                                                {isCollapsed && (
                                                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-popover text-popover-foreground text-xs font-medium rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-border">
                                                        {item.name}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </div>

                {!isCollapsed && (
                    <div className="shrink-0 border-t border-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                {user?.username?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-foreground truncate max-w-[150px]">{user?.username}</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[150px]">{user?.roles?.[0]?.name || 'User'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </aside>
        </>
    );
};

export default Sidebar;
