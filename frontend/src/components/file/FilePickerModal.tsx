/**
 * Kutubxonadan fayl tanlash oynasi.
 *
 * Fayl yuklanadigan har bir joyda ikki yoʻl boʻlishi kerak: yangi fayl yuklash
 * yoki allaqachon yuklangan faylni qayta ishlatish. Bu komponent ikkinchisini
 * beradi — shunda bitta maʼruzani uch guruhga berish uchun uni uch marta
 * yuklash shart emas.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, FileText, Search } from 'lucide-react';
import { useFiles } from '@/hooks/useFiles';
import type { LibraryFile } from '@/services/fileService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 24;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export interface FilePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Tanlangan fayllar. multiple=false boʻlsa roʻyxatda bitta element boʻladi. */
    onSelect: (files: LibraryFile[]) => void;
    /** Bir nechta fayl tanlash mumkinmi. Default — mumkin. */
    multiple?: boolean;
    /** Faqat rasm yoki faqat hujjat koʻrsatish. */
    kind?: 'image' | 'document';
    title?: string;
}

export const FilePickerModal = ({
    isOpen,
    onClose,
    onSelect,
    multiple = true,
    kind,
    title = 'Kutubxonadan tanlash',
}: FilePickerModalProps) => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<LibraryFile[]>([]);

    // Oyna har ochilganda toza holatdan boshlanadi: oldingi tanlov qolib
    // ketsa foydalanuvchi buni sezmay, keraksiz faylni qoʻshib yuboradi.
    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setPage(1);
            setSelected([]);
        }
    }, [isOpen]);

    const params = useMemo(
        () => ({ page, size: PAGE_SIZE, search: search.trim() || undefined, kind }),
        [page, search, kind],
    );

    const { data, isLoading } = useFiles(params);

    const toggle = (file: LibraryFile) => {
        setSelected((prev) => {
            const exists = prev.some((item) => item.id === file.id);
            if (exists) return prev.filter((item) => item.id !== file.id);
            return multiple ? [...prev, file] : [file];
        });
    };

    const confirm = () => {
        if (!selected.length) return;
        onSelect(selected);
        onClose();
    };

    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-3xl">
            <div className="space-y-4">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Nomi boʻyicha qidirish"
                        className="pl-9"
                        autoFocus
                    />
                </div>

                <div className="max-h-[50vh] min-h-[200px] overflow-y-auto rounded-lg border border-border p-2">
                    {isLoading ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <Skeleton key={index} className="h-20 w-full rounded-lg" />
                            ))}
                        </div>
                    ) : !data?.items.length ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                            {search
                                ? 'Hech narsa topilmadi'
                                : 'Kutubxona boʻsh — avval fayl yuklang'}
                        </p>
                    ) : (
                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {data.items.map((file) => {
                                const isSelected = selected.some((item) => item.id === file.id);
                                return (
                                    <li key={file.id}>
                                        <button
                                            type="button"
                                            onClick={() => toggle(file)}
                                            aria-pressed={isSelected}
                                            className={cn(
                                                'relative flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors',
                                                isSelected
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-border hover:bg-muted/60',
                                            )}
                                        >
                                            {IMAGE_EXT.test(file.url) ? (
                                                <img
                                                    src={file.url}
                                                    alt=""
                                                    loading="lazy"
                                                    className="h-11 w-11 shrink-0 rounded object-cover"
                                                />
                                            ) : (
                                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-muted">
                                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                                </span>
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm">{file.title}</span>
                                                <span className="block text-xs text-muted-foreground tabular-nums">
                                                    {formatSize(file.size_bytes)}
                                                </span>
                                            </span>
                                            {isSelected && (
                                                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                    <Check className="h-3 w-3" />
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {totalPages > 1 && (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={page === 1}
                                    onClick={() => setPage((value) => value - 1)}
                                >
                                    Oldingi
                                </Button>
                                <span className="tabular-nums">
                                    {page} / {totalPages}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((value) => value + 1)}
                                >
                                    Keyingi
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Bekor qilish
                        </Button>
                        <Button type="button" onClick={confirm} disabled={!selected.length}>
                            {selected.length > 1 ? `Tanlash (${selected.length})` : 'Tanlash'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
