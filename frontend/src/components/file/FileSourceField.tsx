/**
 * Fayl manbasini tanlash maydoni.
 *
 * Fayl yuklanadigan har bir joyda ikki yoʻl bor: qurilmadan yangi fayl yuklash
 * yoki platformaga allaqachon yuklangan faylni kutubxonadan olish. Ilgari
 * ikkinchi yoʻl kichkina matnli havola boʻlgani uchun koʻzga tashlanmasdi —
 * shuning uchun bu yerda ikkalasi ham bir xil koʻrinishdagi, ikonkali karta.
 */
import { useRef, type ReactNode } from 'react';
import { FolderOpen, UploadCloud } from 'lucide-react';

interface FileSourceFieldProps {
    /** Maydon sarlavhasi. Berilmasa — chiqarilmaydi. */
    label?: string;
    /** `<input type="file">` uchun `accept`. */
    accept?: string;
    /** Bir nechta fayl tanlash mumkinmi. */
    multiple?: boolean;
    /** Qurilmadan tanlangan fayllar. */
    onFiles: (files: File[]) => void;
    /** Kutubxona oynasini ochish. */
    onPickLibrary: () => void;
    /** Qurilmadan yuklash kartasi ostidagi izoh — qaysi formatlar qabul qilinadi. */
    deviceHint?: string;
    /** Kutubxona kartasi ostidagi izoh. */
    libraryHint?: string;
    /** Kartalar ostida koʻrsatiladigan tanlangan fayllar roʻyxati. */
    children?: ReactNode;
    className?: string;
}

const CARD_CLASS =
    'flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-input bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const FileSourceField = ({
    label,
    accept,
    multiple = false,
    onFiles,
    onPickLibrary,
    deviceHint,
    libraryHint = 'Platformaga oldin yuklangan fayllar',
    children,
    className,
}: FileSourceFieldProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className={className}>
            {label && <label className="mb-2 block text-xs font-medium text-muted-foreground">{label}</label>}
            <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className={CARD_CLASS} onClick={() => inputRef.current?.click()}>
                    <UploadCloud className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Qurilmadan yuklash</span>
                    {deviceHint && <span className="text-xs text-muted-foreground">{deviceHint}</span>}
                </button>
                <button type="button" className={CARD_CLASS} onClick={onPickLibrary}>
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Kutubxonadan tanlash</span>
                    {libraryHint && <span className="text-xs text-muted-foreground">{libraryHint}</span>}
                </button>
            </div>
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={accept}
                multiple={multiple}
                onChange={(event) => {
                    const picked = Array.from(event.target.files ?? []);
                    if (picked.length) onFiles(picked);
                    // Bir xil faylni ikkinchi marta tanlaganda ham `change` ishlashi uchun.
                    event.target.value = '';
                }}
            />
            {children}
        </div>
    );
};
