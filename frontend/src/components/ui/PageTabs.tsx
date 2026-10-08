import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TabItem {
    label: string;
    href: string;
}

interface PageTabsProps {
    tabs: TabItem[];
    className?: string;
}

export function PageTabs({ tabs, className }: PageTabsProps) {
    const location = useLocation();
    const matches = (href: string) =>
        location.pathname === href || location.pathname.startsWith(href + '/');
    // Tablar bir-birining ichida bo'lishi mumkin (`/results` va
    // `/results/elementar`): faqat eng aniq mos kelgani faol.
    const activeHref = tabs
        .filter((tab) => matches(tab.href))
        .reduce<string | null>((best, tab) => (best && best.length >= tab.href.length ? best : tab.href), null);

    return (
        <div className={cn("flex border-b border-border mb-6 overflow-x-auto custom-scrollbar", className)}>
            {tabs.map((tab) => {
                const isActive = tab.href === activeHref;
                return (
                    <Link
                        key={tab.href}
                        to={tab.href}
                        className={cn(
                            "px-4 py-2.5 text-sm transition-colors whitespace-nowrap border-b-2",
                            isActive 
                                ? "border-primary text-primary font-bold" 
                                : "border-transparent text-muted-foreground font-medium hover:text-primary hover:border-primary/40"
                        )}
                    >
                        {tab.label}
                    </Link>


                );
            })}
        </div>
    );
}
