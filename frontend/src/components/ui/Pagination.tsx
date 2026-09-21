/**
 * Pagination.tsx
 *
 * Ro'yxat pastidagi sahifalash paneli: chapda "Sahifada / Jami" ma'lumoti,
 * o'ngda strelkalar va raqamlar. Raqamlar ko'p bo'lsa oraliq "…" bilan
 * qisqartiriladi, birinchi va oxirgi sahifa esa doim ko'rinib turadi.
 */
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';

const DOTS = 'dots' as const;
type PageItem = number | typeof DOTS;

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    isLoading?: boolean;
    /** "Jami: N" — jami yozuvlar soni (berilmasa, chap blok ko'rsatilmaydi). */
    totalItems?: number;
    /** "Sahifada: N" — tanlagich faqat `onPageSizeChange` bilan birga chiqadi. */
    pageSize?: number;
    onPageSizeChange?: (pageSize: number) => void;
    pageSizeOptions?: number[];
    className?: string;
}

const range = (start: number, end: number) =>
    Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);

/**
 * Ko'rsatiladigan raqamlar: joriy sahifa atrofidagi `siblings` ta qo'shni,
 * hamda birinchi/oxirgi sahifa. Uzilish joylariga DOTS qo'yiladi.
 */
const buildPageItems = (currentPage: number, totalPages: number, siblings: number): PageItem[] => {
    // birinchi + oxirgi + joriy + 2 ta "…" + qo'shnilar
    const maxSlots = siblings * 2 + 5;
    if (totalPages <= maxSlots) return range(1, totalPages);

    const left = Math.max(currentPage - siblings, 1);
    const right = Math.min(currentPage + siblings, totalPages);
    const showLeftDots = left > 2;
    const showRightDots = right < totalPages - 1;

    if (!showLeftDots && showRightDots) {
        return [...range(1, siblings * 2 + 3), DOTS, totalPages];
    }
    if (showLeftDots && !showRightDots) {
        return [1, DOTS, ...range(totalPages - (siblings * 2 + 2), totalPages)];
    }
    return [1, DOTS, ...range(left, right), DOTS, totalPages];
};

export const Pagination = ({
    currentPage,
    totalPages,
    onPageChange,
    isLoading = false,
    totalItems,
    pageSize,
    onPageSizeChange,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    className,
}: PaginationProps) => {
    const { t } = useTranslation();
    // Telefonda raqamlar uchun joy kam — qo'shnilarsiz, faqat joriy sahifa.
    const siblings = useIsMobile() ? 0 : 1;

    const showSizeSelect = Boolean(onPageSizeChange && pageSize);
    const showTotal = totalItems !== undefined;
    const showSummary = showSizeSelect || showTotal;
    const showNav = totalPages > 1;

    // Bitta sahifa va ko'rsatadigan ma'lumot ham bo'lmasa — panel keraksiz.
    if (!showNav && (!showSummary || !totalItems)) return null;

    const items = showNav ? buildPageItems(currentPage, totalPages, siblings) : [];
    const sizeOptions = pageSize && !pageSizeOptions.includes(pageSize)
        ? [...pageSizeOptions, pageSize].sort((a, b) => a - b)
        : pageSizeOptions;

    const navButton =
        'inline-flex h-9 min-w-9 touch-target items-center justify-center rounded-lg px-2 text-sm font-semibold ' +
        'transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
        'focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40';

    return (
        <nav
            aria-label={t('Sahifalash')}
            className={cn(
                'mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-card px-3 py-2.5 sm:px-4',
                showSummary ? 'justify-between' : 'justify-center',
                className,
            )}
        >
            {showSummary && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    {showSizeSelect && (
                        <label className="flex items-center gap-2">
                            <span>{t('Sahifada')}:</span>
                            <span className="relative inline-flex items-center">
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        onPageSizeChange?.(Number(e.target.value));
                                        // Hajm o'zgarsa joriy sahifa oralig'dan chiqib ketmasligi uchun.
                                        onPageChange(1);
                                    }}
                                    disabled={isLoading}
                                    aria-label={t('Sahifada')}
                                    className="h-9 cursor-pointer appearance-none rounded-lg border border-border bg-card py-0 pl-3 pr-8 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                                >
                                    {sizeOptions.map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" />
                            </span>
                        </label>
                    )}
                    {showTotal && (
                        <span>
                            {t('Jami')}: <span className="font-semibold text-foreground">{totalItems}</span>
                        </span>
                    )}
                </div>
            )}

            {showNav && (
                <div className="flex flex-wrap items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
                        aria-label={t('Oldingi sahifa')}
                        className={cn(navButton, 'text-muted-foreground hover:bg-primary/10 hover:text-primary')}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>

                    {items.map((item, index) =>
                        item === DOTS ? (
                            <span
                                key={`dots-${index}`}
                                aria-hidden
                                className="inline-flex h-9 min-w-9 items-center justify-center text-sm text-muted-foreground"
                            >
                                …
                            </span>
                        ) : (
                            <button
                                key={item}
                                type="button"
                                onClick={() => onPageChange(item)}
                                disabled={isLoading}
                                aria-current={item === currentPage ? 'page' : undefined}
                                className={cn(
                                    navButton,
                                    item === currentPage
                                        ? 'pointer-events-none bg-primary-strong text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-primary/10 hover:text-primary',
                                )}
                            >
                                {item}
                            </button>
                        ),
                    )}

                    <button
                        type="button"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages || isLoading}
                        aria-label={t('Keyingi sahifa')}
                        className={cn(navButton, 'text-muted-foreground hover:bg-primary/10 hover:text-primary')}
                    >
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </nav>
    );
};
