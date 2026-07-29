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
    placeholder = "Select option...",
    searchPlaceholder = "Search...",
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
                setSearchQuery(""); // Optional: reset search on close
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
                    "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                disabled={disabled}
            >
                <span className="truncate">{selectedLabel}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
                    <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                            ref={inputRef}
                            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => {
                                const query = e.target.value;
                                setSearchQuery(query);
                                onSearchChange?.(query);
                            }}
                        />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="py-6 text-center text-sm">No results found.</div>
                        ) : (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.value}
                                    className={cn(
                                        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                        value === option.value && "bg-accent text-accent-foreground"
                                    )}
                                    onClick={() => handleSelect(option.value)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.label}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
