/**
 * Fayl manbasini tanlash maydoni.
 *
 * Ikki yoʻl bor: qurilmadan yangi fayl yuklash yoki platformaga allaqachon
 * yuklangan faylni kutubxonadan olish. Ilgari ikkinchi yoʻl kichkina matnli
 * havola boʻlgani uchun koʻzga tashlanmasdi — shuning uchun bu yerda ikkalasi
 * ham bir xil koʻrinishdagi, ikonkali karta.
 *
 * Qaysi yoʻl ochiqligini rol hal qiladi: oʻqituvchi faylni faqat «Fayllar
 * kutubxonasi»dan tanlaydi, talaba esa faqat oʻz qurilmasidan yuklaydi.
 * Bekend ham shu chegarani qoʻyadi (`DeviceUploadExceptTeacher`,
 * `FileLibraryExceptStudent`) — bu yerdagisi keraksiz tugmani koʻrsatmaslik
 * uchun.
 */
import { useRef, type ReactNode } from 'react';
import { ExternalLink, FolderOpen, UploadCloud } from 'lucide-react';
import { useRoleView } from '@/hooks/useRoleView';
import { cn } from '@/lib/utils';

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
    const { isTeacher, isStudent } = useRoleView();
    // Ikkala roli bor hisobda oʻqituvchi qoidasi ustun: bu maydon
    // oʻqituvchi formalarida turadi.
    const showDevice = !isTeacher;
    const showLibrary = isTeacher || !isStudent;

    return (
        <div className={className}>
            {label && <label className="mb-2 block text-xs font-medium text-muted-foreground">{label}</label>}
            <div className={cn('grid gap-2', showDevice && showLibrary && 'sm:grid-cols-2')}>
                {showDevice && (
                    <button type="button" className={CARD_CLASS} onClick={() => inputRef.current?.click()}>
                        <UploadCloud className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">Qurilmadan yuklash</span>
                        {deviceHint && <span className="text-xs text-muted-foreground">{deviceHint}</span>}
                    </button>
                )}
                {showLibrary && (
                    <button type="button" className={CARD_CLASS} onClick={onPickLibrary}>
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">Kutubxonadan tanlash</span>
                        {libraryHint && <span className="text-xs text-muted-foreground">{libraryHint}</span>}
                    </button>
                )}
            </div>
            {/* Qurilmadan yuklash yoʻq — yangi fayl qayerga yuklanishini aytamiz.
                Yangi oynada ochiladi: forma toʻldirilgan holicha qoladi. */}
            {!showDevice && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                    Yangi faylni avval{' '}
                    <a
                        href="/files"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                    >
                        «Fayllar kutubxonasi»
                        <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    sahifasiga yuklang, soʻng shu yerda tanlang.
                </p>
            )}
            {showDevice && (
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
            )}
            {children}
        </div>
    );
};
