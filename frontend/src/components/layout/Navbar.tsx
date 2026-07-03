import { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { User, LogOut, Sun, Moon, Menu, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/utils';

interface NavbarProps {
    onMenuClick: () => void;
}

const ROUTE_LABELS: Record<string, string> = {
    '':                  'Dashboard',
    'users':             'Foydalanuvchilar',
    'teachers':          "O'qituvchilar",
    'employees':         'Xodimlar',
    'students':          'Talabalar',
    'faculties':         'Fakultetlar',
    'kafedras':          'Kafedralar',
    'groups':            'Guruhlar',
    'subjects':          'Fanlar',
    'questions':         'Savollar',
    'quizzes':           'Testlar',
    'quiz-test':         'Test ishlash',
    'results':           'Natijalar',
    'profile':           'Profil',
    'teacher-ranking':   'Reyting',
    'yakuniy':           'Yakuniy',
    'hemis-transactions':'HEMIS',
};

const getPageLabel = (pathname: string) => {
    const segment = pathname.split('/')[1] || '';
    return ROUTE_LABELS[segment] ?? segment;
};

const Navbar = ({ onMenuClick }: NavbarProps) => {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const pageLabel = getPageLabel(location.pathname);
    const isHome = location.pathname === '/';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const initials = user?.username
        ? user.username.slice(0, 2).toUpperCase()
        : 'U';

    const displayName = user?.student
        ? `${user.student.first_name} ${user.student.last_name}`.trim() || user.username
        : user?.username ?? 'User';

    return (
        <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-4 md:px-6 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">
            {/* Left */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors md:hidden"
                    aria-label="Toggle sidebar"
                >
                    <Menu className="h-4 w-4" />
                </button>

                <nav className="flex items-center gap-2 text-sm">
                    {!isHome ? (
                        <>
                            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
                                Bosh sahifa
                            </Link>
                            <span className="text-border select-none">/</span>
                            <span className="font-medium text-foreground">{pageLabel}</span>
                        </>
                    ) : (
                        <span className="font-semibold text-foreground font-display">Dashboard</span>
                    )}
                </nav>
            </div>

            {/* Right */}
            <div className="flex items-center gap-1.5">
                <button
                    onClick={toggleTheme}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    aria-label={theme === 'dark' ? 'Yorug\' rejim' : 'Qorong\'i rejim'}
                >
                    {theme === 'dark'
                        ? <Sun className="h-4 w-4" />
                        : <Moon className="h-4 w-4" />
                    }
                </button>

                {/* Profile */}
                <div className="relative ml-1">
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                        aria-expanded={isProfileOpen}
                        aria-haspopup="menu"
                    >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold overflow-hidden">
                            {user?.student?.image_path ? (
                                <img src={user.student.image_path} alt={displayName} className="h-full w-full object-cover" />
                            ) : (
                                <span>{initials}</span>
                            )}
                        </div>
                        <span className="hidden text-sm font-medium md:block max-w-[128px] truncate text-foreground">
                            {displayName}
                        </span>
                        <ChevronDown className={cn(
                            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                            isProfileOpen && 'rotate-180'
                        )} />
                    </button>

                    {isProfileOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)} aria-hidden="true" />
                            <div
                                role="menu"
                                className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-md p-1.5 shadow-lg"
                            >
                                <div className="px-2.5 py-2 mb-1">
                                    <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {user?.roles?.map(r => r.name).join(', ') || 'Foydalanuvchi'}
                                    </p>
                                </div>
                                <div className="h-px bg-border mb-1" />
                                <Link
                                    to="/profile"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                                    onClick={() => setIsProfileOpen(false)}
                                >
                                    <User className="h-3.5 w-3.5" />
                                    Profil
                                </Link>
                                <div className="h-px bg-border my-1" />
                                <button
                                    role="menuitem"
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-destructive hover:bg-destructive/8 transition-colors"
                                >
                                    <LogOut className="h-3.5 w-3.5" />
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

export default Navbar;
