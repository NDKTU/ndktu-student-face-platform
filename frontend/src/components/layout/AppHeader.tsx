import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Menu, Bell, ChevronDown, User, LogOut } from 'lucide-react';
import { cn } from '@/utils/utils';
import Avatar from '@/components/ui/Avatar';
import logo from '@/assets/logo.png';

interface AppHeaderProps {
    onMenuClick: () => void;
}

const AppHeader = ({ onMenuClick }: AppHeaderProps) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [notifOpen, setNotifOpen] = useState(false);
    const [avatarOpen, setAvatarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const displayName = user?.student
        ? `${user.student.first_name} ${user.student.last_name}`.trim() || user.username
        : user?.username ?? 'User';
    const title = user?.roles?.map((r) => r.name).join(', ') || 'Foydalanuvchi';

    return (
        <header className="relative z-40 flex h-[62px] flex-none items-center gap-4 border-b border-border bg-card px-5">
            {/* Sidebar toggle */}
            <button
                onClick={onMenuClick}
                aria-label="Menyu"
                className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-[#F4F5FA] hover:text-foreground"
            >
                <Menu size={20} strokeWidth={1.9} />
            </button>

            {/* Brand */}
            <Link to="/" className="flex flex-none items-center gap-[11px]">
                <img src={logo} alt="NDKTU" className="h-[38px] w-[38px] object-contain" />
                <div className="hidden leading-[1.05] sm:block">
                    <div className="text-base font-extrabold tracking-[-0.02em] text-foreground">
                        NDKTU <span className="text-primary">LMS</span>
                    </div>
                    <div className="text-[10.5px] font-medium tracking-[0.02em] text-[color:var(--text-label)]">
                        O'quv boshqaruv tizimi
                    </div>
                </div>
            </Link>

            <div className="flex-1" />

            {/* Right cluster */}
            <div className="flex flex-none items-center gap-1.5">
                {/* Notifications (visual shell — empty state) */}
                <div className="relative">
                    <button
                        onClick={() => { setNotifOpen((o) => !o); setAvatarOpen(false); }}
                        aria-label="Bildirishnomalar"
                        className="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border bg-card text-[color:var(--text-body)] transition-colors hover:bg-[#F4F5FA]"
                    >
                        <Bell size={19} strokeWidth={1.8} />
                    </button>
                    {notifOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} aria-hidden="true" />
                            <div className="absolute right-0 top-[46px] z-50 w-[344px] overflow-hidden rounded-[14px] border border-border bg-popover shadow-pop [animation:dcdrop_.16s_ease]">
                                <div className="flex items-center justify-between gap-2.5 border-b border-[#EEF0F6] px-4 py-[13px]">
                                    <span className="text-sm font-bold">Bildirishnomalar</span>
                                </div>
                                <div className="px-4 py-8 text-center">
                                    <div className="mx-auto mb-[11px] grid h-[42px] w-[42px] place-items-center rounded-[12px] bg-background text-[#B4B8CC]">
                                        <Bell size={20} strokeWidth={1.8} />
                                    </div>
                                    <div className="text-[13.5px] font-semibold text-[color:var(--text-body)]">
                                        Yangi bildirishnoma yo'q
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Avatar menu */}
                <div className="relative">
                    <button
                        onClick={() => { setAvatarOpen((o) => !o); setNotifOpen(false); }}
                        className="flex h-10 items-center gap-[9px] rounded-[22px] border border-border bg-card py-[3px] pl-[3px] pr-[9px] transition-colors hover:bg-[#F4F5FA]"
                        aria-expanded={avatarOpen}
                        aria-haspopup="menu"
                    >
                        <Avatar name={displayName} src={user?.student?.image_path} size={32} />
                        <span className="hidden text-left leading-[1.1] md:block">
                            <span className="block max-w-[140px] truncate text-[13px] font-bold text-foreground">{displayName}</span>
                            <span className="block text-[11px] text-[color:var(--text-label)]">{title}</span>
                        </span>
                        <ChevronDown size={16} strokeWidth={2} className={cn('text-[color:var(--text-label)] transition-transform', avatarOpen && 'rotate-180')} />
                    </button>
                    {avatarOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} aria-hidden="true" />
                            <div role="menu" className="absolute right-0 top-12 z-50 w-[220px] rounded-[14px] border border-border bg-popover p-1.5 shadow-pop [animation:dcdrop_.16s_ease]">
                                <div className="mb-1.5 border-b border-[#EEF0F6] px-3 pb-3 pt-2.5">
                                    <div className="text-[13.5px] font-bold text-foreground">{displayName}</div>
                                    <div className="mt-px text-[11.5px] text-[color:var(--text-label)]">{title}</div>
                                </div>
                                <Link
                                    to="/profile"
                                    role="menuitem"
                                    onClick={() => setAvatarOpen(false)}
                                    className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] font-semibold text-[color:var(--text-body)] transition-colors hover:bg-[#F4F5FA] hover:text-foreground"
                                >
                                    <User size={17} strokeWidth={1.8} />
                                    Profil
                                </Link>
                                <button
                                    role="menuitem"
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
                                >
                                    <LogOut size={17} strokeWidth={1.8} />
                                    Chiqish
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};

export default AppHeader;
