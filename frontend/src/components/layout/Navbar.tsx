import { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { setLanguage } from '@/i18n';
import { User, LogOut, Sun, Moon, Menu, ChevronDown, Check, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/avatarTiles';
import { displayNameOf } from '@/lib/userDisplay';

interface NavbarProps {
    onMenuClick: () => void;
}

/* To'liq barcha yo'llar xaritasi */
const PATH_LABELS: Record<string, string> = {
    '/':                    'Bosh sahifa',
    '/dashboard':           'Boshqaruv paneli',
    '/profile':             'Profil',
    '/users':               'Foydalanuvchilar',
    '/roles':               'Rollar',
    '/permissions':         'Ruxsatlar',
    '/teachers':            "O'qituvchilar",
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
    '/homework':            'Uy vazifalari',
    '/results':             'Natijalar',
    '/results/answers':     'Javoblar tahlili',
};

/* Dinamik yo'llar */
const DYNAMIC_LABELS: Array<[RegExp, string]> = [
    [/^\/roles\/[^/]+\/permissions$/, 'Rol ruxsatlari'],
    [/^\/questions\/[^/]+\/edit$/, 'Savolni tahrirlash'],
    [/^\/lessons\/[^/]+$/, 'Dars tafsilotlari'],
    [/^\/homework\/[^/]+\/submissions$/, 'Ishlarni tekshirish'],
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
    const { user, logout, activeRole, availableRoles, setActiveRole } = useAuth();
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

    // O'qituvchi va talabada — F.I.SH, qolganlarida login: HEMIS raqami
    // ekranda hech narsa anglatmaydi.
    const displayName = displayNameOf(user, activeRole);

    const initials = initialsOf(displayName);

    return (
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-card/95 px-4 md:px-6 backdrop-blur-md transition-colors duration-200">
            {/* Left: Sidebar Toggle & Breadcrumbs */}
            <div className="flex items-center gap-3.5">
                <button
                    onClick={onMenuClick}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all duration-200 md:hidden"
                    aria-label="Menyuni ochish"
                >
                    <Menu className="h-5 w-5" />
                </button>

                {/* Breadcrumbs in Wowdash style */}
                <nav className="flex items-center gap-2 text-sm">
                    <Link
                        to="/"
                        className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-primary transition-colors py-1 font-semibold"
                    >
                        <Home className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('Bosh sahifa')}</span>
                    </Link>
                    {!isHome && (
                        <>
                            <span className="text-slate-400 select-none">/</span>
                            <span className="font-bold text-slate-900 dark:text-white">{pageLabel}</span>
                        </>
                    )}
                </nav>
            </div>

            {/* Right: Actions & User Dropdown */}
            <div className="flex items-center gap-2 sm:gap-3">
                {/* Language Switcher */}
                <button
                    onClick={toggleLang}
                    className="flex h-10 items-center justify-center rounded-full bg-slate-200/70 dark:bg-muted/60 px-3 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:bg-primary/10 hover:text-primary transition-all duration-200"
                    aria-label={currentLang === 'uz' ? 'Переключить на русский' : "O'zbek tiliga o'tish"}
                >
                    {currentLang === 'uz' ? 'UZ' : 'RU'}
                </button>

                {/* Theme Toggle Button in Wowdash style */}
                <button
                    onClick={toggleTheme}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200/70 dark:bg-muted/60 text-slate-700 dark:text-slate-300 hover:bg-primary/10 hover:text-primary transition-all duration-200"
                    aria-label={theme === 'dark' ? t('Yorug\' rejim') : t('Qorong\'i rejim')}
                >
                    {theme === 'dark'
                        ? <Sun className="h-[18px] w-[18px] text-amber-400" />
                        : <Moon className="h-[18px] w-[18px]" />
                    }
                </button>

                {/* Profile Widget */}
                <div className="relative ml-1">
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="flex items-center gap-2.5 rounded-full border border-border bg-card p-1.5 pl-1.5 pr-3 hover:border-primary/40 hover:bg-muted/40 transition-all duration-200 shadow-sm"
                        aria-expanded={isProfileOpen}
                        aria-haspopup="menu"
                    >
                        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold overflow-hidden ring-2 ring-primary/20">
                            {user?.student?.image_path ? (
                                <img src={user.student.image_path} alt={displayName} className="h-full w-full object-cover" />
                            ) : (
                                <span>{initials}</span>
                            )}
                            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success ring-1 ring-card" />
                        </div>
                        <span className="hidden text-sm font-bold md:block max-w-[130px] truncate text-slate-900 dark:text-white">
                            {displayName}
                        </span>
                        <ChevronDown className={cn(
                            'h-3.5 w-3.5 text-slate-500 dark:text-slate-400 transition-transform duration-200',
                            isProfileOpen && 'rotate-180 text-primary'
                        )} />
                    </button>


                    {/* Popover Dropdown */}
                    {isProfileOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)} aria-hidden="true" />
                            <div
                                role="menu"
                                className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-border bg-popover p-2 shadow-xl backdrop-blur-md animate-fade-in-up"
                            >
                                {/* Wowdash Style Header inside Popover */}
                                <div className="rounded-xl bg-primary/10 p-3 mb-2">
                                    <p className="text-sm font-bold text-primary truncate">{displayName}</p>
                                    <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                        {activeRole?.name || user?.roles?.[0]?.name || t('Foydalanuvchi')}
                                    </p>
                                </div>

                                {/* Multi-role switcher */}
                                {availableRoles.length > 1 && (
                                    <>
                                        <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                            {t("Ko'rinishni tanlang")}
                                        </p>
                                        <div className="space-y-1 mb-2">
                                            {availableRoles.map((role) => (
                                                <button
                                                    key={role.id}
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setActiveRole(role.id);
                                                        setIsProfileOpen(false);
                                                        navigate('/');
                                                    }}
                                                    className={cn(
                                                        'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                                                        activeRole?.id === role.id
                                                            ? 'bg-primary text-white font-semibold shadow-sm'
                                                            : 'text-foreground hover:bg-primary/10 hover:text-primary',
                                                    )}
                                                >
                                                    <span className="truncate">{role.name}</span>
                                                    {activeRole?.id === role.id && <Check className="h-4 w-4 shrink-0 text-white" />}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="h-px bg-border my-1.5" />
                                    </>
                                )}

                                <Link
                                    to="/profile"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                                    onClick={() => setIsProfileOpen(false)}
                                >
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {t('Profil')}
                                </Link>

                                <div className="h-px bg-border my-1.5" />

                                <button
                                    role="menuitem"
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                    <LogOut className="h-4 w-4" />
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

