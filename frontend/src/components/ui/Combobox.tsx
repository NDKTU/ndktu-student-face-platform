import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComboboxProps {
    options: { value: string; label: string }[];
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

    const filteredOptions = options.filter((option) =>
        option.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedLabel = value
        ? options.find((option) => option.value === value)?.label
        : placeholder;

    // Handle click outside to close
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
                setSearchQuery("");
            }
        };

        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
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
                    "flex h-9 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-2xs transition-all duration-150 hover:border-primary/40 hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    open && "border-primary ring-2 ring-primary/20",
                    className
                )}
                disabled={disabled}
            >
                <span className="truncate text-xs font-medium">{selectedLabel}</span>
                <ChevronsUpDown className={cn("ml-2 h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-150", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/80 bg-popover/98 p-1 text-popover-foreground shadow-xl backdrop-blur-md outline-none animate-fade-scale">
                    <div className="flex items-center border-b border-border/60 px-2.5 pb-1 pt-0.5">
                        <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70" />
                        <input
                            ref={inputRef}
                            className="flex h-8 w-full rounded-lg bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => {
                                const query = e.target.value;
                                setSearchQuery(query);
                                onSearchChange?.(query);
                            }}
                        />
                    </div>
                    <div className="max-h-60 overflow-auto p-1 custom-scrollbar">
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
                                        "relative flex cursor-pointer select-none items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-primary/10 hover:text-primary",
                                        value === option.value && "bg-primary/10 text-primary font-semibold"
                                    )}
                                >
                                    <span className="truncate">{option.label}</span>
                                    {value === option.value && (
                                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
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
