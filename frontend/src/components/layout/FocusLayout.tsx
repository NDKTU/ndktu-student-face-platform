import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { BRAND } from '@/config/branding';
import logo from '@/assets/logo.png';

import { PageTransition } from './PageTransition';

/**
 * Минимальный лейаут для прохождения тестов: без сайдбара и лишней навигации,
 * чтобы студент сосредоточился на тесте. Выход — только «Bosh sahifa».
 */
const FocusLayout = () => {
    const { theme, toggleTheme } = useTheme();
    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm sm:px-6">
                <div className="flex items-center gap-2.5">
                    <img src={logo} alt={BRAND.shortName} className="h-8 w-8 rounded-lg object-contain" />
                    <span className="font-display text-sm font-semibold text-foreground">{BRAND.appName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={toggleTheme}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        aria-label={theme === 'dark' ? t("Yorug' rejim") : t("Qorong'i rejim")}
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                    <Link
                        to="/"
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                        <Home className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('Bosh sahifa')}</span>
                    </Link>
                </div>
            </header>
            <main className="flex-1">
                <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
                    <PageTransition>
                        <Outlet />
                    </PageTransition>
                </div>
            </main>
        </div>
    );
};

export default FocusLayout;
