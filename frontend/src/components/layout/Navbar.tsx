import { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { setLanguage } from '@/i18n';
import { User, LogOut, Sun, Moon, Menu, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavbarProps {
    onMenuClick: () => void;
}

/* Полное покрытие всех маршрутов приложения — точные пути */
const PATH_LABELS: Record<string, string> = {
    '/':                    'Bosh sahifa',
    '/dashboard':           'Boshqaruv paneli',
    '/profile':             'Profil',
    '/users':               'Foydalanuvchilar',
    '/roles':               'Rollar',
    '/permissions':         'Ruxsatlar',
    '/teachers':            "O'qituvchilar",
    '/employees':           'Xodimlar',
    '/teacher-ranking':     'Reyting',
    '/faculties':           'Fakultetlar',
    '/kafedras':            'Kafedralar',
    '/groups':              'Guruhlar',
    '/students':            'Talabalar',
    '/admin/hemis-sync':    'HEMIS sinxronizatsiyasi',
    '/admin/eduplan-sync':  'EduPlan sinxronizatsiyasi',
    '/lessons':             'Darslar',
    '/psychology':          'Psixologiya',
    '/psychology/results':  'Psixologiya natijalari',
    '/psychology/student':  'Psixologik testlar',
    '/subjects':            'Fanlar',
    '/courses':             'Kurslar',
    '/teacher-groups':      'Mening guruhlarim',
    '/teacher-subjects':    'Mening fanlarim',
    '/questions':           'Savollar',
    '/questions/create':    'Yangi savol',
    '/quizzes':             'Testlar',
    '/active-quizzes':      'Faol testlar',
    '/quiz-test':           'Test ishlash',
    '/results':             'Natijalar',
    '/results/answers':     'Javoblar tahlili',
};

/* Маршруты с динамическими сегментами */
const DYNAMIC_LABELS: Array<[RegExp, string]> = [
    [/^\/roles\/[^/]+\/permissions$/, 'Rol ruxsatlari'],
    [/^\/questions\/[^/]+\/edit$/, 'Savolni tahrirlash'],
    [/^\/lessons\/[^/]+$/, 'Dars tafsilotlari'],
    [/^\/psychology\/test\/[^/]+$/, 'Psixologik test'],
];

const getPageLabel = (pathname: string) => {
    const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const exact = PATH_LABELS[normalized];
    if (exact) return exact;
    const dynamic = DYNAMIC_LABELS.find(([pattern]) => pattern.test(normalized));
    if (dynamic) return dynamic[1];
    return PATH_LABELS[`/${normalized.split('/')[1] ?? ''}`] ?? (normalized.split('/')[1] || 'Bosh sahifa');
};

const Navbar = ({ onMenuClick }: NavbarProps) => {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const currentLang = i18n.language === 'ru' ? 'ru' : 'uz';
    const toggleLang = () => setLanguage(currentLang === 'uz' ? 'ru' : 'uz');

    const pageLabel = t(getPageLabel(location.pathname));
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
        <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-4 md:px-6 backdrop-blur-sm shadow-[0_1px_0_0_var(--border)]">
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
                                {t('Bosh sahifa')}
                            </Link>
                            <span className="text-border select-none">/</span>
                            <span className="font-medium text-foreground">{pageLabel}</span>
                        </>
                    ) : (
                        <span className="font-semibold text-foreground font-display">{t('Bosh sahifa')}</span>
                    )}
                </nav>
            </div>

            {/* Right */}
            <div className="flex items-center gap-1.5">
                <button
                    onClick={toggleLang}
                    className="flex h-8 items-center justify-center rounded-lg px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    aria-label={currentLang === 'uz' ? 'Переключить на русский' : "O'zbek tiliga o'tish"}
                >
                    {currentLang === 'uz' ? 'UZ' : 'RU'}
                </button>
                <button
                    onClick={toggleTheme}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    aria-label={theme === 'dark' ? t('Yorug\' rejim') : t('Qorong\'i rejim')}
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
                                        {user?.roles?.map(r => r.name).join(', ') || t('Foydalanuvchi')}
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
                                    {t('Profil')}
                                </Link>
                                <div className="h-px bg-border my-1" />
                                <button
                                    role="menuitem"
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-destructive hover:bg-destructive/8 transition-colors"
                                >
                                    <LogOut className="h-3.5 w-3.5" />
                                    {t('Chiqish')}
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
