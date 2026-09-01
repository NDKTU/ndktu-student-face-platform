/**
 * Spravochnik yozuvini yashirish boshqaruvi — faqat admin uchun.
 *
 * Yashirilgan yozuv boshqa rollarga roʻyxatlarda ham, tanlov oynalarida ham
 * koʻrinmaydi. Eski maʼlumotga tegilmaydi: oʻtgan natijalar ochiladi,
 * boshlangan test toʻxtamaydi — shuning uchun tugma yonida izoh bor, aks
 * holda «yashirdim, demak toʻxtadi» degan notoʻgʻri kutish paydo boʻladi.
 */
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { useRoleView } from '@/hooks/useRoleView';
import { useSetVisibility } from '@/hooks/useVisibility';
import type { HideableEntity } from '@/services/visibilityService';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface HideableRow {
    id: number;
    is_hidden?: boolean;
}

/** Yashirilgan yozuv belgisi. Faqat admin koʻradi — boshqalarda satr yoʻq. */
export const HiddenBadge = ({ row }: { row?: HideableRow | null }) => {
    if (!row?.is_hidden) return null;
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            title="Bu yozuv boshqa rollarga koʻrinmaydi. Unga bogʻlangan eski maʼlumot ishlayveradi."
        >
            <EyeOff className="h-3 w-3" />
            yashirilgan
        </span>
    );
};

interface VisibilityButtonProps {
    entity: HideableEntity;
    row: HideableRow;
    /** Nima yashirilayotgani — toast matni uchun. */
    label?: string;
    className?: string;
    /** React Query ishlatmaydigan sahifalar uchun: roʻyxatni qayta yuklash. */
    onDone?: () => void;
}

export const VisibilityButton = ({ entity, row, label, className, onDone }: VisibilityButtonProps) => {
    const { isAdmin } = useRoleView();
    const mutation = useSetVisibility(entity);

    if (!isAdmin) return null;

    const hidden = Boolean(row.is_hidden);

    const toggle = async (event: React.MouseEvent) => {
        event.stopPropagation();
        try {
            await mutation.mutateAsync({ id: row.id, isHidden: !hidden });
            onDone?.();
            const name = label ? `«${label}»` : 'Yozuv';
            toast.success(
                hidden
                    ? `${name} qaytarildi`
                    : `${name} yashirildi — boshqa rollar endi uni koʻrmaydi`,
            );
        } catch {
            toast.error('Holatni oʻzgartirib boʻlmadi');
        }
    };

    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={hidden ? 'Koʻrsatish' : 'Yashirish'}
            title={
                hidden
                    ? 'Qaytarish: barcha rollar yana koʻradi'
                    : 'Yashirish: boshqa rollar koʻrmaydi, eski maʼlumot ishlayveradi'
            }
            onClick={toggle}
            disabled={mutation.isPending}
            className={cn(className)}
        >
            {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
    );
};

interface ShowHiddenSwitchProps {
    value: boolean;
    onChange: (next: boolean) => void;
}

/**
 * «Yashirilganlarni koʻrsatish» kaliti.
 *
 * Usiz admin oʻzi yashirgan yozuvni qayta topa olmaydi va qaytara olmaydi —
 * shuning uchun u boshidanoq kerak, keyinroq emas.
 */
export const ShowHiddenSwitch = ({ value, onChange }: ShowHiddenSwitchProps) => {
    const { isAdmin } = useRoleView();
    if (!isAdmin) return null;

    return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
                type="checkbox"
                checked={value}
                onChange={(event) => onChange(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Yashirilganlarni koʻrsatish
        </label>
    );
};
