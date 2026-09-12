import { cn } from '@/lib/utils';

export interface TabDef<T extends string> {
    id: T;
    label: string;
    icon?: React.ReactNode;
}

/**
 * Sahifa ichidagi tablar.
 *
 * `PageTabs` dan farqi: u marshrutlar bilan ishlaydi (har bir tab — o'z URL'i),
 * bu esa bitta sahifa ichida holatni almashtiradi. Dars sahifasi uchun aynan
 * shu kerak: barcha ma'lumot bitta so'rovdan keladi va tab almashganda qayta
 * yuklash keraksiz.
 *
 * Bitta tab qolsa, panel umuman chizilmaydi — huquqi cheklangan foydalanuvchida
 * (masalan talabada) yolg'iz tab bezakdan boshqa narsa bo'lmaydi.
 */
export function TabBar<T extends string>({
    tabs,
    active,
    onChange,
    className,
}: {
    tabs: TabDef<T>[];
    active: T;
    onChange: (id: T) => void;
    className?: string;
}) {
    if (tabs.length < 2) return null;

    return (
        <div
            role="tablist"
            className={cn(
                'flex overflow-x-auto border-b border-border custom-scrollbar',
                className,
            )}
        >
            {tabs.map((tab) => {
                const isActive = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors',
                            isActive
                                ? 'border-primary font-bold text-primary'
                                : 'border-transparent font-medium text-muted-foreground hover:border-primary/40 hover:text-primary',
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
