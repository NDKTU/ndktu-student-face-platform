import { useId, type ReactNode } from 'react';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';

interface Props {
    title: ReactNode;
    description?: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    /** Yoqilganda ochiladigan qo'shimcha maydonlar — o'sha ramka ichida, qator ostida. */
    children?: ReactNode;
    className?: string;
}

/**
 * Sozlama qatori: sarlavha, izoh va o'ngda tugma — barcha formalarda bir xil.
 * Ilgari har oynada o'zicha edi (`rounded-lg`/`rounded-xl`, `p-3`/`px-3 py-2.5`,
 * tugma yonida yoki o'ngda), matnga bosish esa ba'zi joyda tugmani bosmas edi.
 */
export function SwitchField({ title, description, checked, onCheckedChange, disabled, id, children, className }: Props) {
    const autoId = useId();
    const switchId = id ?? autoId;
    return (
        <div className={cn('space-y-2 rounded-lg border border-border px-3 py-2.5', className)}>
            <div className="flex items-center justify-between gap-4">
                <label htmlFor={switchId} className={cn('min-w-0', disabled ? 'cursor-default' : 'cursor-pointer')}>
                    <div className="text-sm font-medium text-foreground">{title}</div>
                    {description && <div className="text-xs text-muted-foreground">{description}</div>}
                </label>
                <Switch id={switchId} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
            </div>
            {children}
        </div>
    );
}
