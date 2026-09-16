import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ayni damda ochiq bo'lgan ro'yxatlar soni.
 *
 * Modal buni Escape bosilganda o'qiydi: ro'yxat ochiq bo'lsa, Escape avval
 * ro'yxatni yopadi, modalni emas. Boshqa yo'l yo'q — Radix `keydown` ni
 * hujjatda ushlash bosqichida tinglaydi va modal ochilganda ro'yxatdan oldin
 * ro'yxatdan o'tadi, ya'ni hodisani undan oldin to'xtatib bo'lmaydi. Radix esa
 * o'z `onEscapeKeyDown` ida `defaultPrevented` ni tekshiradi — modal aynan
 * shu yerda to'xtatiladi.
 */
let openCount = 0;

export const isComboboxOpen = () => openCount > 0;

export interface ComboboxOption {
    value: string;
    label: string;
    /**
     * Yozuv ostidagi mayda qator — bir xil nomli yozuvlarni ajratish uchun.
     *
     * Fanlar ro'yxatida bu o'quv reja nomi: EPMOS bitta fanni har bir reja
     * uchun alohida beradi, ya'ni «Akademik yozuv» to'rtta bo'ladi va nomning
     * o'zi bilan ular farq qilmaydi. Nomni uzaytirish o'rniga ikkinchi qator:
     * tanlangan qiymat tugmada qisqa ko'rinib turadi.
     */
    hint?: string;
}

interface ComboboxProps {
    options: ComboboxOption[];
    value?: string;
    onChange: (value: string) => void;
    onSearchChange?: (query: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    className?: string;
}

export function Combobox({
    options,
    value,
    onChange,
    onSearchChange,
    placeholder = "Tanlang...",
    searchPlaceholder = "Qidirish...",
    disabled = false,
    className,
}: ComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const containerRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Qidiruv ikkinchi qatorni ham qamrab oladi: reja nomi bo'yicha izlash —
    // takrorlar orasidan keraklisini topishning eng tabiiy yo'li.
    const filteredOptions = options.filter((option) => {
        const query = searchQuery.toLowerCase();
        return (
            option.label.toLowerCase().includes(query)
            || (option.hint ?? '').toLowerCase().includes(query)
        );
    });

    const selectedLabel = value
        ? options.find((option) => option.value === value)?.label
        : placeholder;

    // Handle click outside to close
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
                setSearchQuery("");
            }
        };

        // Ochiq ro'yxat ostidagi tugmalarni to'sib qo'yadi, shuning uchun uni
        // yopishning klaviatura yo'li ham kerak: sichqonchasiz ishlaydiganlar
        // uchun tashqariga bosishdan boshqa chora qolmasdi.
        //
        // `keydown` hujjat darajasida ushlanadi, chunki fokus qidiruv
        // maydonida ham, ro'yxat ichida ham, umuman boshqa joyda ham
        // bo'lishi mumkin.
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            setSearchQuery("");
        };

        // `touchstart` ham kerak: sensorli ekranda `mousedown` kechikib keladi,
        // shuning uchun ro'yxat barmoq bilan tashqariga bosilganda yopilmay turardi.
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("touchstart", handleClickOutside);
            document.addEventListener("keydown", handleEscape, true);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
            document.removeEventListener("keydown", handleEscape, true);
        };
    }, [open]);

    // Ochiq ro'yxatlar hisobi. `open` o'zgarganda emas, komponent yo'q
    // bo'lganda ham kamayishi kerak: ro'yxat ochiq turganda sahifa
    // almashinsa, hisob abadiy o'sib qolardi.
    React.useEffect(() => {
        if (!open) return;
        openCount += 1;
        return () => {
            openCount -= 1;
        };
    }, [open]);

    // Handle initial search focus
    React.useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue === value ? "" : optionValue);
        setOpen(false);
        setSearchQuery("");
    };

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            <button
                type="button"
                onClick={() => !disabled && setOpen(!open)}
                className={cn(
                    "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-base md:h-9 md:text-sm text-foreground shadow-2xs transition-all duration-150 hover:border-primary/40 hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    open && "border-primary ring-2 ring-primary/20",
                    className
                )}
                disabled={disabled}
            >
                <span className="truncate text-sm font-medium md:text-xs">{selectedLabel}</span>
                <ChevronsUpDown className={cn("ml-2 h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-150", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute z-50 mt-1.5 w-full min-w-[min(22rem,85vw)] rounded-xl border border-border/80 bg-popover/98 p-1 text-popover-foreground shadow-xl backdrop-blur-md outline-none animate-fade-scale">
                    <div className="flex items-center border-b border-border/60 px-2.5 pb-1 pt-0.5">
                        <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70" />
                        <input
                            ref={inputRef}
                            className="flex h-9 w-full rounded-lg bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-8 md:text-xs"
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => {
                                const query = e.target.value;
                                setSearchQuery(query);
                                onSearchChange?.(query);
                            }}
                        />
                    </div>
                    <div className="max-h-[45dvh] overflow-auto p-1 custom-scrollbar md:max-h-60">
                        {filteredOptions.length === 0 ? (
                            <div className="py-4 text-center text-xs text-muted-foreground">
                                Ma'lumot topilmadi
                            </div>
                        ) : (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.value}
                                    onClick={() => handleSelect(option.value)}
                                    className={cn(
                                        "relative flex cursor-pointer select-none items-start justify-between gap-2 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors duration-150 hover:bg-primary/10 hover:text-primary md:py-1.5 md:text-xs",
                                        value === option.value && "bg-primary/10 text-primary font-semibold"
                                    )}
                                >
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate">{option.label}</span>
                                        {option.hint && (
                                            <span className="line-clamp-2 break-words text-[11px] font-normal leading-tight text-muted-foreground">
                                                {option.hint}
                                            </span>
                                        )}
                                    </span>
                                    {value === option.value && (
                                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Combobox;
