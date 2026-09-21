/**
 * Kutubxonadan fayl tanlash oynasi.
 *
 * Fayl yuklanadigan har bir joyda ikki yoʻl boʻlishi kerak: yangi fayl yuklash
 * yoki allaqachon yuklangan faylni qayta ishlatish. Bu komponent ikkinchisini
 * beradi — shunda bitta maʼruzani uch guruhga berish uchun uni uch marta
 * yuklash shart emas.
 *
 * Fayllar papka boʻyicha koʻrsatiladi: avval papkalar, papka ochilganda —
 * faqat uning ichki papkalari va fayllari. Ilgari hamma fayl bitta aralash
 * roʻyxatda chiqardi va bir xil nomli maʼruzalarni farqlab boʻlmasdi.
 * Qidiruv esa butun kutubxona boʻyicha ishlaydi — har bir natija yonida
 * uning papka yoʻli koʻrinadi.
 */
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
    ArrowLeft,
    Check,
    ChevronRight,
    Download,
    FileText,
    Folder,
    Search,
    Users,
    X,
} from 'lucide-react';
import { useFileFolders, useFiles } from '@/hooks/useFiles';
import type { FileListParams, LibraryFile, LibraryFolder } from '@/services/fileService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
import { formatSize } from '@/utils/fileSize';

const PAGE_SIZE = 24;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

const ROOT_LABEL = 'Fayllar kutubxonasi';
const UNFILED_LABEL = 'Papkasiz';
const SHARED_LABEL = 'Hamkasblar fayllari';

/**
 * Oynada qayerda turibmiz.
 * `shared` — boshqa odamning papkasidagi, lekin menga koʻrinadigan fayllar:
 * ularning papkasi mening papkalar roʻyxatimda yoʻq.
 */
