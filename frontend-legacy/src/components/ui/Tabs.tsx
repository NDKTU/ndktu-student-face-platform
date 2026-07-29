import { cn } from '@/utils/utils';

export interface TabItem {
    key: string;
    label: string;
    count?: number;
}

interface TabsProps {
    tabs: TabItem[];
    value: string;
    onChange: (key: string) => void;
    className?: string;
}

/** Underline tab bar matching the mockup's detail-panel tabs. */
const Tabs = ({ tabs, value, onChange, className }: TabsProps) => (
    <div className={cn('flex items-center gap-1 border-b border-border', className)}>
        {tabs.map((tab) => {
            const active = tab.key === value;
            return (
                <button
                    key={tab.key}
                    type="button"
                    onClick={() => onChange(tab.key)}
                    className={cn(
                        '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
                        active
                            ? 'border-primary text-primary'
                            : 'border-transparent text-[color:var(--text-body)] hover:text-foreground',
                    )}
                >
                    {tab.label}
                    {tab.count !== undefined && (
                        <span
                            className={cn(
                                'rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                                active ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
                            )}
                        >
                            {tab.count}
                        </span>
                    )}
                </button>
            );
        })}
    </div>
);

export default Tabs;
