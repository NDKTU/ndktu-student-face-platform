import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { RequestStatus } from '@/services/roydService';

/**
 * Holat nomlari. Server `new`/`accepted` kabi kalitlar beradi — ular
 * to'g'ridan-to'g'ri ko'rsatilsa, talaba inglizcha so'zlarni ko'rardi.
 */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
    new: 'Yangi',
    accepted: 'Qabul qilindi',
    in_progress: "Ko'rib chiqilmoqda",
    completed: 'Bajarildi',
    rejected: 'Rad etildi',
    returned: 'Qaytarildi',
};

const STATUS_CLASS: Record<RequestStatus, string> = {
    new: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    accepted: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    in_progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
    returned: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

export const RequestStatusBadge = ({
    status,
    className,
}: {
    status: RequestStatus;
    className?: string;
}) => {
    const { t } = useTranslation();
    // Tanimagan holat — ROYD yangisini qo'shsa, bo'sh joy emas, kalitning
    // o'zi ko'rinadi.
    const label = REQUEST_STATUS_LABEL[status] ?? status;
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground',
                className,
            )}
        >
            {t(label)}
        </span>
    );
};
