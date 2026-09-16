import React from 'react';
import { FilterX, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface FilterChipOption<T extends string = string> {
    value: T;
    label: string;
    count?: number;
}

export interface FilterChipGroupProps<T extends string = string> {
    label?: string;
    options: FilterChipOption<T>[];
    value: T;
    onChange: (val: T) => void;
}

export function FilterChipGroup<T extends string = string>({
    label,
    options,
    value,
    onChange,
}: FilterChipGroupProps<T>) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {label && (
                <span className="text-xs font-semibold text-muted-foreground mr-1">
                    {label}:
                </span>
            )}
            <div className="inline-flex rounded-xl border border-border/80 bg-muted/40 p-0.5">
                {options.map((opt) => {
                    const active = opt.value === value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange(opt.value)}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                                active
                                    ? 'bg-card text-foreground shadow-sm font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <span>{opt.label}</span>
                            {opt.count !== undefined && (
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 py-0.2 text-[10px]',
                                        active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    {opt.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * «Filtrlarni tozalash» tugmasi.
 *
 * Alohida eksport qilinadi, chunki filtrlari `OrganizationToolbar` dan
 * tashqarida turgan sahifalar ham bor (`/results`, `/lessons`), tugma esa
 * hamma joyda bir xil ko'rinishi kerak.
 */
export const ClearFiltersButton: React.FC<{
    onClick: () => void;
    /** Nechta filtr yoqilgani. 0 bo'lsa tugma umuman chizilmaydi. */
    count?: number;
    className?: string;
}> = ({ onClick, count = 0, className }) => {
    const { t } = useTranslation();
    if (count <= 0) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border/80 bg-background px-2.5 py-1.5',
                'text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground hover:bg-muted',
                className,
            )}
        >
            <FilterX className="h-3.5 w-3.5" />
            <span>{t('Tozalash')}</span>
            <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">{count}</span>
        </button>
    );
};

interface OrganizationToolbarProps {
    search: string;
    onSearchChange: (val: string) => void;
    searchPlaceholder?: string;
    totalCount?: number;
    totalLabel?: string;
    chips?: React.ReactNode;
    extraFilters?: React.ReactNode;
    actions?: React.ReactNode;
    /** Nechta filtr yoqilgani — telefondagi «Filtrlar» tugmasidagi belgicha
     *  va «Tozalash» tugmasi uchun. */
    activeFilterCount?: number;
    /** Berilsa, filtr yoqilgan paytda «Tozalash» tugmasi chiqadi. */
    onClearFilters?: () => void;
    className?: string;
}

export const OrganizationToolbar: React.FC<OrganizationToolbarProps> = ({
    search,
    onSearchChange,
    searchPlaceholder,
    totalCount,
    totalLabel,
    chips,
    extraFilters,
    actions,
    activeFilterCount = 0,
    onClearFilters,
    className,
}) => {
    const { t } = useTranslation();
    // Sukut yozuvlari shu yerda tarjima qilinadi: `t()` ni props sukutida
    // chaqirib bo'lmaydi, u komponent ichida yashaydi.
    const placeholder = searchPlaceholder ?? t('Qidirish...');
    const countLabel = totalLabel ?? t('Jami');
    // Telefonda filtrlar bitta tugma ortiga yig'iladi: `/results` da 7 ta filtr
    // butun birinchi ekranni egallab, ma'lumot ko'rinmay qolardi. `md` dan
    // yuqorida hech narsa o'zgarmaydi — filtrlar avvalgidek qatorda turadi.
    const [filtersOpen, setFiltersOpen] = React.useState(false);
    const hasFilters = Boolean(extraFilters || chips);
    const clearButton = onClearFilters ? (
        <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} />
    ) : null;

    return (
        <div className={cn('flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm', className)}>
            {/* Top Toolbar Row */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2.5">
                    {/* Search Bar */}
                    <div className="relative min-w-0 flex-1 sm:min-w-[220px] sm:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            // Qidiruv maydoni hisob ma'lumoti emas: `text` da
                            // brauzerning parol menejeri uni login maydoni deb
                            // o'ylab, saqlangan foydalanuvchi nomini o'zi qo'yib
                            // qo'yardi.
                            type="search"
                            name="search"
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            placeholder={placeholder}
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 pr-8 bg-background border-border/80 md:h-9 md:text-sm"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => onSearchChange('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                                aria-label={t('Qidiruvni tozalash')}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Telefonda filtrlar varaq ichida (pastda), bu yerda esa faqat tugma. */}
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={() => setFiltersOpen(true)}
                            className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-background px-3 text-sm font-semibold text-foreground md:hidden"
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            <span>{t('Filtrlar')}</span>
                            {activeFilterCount > 0 && (
                                <span className="rounded-full bg-primary/15 px-1.5 text-xs font-bold text-primary">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    )}

                    {extraFilters && (
                        <div className="hidden flex-wrap items-center gap-2.5 md:flex">{extraFilters}</div>
                    )}

                    {/* Chiplar bo'lsa, tugma pastki qatorning oxirida turadi —
                        u yerda filtrlarning hammasi ko'rinib turadi. */}
                    {!chips && <div className="hidden md:flex">{clearButton}</div>}

                    {/* Total Count Badge */}
                    {totalCount !== undefined && (
                        <div className="hidden sm:flex items-center rounded-xl bg-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                            <span>{countLabel}:</span>
                            <span className="ml-1 text-foreground font-bold font-mono">{totalCount}</span>
                        </div>
                    )}
                </div>

                {actions && (
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        {actions}
                    </div>
                )}
            </div>

            {/* Bottom Chips / Secondary Filter Row if present */}
            {chips && (
                <div className="hidden flex-wrap items-center gap-3 border-t border-border/50 pt-2.5 text-xs md:flex">
                    {chips}
                    {clearButton && <div className="ml-auto">{clearButton}</div>}
                </div>
            )}

            {/* Telefondagi filtrlar varag'i. `Modal` `md` dan pastda pastdan
                chiqadigan bottom sheet bo'lib ochiladi (components/ui/Modal.tsx). */}
            {hasFilters && (
                <Modal isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('Filtrlar')}>
                    <div className="flex flex-col gap-5 [&>*]:w-full [&_[class*='w-[']]:w-full">
                        {extraFilters}
                        {chips && <div className="flex flex-col gap-3 border-t border-border/50 pt-4">{chips}</div>}
                        {onClearFilters && activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClearFilters();
                                    setFiltersOpen(false);
                                }}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background text-sm font-semibold text-foreground"
                            >
                                <FilterX className="h-4 w-4" />
                                {t('Filtrlarni tozalash')}
                            </button>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};
