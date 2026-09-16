import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
    /** Bazadagi haqiqiy talaba soni. */
    local?: number | null;
    /** EPOS aytgan son — ko'zgu qiymati. */
    epos?: number | null;
    className?: string;
}

/**
 * Guruhdagi talabalar soni: bizniki asosiy, EPOS niki yonida.
 *
 * Ikki son bir xil savolga javob bermaydi. `groups.student_count` — EPOS
 * ko'rsatkichi, «Talabalar» tugmasi esa bizning bazadagi qatorlarni ochadi.
 * 2026-09-15 da o'lchanganda 683 guruhdan 351 tasida ular farq qilardi, 100
 * tasida EPOS nol bo'lmagan sonni ko'rsatib turib ro'yxat bo'sh chiqardi.
 * EPOS sonini olib tashlamadik — u nosozlik belgisi sifatida qimmatli, lekin
 * asosiy son endi haqiqiy son.
 */
export const StudentCount = ({ local, epos, className }: Props) => {
    const { t } = useTranslation();
    const known = typeof local === 'number';
    const eposKnown = typeof epos === 'number';
    const mismatch = known && eposKnown && epos !== local;
    // Nol bo'lsa-yu, EPOS odam bor desa — bu eng chalkash holat: aynan shu
    // yerda bosgan odam bo'sh ro'yxatga tushadi, shuning uchun rang boshqa.
    const empty = known && local === 0 && (epos ?? 0) > 0;

    return (
        <span className={cn('inline-flex flex-col items-center gap-0.5 leading-tight', className)}>
            <span
                className={cn(
                    'inline-flex min-w-[32px] items-center justify-center rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold',
                    empty
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                )}
                title={
                    eposKnown && known
                        ? t('Bazada {{local}} ta talaba, EPOS {{epos}} ta deb hisoblaydi', { local, epos })
                        : undefined
                }
            >
                {known ? local : '—'}
            </span>
            {mismatch && (
                <span className="font-mono text-[10px] text-muted-foreground">EPOS: {epos}</span>
            )}
        </span>
    );
};
