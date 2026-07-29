import { useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/utils/utils';

export interface DropdownItem {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
}

interface DropdownMenuProps {
    items: DropdownItem[];
    align?: 'left' | 'right';
    /** Custom trigger; defaults to a MoreVertical icon button. */
    trigger?: ReactNode;
    className?: string;
    menuWidth?: number;
}

const DropdownMenu = ({ items, align = 'right', trigger, className, menuWidth = 190 }: DropdownMenuProps) => {
    const [open, setOpen] = useState(false);

    return (
        <div className={cn('relative', className)}>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
                aria-haspopup="menu"
                aria-expanded={open}
                className={cn(!trigger && 'grid h-[34px] w-[34px] place-items-center rounded-[10px] text-[color:var(--text-body)] transition-colors hover:bg-[#F4F5FA]')}
            >
                {trigger ?? <MoreVertical size={18} strokeWidth={2} />}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} aria-hidden="true" />
                    <div
                        role="menu"
                        style={{ width: menuWidth }}
                        className={cn(
                            'absolute top-full z-50 mt-1.5 overflow-hidden rounded-[12px] border border-border bg-popover p-1.5 shadow-pop [animation:dcdrop_.16s_ease]',
                            align === 'right' ? 'right-0' : 'left-0',
                        )}
                    >
                        {items.map((item, i) => (
                            <button
                                key={i}
                                type="button"
                                role="menuitem"
                                disabled={item.disabled}
                                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
                                className={cn(
                                    'flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
                                    item.danger
                                        ? 'text-destructive hover:bg-destructive/10'
                                        : 'text-[color:var(--text-body)] hover:bg-[#F4F5FA] hover:text-foreground',
                                )}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default DropdownMenu;
