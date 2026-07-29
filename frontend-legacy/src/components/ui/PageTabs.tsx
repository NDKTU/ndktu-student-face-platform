import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/utils/utils';

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

    return (
        <div className={cn("flex border-b border-border mb-6 overflow-x-auto custom-scrollbar", className)}>
            {tabs.map((tab) => {
                const isActive = location.pathname === tab.href || location.pathname.startsWith(tab.href + '/');
                return (
                    <Link
                        key={tab.href}
                        to={tab.href}
                        className={cn(
                            "px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2",
                            isActive 
                                ? "border-primary text-primary" 
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