type Location = { kind: 'root' } | { kind: 'folder'; id: number } | { kind: 'shared' };

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
    const [location, setLocation] = useState<Location>({ kind: 'root' });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<LibraryFile[]>([]);

    // Oyna har ochilganda toza holatdan boshlanadi: oldingi tanlov qolib
    // ketsa foydalanuvchi buni sezmay, keraksiz faylni qoʻshib yuboradi.
    useEffect(() => {
        if (isOpen) {
            setLocation({ kind: 'root' });
            setSearch('');
            setPage(1);
            setSelected([]);
        }
    }, [isOpen]);

    const { data: folders = [], isLoading: foldersLoading } = useFileFolders(isOpen);

    const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

    /**
     * Papkaning ildizdan boshlab toʻliq yoʻli. Ota papka roʻyxatda boʻlmasa
     * (boshqa odamniki) yoʻl shu yerda uziladi; sikl boʻlsa ham osilib qolmaydi.
     */
    const pathById = useMemo(() => {
        const paths = new Map<number, LibraryFolder[]>();
        for (const folder of folderById.values()) {
            const path: LibraryFolder[] = [];
            const seen = new Set<number>();
            let current: LibraryFolder | undefined = folder;
            while (current && !seen.has(current.id)) {
                path.unshift(current);
                seen.add(current.id);
                current = current.parent_id !== null ? folderById.get(current.parent_id) : undefined;
            }
            paths.set(folder.id, path);
        }
        return paths;
    }, [folderById]);
    const folderPath = (id: number): LibraryFolder[] => pathById.get(id) ?? [];

    /** Fayl qaysi papkada turganini matn koʻrinishida. */
    const fileLocationLabel = (file: LibraryFile): string => {
        if (file.folder_id === null) return UNFILED_LABEL;
        const path = folderPath(file.folder_id);
        return path.length ? path.map((f) => f.name).join(' / ') : SHARED_LABEL;
    };

    const isSearching = search.trim().length > 0;

    // Ildizda koʻrinadigan papkalar: otasi yoʻq yoki otasi roʻyxatda yoʻq.
    const childFolders = useMemo(() => {
        if (isSearching || location.kind === 'shared') return [];
        if (location.kind === 'root') {
            return folders.filter((f) => f.parent_id === null || !folderById.has(f.parent_id));
        }
        return folders.filter((f) => f.parent_id === location.id);
    }, [folders, folderById, location, isSearching]);

    const childCount = useMemo(() => {
        const counts = new Map<number, number>();
        for (const f of folders) {
            if (f.parent_id !== null) counts.set(f.parent_id, (counts.get(f.parent_id) ?? 0) + 1);
        }
        return counts;
    }, [folders]);

    const params = useMemo<FileListParams>(() => {
        const base: FileListParams = { page, size: PAGE_SIZE, kind };
        if (isSearching) return { ...base, search: search.trim() };
        if (location.kind === 'folder') return { ...base, folder_id: location.id };
        if (location.kind === 'shared') return { ...base, shared_only: true };
        return { ...base, root_only: true };
    }, [page, search, isSearching, kind, location]);

    const { data, isLoading } = useFiles(params, isOpen);

    // "Hamkasblar fayllari" faqat unda nimadir boʻlsa chiqadi.
    const { data: sharedProbe } = useFiles(
        { shared_only: true, kind, page: 1, size: 1 },
        isOpen && location.kind === 'root' && !isSearching,
    );
    const hasShared = (sharedProbe?.total ?? 0) > 0;

    const navigate = (next: Location) => {
        setLocation(next);
        setSearch('');
        setPage(1);
    };

    const goUp = () => {
        if (location.kind !== 'folder') return navigate({ kind: 'root' });
        const parentId = folderById.get(location.id)?.parent_id ?? null;
        navigate(parentId !== null && folderById.has(parentId) ? { kind: 'folder', id: parentId } : { kind: 'root' });
    };

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
    const files = data?.items ?? [];

    // Qidiruvda papkalar koʻrsatilmaydi, shuning uchun ularni kutish shart emas.
    const loading = isLoading || (!isSearching && foldersLoading);
    const showSharedEntry = location.kind === 'root' && !isSearching && hasShared;
    const isEmpty = !loading && !childFolders.length && !showSharedEntry && !files.length;

    const breadcrumb: { label: string; target: Location | null }[] = [
        { label: ROOT_LABEL, target: { kind: 'root' } },
    ];
    if (isSearching) {
        breadcrumb.push({ label: 'Qidiruv natijalari', target: null });
    } else if (location.kind === 'shared') {
        breadcrumb.push({ label: SHARED_LABEL, target: null });
    } else if (location.kind === 'folder') {
        const path = folderPath(location.id);
        path.forEach((f, index) =>
            breadcrumb.push({
                label: f.name,
                target: index === path.length - 1 ? null : { kind: 'folder', id: f.id },
            }),
        );
    }

    const emptyMessage = isSearching
        ? 'Hech narsa topilmadi'
        : location.kind === 'root'
          ? 'Kutubxona boʻsh — avval fayl yuklang'
          : 'Bu papka boʻsh';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} className="md:max-w-3xl">
            <div className="space-y-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Butun kutubxonadan nomi boʻyicha qidirish"
                        className="pl-9"
                        autoFocus
                    />
                </div>

                <div className="flex min-h-8 items-center gap-1">
                    {(location.kind !== 'root' || isSearching) && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 shrink-0 p-0"
                            aria-label="Orqaga"
                            onClick={() => (isSearching ? setSearch('') : goUp())}
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    )}
                    <nav aria-label="Papka yoʻli" className="min-w-0 flex-1">
                        <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
                            {breadcrumb.map((crumb, index) => (
                                <li key={index} className="flex min-w-0 items-center gap-1">
                                    {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                    {crumb.target ? (
                                        <button
                                            type="button"
                                            onClick={() => navigate(crumb.target as Location)}
                                            className="truncate rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            {crumb.label}
                                        </button>
                                    ) : (
                                        <span className="truncate px-1 font-medium text-foreground" aria-current="location">
                                            {crumb.label}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ol>
                    </nav>
                </div>

                <div className="max-h-[45dvh] min-h-[200px] overflow-y-auto rounded-lg border border-border p-2">
                    {loading ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <Skeleton key={index} className="h-16 w-full rounded-lg" />
                            ))}
                        </div>
                    ) : isEmpty ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
                    ) : (
                        <div className="space-y-3">
                            {(childFolders.length > 0 || showSharedEntry) && (
                                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {childFolders.map((folder) => {
                                        const subCount = childCount.get(folder.id) ?? 0;
                                        return (
                                            <li key={folder.id}>
                                                <FolderButton
                                                    name={folder.name}
                                                    meta={[
                                                        subCount ? `${subCount} papka` : null,
                                                        // Tur filtri boʻlsa server sanogʻi boshqa turdagi fayllarni ham oʻz ichiga oladi.
                                                        !kind ? `${folder.file_count} fayl` : null,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                    icon={Folder}
                                                    onClick={() => navigate({ kind: 'folder', id: folder.id })}
                                                />
                                            </li>
                                        );
                                    })}
                                    {showSharedEntry && (
                                        <li>
                                            <FolderButton
                                                name={SHARED_LABEL}
                                                meta={`${sharedProbe?.total ?? 0} fayl`}
                                                icon={Users}
                                                onClick={() => navigate({ kind: 'shared' })}
                                            />
                                        </li>
                                    )}
                                </ul>
                            )}

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    {location.kind === 'root' && !isSearching && (childFolders.length > 0 || showSharedEntry) && (
                                        <p className="px-1 text-xs font-medium text-muted-foreground">
                                            Papkaga solinmagan fayllar
                                        </p>
                                    )}
                                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {files.map((file) => (
                                            <li key={file.id}>
                                                <FileTile
                                                    file={file}
                                                    isSelected={selected.some((item) => item.id === file.id)}
                                                    onToggle={() => toggle(file)}
                                                    locationLabel={isSearching ? fileLocationLabel(file) : undefined}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {selected.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                            Tanlangan ({selected.length})
                        </p>
                        <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                            {selected.map((file) => (
                                <li
                                    key={file.id}
                                    className="flex max-w-full items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 py-0.5 pl-2 pr-0.5 text-xs"
                                >
                                    <span className="min-w-0 truncate">
                                        <span className="text-muted-foreground">{fileLocationLabel(file)} / </span>
                                        <span className="font-medium text-foreground">{file.title}</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => toggle(file)}
                                        aria-label={`${file.title} tanlovini bekor qilish`}
                                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Modal ichida panel ramkasiz: pastdagi tugmalar qatoriga qo'shiladi. */}
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        isLoading={isLoading}
                        className="mt-0 rounded-none border-0 bg-transparent p-0"
                    />

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

const FolderButton = ({
    name,
    meta,
    icon: Icon,
    onClick,
}: {
    name: string;
    meta?: string;
    icon: ComponentType<{ className?: string }>;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/60"
    >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            {meta && <span className="block truncate text-xs text-muted-foreground tabular-nums">{meta}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
);

const FileTile = ({
    file,
    isSelected,
    onToggle,
    locationLabel,
}: {
    file: LibraryFile;
    isSelected: boolean;
    onToggle: () => void;
    /** Qidiruv natijasida — fayl qaysi papkadan ekanligi. */
    locationLabel?: string;
}) => (
    // Yuklab olish havolasi tanlash tugmasining ichida boʻla olmaydi
    // (interaktiv element ichida interaktiv element), shuning uchun yonma-yon.
    <div
        className={cn(
            'relative flex items-center rounded-lg border transition-colors',
            isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/60',
        )}
    >
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={isSelected}
            title={locationLabel ? `${locationLabel} / ${file.title}` : file.title}
            className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left"
        >
            {IMAGE_EXT.test(file.url) ? (
                <img src={file.url} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded object-cover" />
            ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{file.title}</span>
                {locationLabel && (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <Folder className="h-3 w-3 shrink-0" />
                        <span className="truncate">{locationLabel}</span>
                    </span>
                )}
                <span className="block text-xs text-muted-foreground tabular-nums">{formatSize(file.size_bytes)}</span>
            </span>
        </button>
        <a
            href={file.url}
            download={file.original_name}
            target="_blank"
            rel="noreferrer"
            aria-label={`${file.title} — yuklab olish`}
            title="Yuklab olish"
            className="mr-1.5 shrink-0 self-end rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground mb-1.5"
        >
            <Download className="h-3.5 w-3.5" />
        </a>
        {isSelected && (
            <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
            </span>
        )}
    </div>
);
