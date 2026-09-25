import { HardDrive } from 'lucide-react';
import type { FileQuota } from '@/services/fileService';
import { cn } from '@/lib/utils';
import { formatSize } from '@/utils/fileSize';

/** 80% dan sariq, 95% dan qizil — limit tugashidan oldin ogohlantirish. */
const quotaTone = (percent: number) =>
    percent >= 95 ? 'danger' : percent >= 80 ? 'warning' : 'normal';

const BAR_CLASS = {
    normal: 'bg-primary',
    warning: 'bg-amber-500',
    danger: 'bg-destructive',
} as const;

const quotaPercent = (used: number, limit: number | null) =>
    limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

interface QuotaMeterProps {
    used: number;
    limit: number | null;
    className?: string;
}

/** Faqat chiziq — jadval qatorlari uchun. */
export const QuotaMeter = ({ used, limit, className }: QuotaMeterProps) => {
    const percent = quotaPercent(used, limit);
    return (
        <div
            className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Ishlatilgan hajm ulushi"
        >
            <div
                className={cn('h-full rounded-full transition-all', BAR_CLASS[quotaTone(percent)])}
                style={{ width: `${percent}%` }}
            />
        </div>
    );
};

interface QuotaBarProps {
    quota: FileQuota | undefined;
    className?: string;
}

/**
 * O'qituvchining yuklash limiti: belgilangan, ishlatilgan, qolgan.
 * Admin uchun (cheklanmagan) faqat ishlatilgan hajm ko'rsatiladi.
 */
export const QuotaBar = ({ quota, className }: QuotaBarProps) => {
    if (!quota) {
        return <div className={cn('h-[104px] animate-pulse rounded-xl bg-muted/60', className)} />;
    }

    const limit = quota.limit_bytes;
    const remaining = quota.remaining_bytes ?? 0;
    const percent = quotaPercent(quota.used_bytes, limit);
    const tone = quotaTone(percent);

    return (
        <div className={cn('rounded-xl border border-border/70 bg-muted/20 p-3 text-xs', className)}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <HardDrive className="h-3.5 w-3.5 text-primary" />
                    Yuklash limiti
                </span>
                {quota.is_custom && (
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Individual
                    </span>
                )}
            </div>

            {limit === null ? (
                <p className="text-muted-foreground">
                    Cheklanmagan · Ishlatilgan:{' '}
                    <span className="font-medium text-foreground tabular-nums">{formatSize(quota.used_bytes)}</span>
                </p>
            ) : (
                <>
                    <QuotaMeter used={quota.used_bytes} limit={limit} />
                    <dl className="mt-2 grid grid-cols-3 gap-1 text-center tabular-nums">
                        <div>
                            <dt className="text-[10px] text-muted-foreground">Limit</dt>
                            <dd className="font-semibold text-foreground">{formatSize(limit)}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] text-muted-foreground">Ishlatilgan</dt>
                            <dd className="font-semibold text-foreground">{formatSize(quota.used_bytes)}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] text-muted-foreground">Qolgan</dt>
                            <dd
                                className={cn(
                                    'font-semibold',
                                    tone === 'danger'
                                        ? 'text-destructive'
                                        : tone === 'warning'
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-foreground',
                                )}
                            >
                                {remaining === 0 ? '0 MB' : formatSize(remaining)}
                            </dd>
                        </div>
                    </dl>
                    {remaining === 0 && (
                        <p className="mt-2 text-destructive">
                            Limit tugagan. Joy bo'shatish uchun ishlatilmayotgan fayllarni o'chiring.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};
