import { useMemo, useRef, useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
    FolderPlus,
    Folder,
    FolderHeart,
    Link2,
    Pencil,
    Search,
    Trash2,
    Upload,
    UploadCloud,
    Layers,
    HardDrive,
    Grid,
    List,
    ExternalLink,
    FolderInput,
    Sparkles,
    X,
    Eye,
    MoreVertical,
} from 'lucide-react';
import {
    useCreateFolder,
    useDeleteFile,
    useDeleteFolder,
    useFile,
    useFileFolders,
    useFiles,
    useRenameFolder,
    useUpdateFile,
    useUploadFile,
} from '@/hooks/useFiles';
import type { LibraryFile, LibraryFolder } from '@/services/fileService';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { getFileTypeMeta } from '@/components/file/fileIcons';
import { FileCard } from '@/components/file/FileCard';
import { MoveFileModal } from '@/components/file/MoveFileModal';
import { cn } from '@/lib/utils';
import { formatSize } from '@/utils/fileSize';

const PAGE_SIZE = 24;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

/** Ishlatilish turini oʻqiladigan soʻzga aylantiradi. */
const USAGE_LABEL: Record<string, string> = {
    resource: 'Dars materiali',
    homework: 'Uy vazifasi ilovasi',
    submission: 'Topshiriq javobi',
    question: 'Test savoli',
};

type FolderFilter = { kind: 'all' } | { kind: 'root' } | { kind: 'folder'; id: number };
type FileKindFilter = 'all' | 'document' | 'image';

export const FilesPage = () => {
    const [folderFilter, setFolderFilter] = useState<FolderFilter>({ kind: 'all' });
    const [kindFilter, setKindFilter] = useState<FileKindFilter>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [isDragging, setIsDragging] = useState(false);

    // Koʻrinish holati (kartochkalar yoki jadval)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
        const saved = localStorage.getItem('files_view_mode');
        return saved === 'list' ? 'list' : 'grid';
    });

    useEffect(() => {
        localStorage.setItem('files_view_mode', viewMode);
    }, [viewMode]);

    // Modallar holati
    const [detailId, setDetailId] = useState<number | null>(null);
    const [renamingFile, setRenamingFile] = useState<LibraryFile | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [movingFile, setMovingFile] = useState<LibraryFile | null>(null);
    const [deletingFile, setDeletingFile] = useState<LibraryFile | null>(null);

    // Papkalar modallari
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [editingFolder, setEditingFolder] = useState<LibraryFolder | null>(null);
    const [editFolderName, setEditFolderName] = useState('');
    const [deletingFolder, setDeletingFolder] = useState<LibraryFolder | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    const listParams = useMemo(
        () => ({
            page,
            size: PAGE_SIZE,
            search: search.trim() || undefined,
            kind: kindFilter === 'all' ? undefined : kindFilter,
            folder_id: folderFilter.kind === 'folder' ? folderFilter.id : undefined,
            root_only: folderFilter.kind === 'root' || undefined,
        }),
        [page, search, kindFilter, folderFilter],
    );

    const { data, isLoading, isError, refetch } = useFiles(listParams);
    const { data: folders = [] } = useFileFolders();
    const { data: detail } = useFile(detailId);

    const upload = useUploadFile();
    const update = useUpdateFile();
    const remove = useDeleteFile();
    const createFolder = useCreateFolder();
    const renameFolder = useRenameFolder();
    const deleteFolder = useDeleteFolder();

    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    // Hozirgi tanlangan papka
    const activeFolder = useMemo(() => {
        if (folderFilter.kind === 'folder') {
            return folders.find((f) => f.id === folderFilter.id) ?? null;
        }
        return null;
    }, [folderFilter, folders]);

    // ─── Drag & Drop yuklash ──────────────────────────────────────────

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            setIsDragging(false);
            dragCounter.current = 0;
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUpload(e.dataTransfer.files);
        }
    };

    // ─── Amallar ──────────────────────────────────────────────────────

    const handleUpload = async (files: FileList | null) => {
        if (!files?.length) return;
        const folderId = folderFilter.kind === 'folder' ? folderFilter.id : undefined;

        let uploaded = 0;
        let reused = 0;
        for (const file of Array.from(files)) {
            try {
                // Dublikatni server aytadi: roʻyxat uzunligiga qarab taxmin
                // qilib boʻlmaydi — u filtrlangan, sahifalangan va bu sikl
                // ichida yangilanmaydi (React Query keshi keyingi render'da
                // almashadi, ishlab turgan closure esa eski qiymatni koʻradi).
                const result = await upload.mutateAsync({ file, folderId });
                if (result.deduplicated) reused += 1;
                uploaded += 1;
            } catch (error) {
                const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                toast.error(typeof detail === 'string' ? detail : `${file.name}: yuklab boʻlmadi`);
            }
        }

        if (uploaded) {
            // Endi aniq son maʼlum, shuning uchun "baʼzilari" degan mavhum
            // ibora oʻrniga nechtasi ekani aytiladi.
            toast.success(
                reused === 0
                    ? `${uploaded} ta fayl muvaffaqiyatli yuklandi`
                    : reused === uploaded
                        ? `${uploaded} ta fayl kutubxonada allaqachon bor edi`
                        : `${uploaded} ta fayl qabul qilindi (${reused} tasi kutubxonada bor edi)`,
            );
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRenameFile = async () => {
        if (!renamingFile || !renameValue.trim()) return;
        try {
            await update.mutateAsync({ id: renamingFile.id, data: { title: renameValue.trim() } });
            toast.success('Fayl nomi oʻzgartirildi');
            setRenamingFile(null);
        } catch {
            toast.error('Nomini oʻzgartirib boʻlmadi');
        }
    };

    const handleMoveFile = async (fileId: number, targetFolderId: number | null) => {
        try {
            await update.mutateAsync({
                id: fileId,
                data: targetFolderId === null ? { move_to_root: true } : { folder_id: targetFolderId },
            });
            toast.success('Fayl koʻchirildi');
            setMovingFile(null);
        } catch {
            toast.error('Faylni koʻchirib boʻlmadi');
        }
    };

    const handleDeleteFile = async () => {
        if (!deletingFile) return;
        try {
            await remove.mutateAsync(deletingFile.id);
            toast.success('Fayl oʻchirildi');
            setDeletingFile(null);
        } catch (error) {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Faylni oʻchirib boʻlmadi');
            setDeletingFile(null);
        }
    };

    const handleCreateFolder = async () => {
        if (!folderName.trim()) return;
        try {
            await createFolder.mutateAsync({ name: folderName.trim() });
            toast.success('Papka yaratildi');
            setFolderName('');
            setIsFolderModalOpen(false);
        } catch {
            toast.error('Papka yaratilmadi');
        }
    };

    const handleRenameFolder = async () => {
        if (!editingFolder || !editFolderName.trim()) return;
        try {
            await renameFolder.mutateAsync({ id: editingFolder.id, name: editFolderName.trim() });
            toast.success('Papka nomi yangilandi');
            setEditingFolder(null);
        } catch {
            toast.error('Papka nomini oʻzgartirib boʻlmadi');
        }
    };

    const handleDeleteFolderConfirm = async () => {
        if (!deletingFolder) return;
        try {
            await deleteFolder.mutateAsync(deletingFolder.id);
            toast.success(`«${deletingFolder.name}» papkasi oʻchirildi, fayllar saqlanib qoldi`);
            if (folderFilter.kind === 'folder' && folderFilter.id === deletingFolder.id) {
                setFolderFilter({ kind: 'all' });
            }
            setDeletingFolder(null);
        } catch {
            toast.error('Papkani oʻchirib boʻlmadi');
            setDeletingFolder(null);
        }
    };

    // ─── Jadval ustunlari (List View) ──────────────────────────────────

    const columns: DataTableColumn<LibraryFile>[] = [
        {
            key: 'title',
            header: 'Fayl nomi',
            cell: (row) => {
                const meta = getFileTypeMeta(row.original_name || row.url || row.title);
                const isImage = meta.category === 'image';
                const { Icon } = meta;

                return (
                    <div className="flex items-center gap-3 min-w-0 py-1">
                        {isImage ? (
                            <img
                                src={row.url}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 rounded-xl object-cover border border-border shrink-0"
                            />
                        ) : (
                            <span
                                className={cn(
                                    'flex h-10 w-10 items-center justify-center rounded-xl shrink-0',
                                    meta.iconBg,
                                    meta.iconText
                                )}
                            >
                                <Icon className="h-5 w-5" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <span className="block truncate font-medium text-foreground hover:text-primary transition-colors">
                                {row.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                                {row.original_name}
                            </span>
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'folder',
            header: 'Papka',
            hideBelow: 'sm',
            cell: (row) => {
                const f = folders.find((item) => item.id === row.folder_id);
                if (!f) {
                    return (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            <HardDrive className="h-3 w-3" /> Papkasiz
                        </span>
                    );
                }
                return (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                        <Folder className="h-3 w-3" /> {f.name}
                    </span>
                );
            },
        },
        {
            key: 'size',
            header: 'Hajmi',
            hideBelow: 'md',
            className: 'tabular-nums text-muted-foreground text-sm',
            cell: (row) => formatSize(row.size_bytes),
        },
        {
            key: 'usage',
            header: 'Ishlatilishi',
            hideBelow: 'md',
            cell: (row) =>
                row.usage_count > 0 ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setDetailId(row.id);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline bg-primary/10 px-2.5 py-1 rounded-full"
                    >
                        <Link2 className="h-3.5 w-3.5" />
                        {row.usage_count} ta joyda
                    </button>
                ) : (
                    <span className="text-xs text-muted-foreground">ishlatilmagan</span>
                ),
        },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-16',
            cell: (row) => (
                <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Amallar">
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                                onClick={() => window.open(row.url, '_blank', 'noopener,noreferrer')}
                            >
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                <span>Faylni ochish</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDetailId(row.id)}>
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                <span>Tafsilotlar</span>
                            </DropdownMenuItem>
                            <PermissionGate permission="update:file">
                                <DropdownMenuItem
                                    onClick={() => {
                                        setRenamingFile(row);
                                        setRenameValue(row.title);
                                    }}
                                >
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                    <span>Nomini oʻzgartirish</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMovingFile(row)}>
                                    <FolderInput className="h-4 w-4 text-muted-foreground" />
                                    <span>Papkaga koʻchirish</span>
                                </DropdownMenuItem>
                            </PermissionGate>
                            <PermissionGate permission="delete:file">
                                <DropdownMenuSeparator />
                                <DropdownMenuItem destructive onClick={() => setDeletingFile(row)}>
                                    <Trash2 className="h-4 w-4" />
                                    <span>Oʻchirish</span>
                                </DropdownMenuItem>
                            </PermissionGate>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fayl kutubxonasi"
                description="Bir marta yuklangan faylni qayta yuklamasdan boshqa kurs, dars va topshiriqlarga biriktirish mumkin"
            />

            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => handleUpload(event.target.files)}
            />

            {/* Asosiy 2 ustunli tuzilma */}
            <div className="grid gap-6 lg:grid-cols-[260px_1fr] items-start">
                {/* ─── Chap Panel: Katalog & Papkalar ───────────────────────────── */}
                <aside className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
                    {/* Asosiy navigatsiya */}
                    <div className="space-y-1">
                        <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Asosiy boʻlimlar
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setFolderFilter({ kind: 'all' });
                                setPage(1);
                            }}
                            className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-150',
                                folderFilter.kind === 'all'
                                    ? 'bg-primary/10 text-primary font-semibold shadow-xs'
                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                            )}
                        >
                            <Layers className="h-4 w-4 shrink-0 text-primary" />
                            <span className="flex-1 truncate">Barcha fayllar</span>
                            {data && folderFilter.kind === 'all' && (
                                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary font-bold">
                                    {data.total}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setFolderFilter({ kind: 'root' });
                                setPage(1);
                            }}
                            className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-150',
                                folderFilter.kind === 'root'
                                    ? 'bg-primary/10 text-primary font-semibold shadow-xs'
                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                            )}
                        >
                            <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate">Papkasiz fayllar</span>
                            {data && folderFilter.kind === 'root' && (
                                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary font-bold">
                                    {data.total}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="h-px bg-border/60" />

                    {/* Papkalar boʻlimi */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Papkalar ({folders.length})
                            </span>
                            <PermissionGate permission="create:file">
                                <button
                                    type="button"
                                    onClick={() => setIsFolderModalOpen(true)}
                                    title="Yangi papka ochish"
                                    className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                                >
                                    <FolderPlus className="h-3.5 w-3.5" />
                                    <span>Yangi</span>
                                </button>
                            </PermissionGate>
                        </div>

                        {folders.length === 0 ? (
                            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                                Hozircha papkalar mavjud emas.
                            </p>
                        ) : (
                            <div className="max-h-[380px] space-y-1 overflow-y-auto custom-scrollbar pr-0.5">
                                {folders.map((folder) => {
                                    const isSelected =
                                        folderFilter.kind === 'folder' && folderFilter.id === folder.id;

                                    return (
                                        <div
                                            key={folder.id}
                                            className={cn(
                                                'group flex items-center gap-1 rounded-xl transition-all duration-150',
                                                isSelected
                                                    ? 'bg-primary/10 text-primary font-semibold shadow-xs'
                                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFolderFilter({ kind: 'folder', id: folder.id });
                                                    setPage(1);
                                                }}
                                                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left text-sm"
                                            >
                                                {folder.is_personal ? (
                                                    <FolderHeart className="h-4 w-4 shrink-0 text-primary" />
                                                ) : (
                                                    <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                                                )}
                                                <span className="truncate" title={folder.name}>
                                                    {folder.name}
                                                </span>
                                                <span className="ml-auto rounded-md bg-muted px-1.5 py-0.2 text-[11px] font-medium text-muted-foreground tabular-nums">
                                                    {folder.file_count}
                                                </span>
                                            </button>

                                            {/* Papka amallari menyusi */}
                                            <div
                                                className="pr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            type="button"
                                                            aria-label="Papka amallari"
                                                            className="p-1 rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                                        >
                                                            <MoreVertical className="h-3.5 w-3.5" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
                                                        <PermissionGate permission="update:file">
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setEditingFolder(folder);
                                                                    setEditFolderName(folder.name);
                                                                }}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                                                <span>Tahrirlash</span>
                                                            </DropdownMenuItem>
                                                        </PermissionGate>
                                                        <PermissionGate permission="delete:file">
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                destructive
                                                                onClick={() => setDeletingFolder(folder)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                <span>Oʻchirish</span>
                                                            </DropdownMenuItem>
                                                        </PermissionGate>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-border/60" />

                    {/* Foydali maslahat kartochkasi */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Qayta ishlatish</span>
                        </div>
                        Faylni bir marta yuklab, uni turli kurs, dars yoki testlarga qayta yuklamasdan biriktirishingiz mumkin.
                    </div>
                </aside>

                {/* ─── Oʻng Panel: Fayllar Koʻrinishi ─────────────────────────────── */}
                <div
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="relative flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs min-w-0"
                >
                    {/* Drag & Drop faol qatlam */}
                    {isDragging && (
                        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-xs p-6 text-center animate-in fade-in-50 duration-200">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                                <UploadCloud className="h-8 w-8 animate-bounce" />
                            </div>
                            <p className="text-base font-bold text-foreground">
                                Fayllarni shu yerga tashlang
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {activeFolder
                                    ? `Ular «${activeFolder.name}» papkasiga yuklanadi`
                                    : 'Ular toʻgʻridan-toʻgʻri kutubxonaga yuklanadi'}
                            </p>
                        </div>
                    )}

                    {/* Kontekst sarlavhasi (Joylashuv va statistika) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                {activeFolder ? (
                                    activeFolder.is_personal ? (
                                        <FolderHeart className="h-5 w-5" />
                                    ) : (
                                        <Folder className="h-5 w-5" />
                                    )
                                ) : folderFilter.kind === 'root' ? (
                                    <HardDrive className="h-5 w-5" />
                                ) : (
                                    <Layers className="h-5 w-5" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-base sm:text-lg font-bold text-foreground">
                                    {activeFolder
                                        ? activeFolder.name
                                        : folderFilter.kind === 'root'
                                          ? 'Papkasiz fayllar'
                                          : 'Barcha fayllar'}
                                </h2>
                                <p className="text-xs text-muted-foreground">
                                    {data ? `${data.total} ta fayl mavjud` : 'Yuklanmoqda...'}
                                </p>
                            </div>
                        </div>

                        {/* Tezkor yuklash tugmasi */}
                        <PermissionGate permission="create:file">
                            <Button
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                isLoading={upload.isPending}
                                className="gap-2 shrink-0"
                            >
                                <Upload className="h-3.5 w-3.5" />
                                <span>
                                    {activeFolder ? 'Ushbu papkaga yuklash' : 'Fayl yuklash'}
                                </span>
                            </Button>
                        </PermissionGate>
                    </div>

                    {/* Asboblar paneli: Qidiruv, Filtrlar va Koʻrinish almashtirgich */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                            {/* Qidiruv maydoni */}
                            <div className="relative min-w-[200px] flex-1 max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(event) => {
                                        setSearch(event.target.value);
                                        setPage(1);
                                    }}
                                    placeholder="Nomi boʻyicha qidirish..."
                                    className="h-9 pl-9 pr-8 text-sm"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearch('');
                                            setPage(1);
                                        }}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Fayl turi boʻyicha filtr */}
                            <div className="flex items-center rounded-lg border border-border/80 p-0.5 bg-muted/30">
                                {(
                                    [
                                        { key: 'all', label: 'Barchasi' },
                                        { key: 'document', label: 'Hujjatlar' },
                                        { key: 'image', label: 'Rasmlar' },
                                    ] as const
                                ).map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => {
                                            setKindFilter(item.key);
                                            setPage(1);
                                        }}
                                        className={cn(
                                            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                            kindFilter === item.key
                                                ? 'bg-card text-foreground font-semibold shadow-xs'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Koʻrinish almashtirgich (Grid / List) */}
                        <div className="flex items-center justify-end">
                            <div className="flex items-center rounded-lg border border-border/80 p-0.5 bg-muted/30">
                                <button
                                    type="button"
                                    aria-label="Kartochkalar koʻrinishi"
                                    onClick={() => setViewMode('grid')}
                                    className={cn(
                                        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                                        viewMode === 'grid'
                                            ? 'bg-card text-primary shadow-xs'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                    title="Kartochkalar (Grid)"
                                >
                                    <Grid className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Jadval koʻrinishi"
                                    onClick={() => setViewMode('list')}
                                    className={cn(
                                        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                                        viewMode === 'list'
                                            ? 'bg-card text-primary shadow-xs'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                    title="Jadval (List)"
                                >
                                    <List className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ─── Kontent qismi ────────────────────────────────────────── */}

                    {/* Boʻsh holat (Empty State) */}
                    {data && data.items.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 py-16 px-4 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-xs">
                                {search ? (
                                    <Search className="h-8 w-8 text-muted-foreground" />
                                ) : (
                                    <UploadCloud className="h-8 w-8" />
                                )}
                            </div>

                            <h3 className="text-base sm:text-lg font-bold text-foreground">
                                {search
                                    ? 'Qidiruv boʻyicha fayl topilmadi'
                                    : activeFolder
                                      ? `«${activeFolder.name}» papkasi hozircha boʻsh`
                                      : 'Kutubxona hozircha boʻsh'}
                            </h3>

                            <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-muted-foreground">
                                {search
                                    ? `«${search}» boʻyicha hech qanday natija yoʻq. Boshqa soʻz bilan qidirib koʻring.`
                                    : 'Dars konspektlari, taqdimotlar, vazifa materiallari yoki rasmlarni yuklang.'}
                            </p>

                            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                                {search ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setSearch('');
                                            setPage(1);
                                        }}
                                    >
                                        Qidiruvni tozalash
                                    </Button>
                                ) : (
                                    <PermissionGate permission="create:file">
                                        <Button
                                            onClick={() => fileInputRef.current?.click()}
                                            isLoading={upload.isPending}
                                            className="gap-2 shadow-xs"
                                        >
                                            <Upload className="h-4 w-4" />
                                            <span>Fayl yuklash</span>
                                        </Button>
                                    </PermissionGate>
                                )}
                            </div>

                            {!search && (
                                <p className="mt-3 text-[11px] text-muted-foreground/70">
                                    yoki fayllarni toʻgʻridan-toʻgʻri shu oynaga sudrab tashlang
                                </p>
                            )}
                        </div>
                    ) : viewMode === 'grid' ? (
                        /* Kartochkalar koʻrinishi (Grid View) */
                        <div className="space-y-4">
                            {isLoading ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {Array.from({ length: 8 }).map((_, index) => (
                                        <div
                                            key={index}
                                            className="flex flex-col rounded-2xl border border-border/60 p-3 space-y-3"
                                        >
                                            <div className="h-32 w-full rounded-xl bg-muted animate-pulse" />
                                            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                                            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {data?.items.map((file) => (
                                        <FileCard
                                            key={file.id}
                                            file={file}
                                            onViewDetail={() => setDetailId(file.id)}
                                            onRename={() => {
                                                setRenamingFile(file);
                                                setRenameValue(file.title);
                                            }}
                                            onMove={() => setMovingFile(file)}
                                            onDelete={() => setDeletingFile(file)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Jadval koʻrinishi (List View) */
                        <div className="space-y-4">
                            <DataTable
                                columns={columns}
                                data={data?.items}
                                rowKey={(row) => row.id}
                                isLoading={isLoading}
                                isError={isError}
                                onRetry={refetch}
                                onRowClick={(row) => setDetailId(row.id)}
                            />
                        </div>
                    )}

                    {/* Sahifalash (Pagination) */}
                    {totalPages > 1 && (
                        <div className="pt-2 border-t border-border/50">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                                isLoading={isLoading}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Modallar ───────────────────────────────────────────────────── */}

            {/* Fayl tafsilotlari (Qayerda ishlatilyapti) */}
            <Modal
                isOpen={detailId !== null}
                onClose={() => setDetailId(null)}
                title={detail?.title ?? 'Fayl maʼlumotlari'}
                className="max-w-md"
            >
                {detail && (
                    <div className="space-y-4">
                        {IMAGE_EXT.test(detail.url) ? (
                            <div className="overflow-hidden rounded-xl border border-border/80 bg-muted">
                                <img
                                    src={detail.url}
                                    alt=""
                                    className="max-h-56 w-full object-contain"
                                />
                            </div>
                        ) : null}

                        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs">
                            <div>
                                <dt className="text-muted-foreground">Hajmi</dt>
                                <dd className="font-semibold text-foreground mt-0.5 tabular-nums">
                                    {formatSize(detail.size_bytes)}
                                </dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-muted-foreground">Asl nomi</dt>
                                <dd className="truncate font-semibold text-foreground mt-0.5" title={detail.original_name}>
                                    {detail.original_name}
                                </dd>
                            </div>
                        </dl>

                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Biriktirilgan joylar ({detail.usages.length})
                            </p>
                            {detail.usages.length === 0 ? (
                                <p className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground text-center">
                                    Bu fayl hali hech qayerga biriktirilmagan. Uni bemalol oʻchirishingiz mumkin.
                                </p>
                            ) : (
                                <ul className="max-h-48 space-y-1.5 overflow-y-auto custom-scrollbar text-xs">
                                    {detail.usages.map((usage) => (
                                        <li
                                            key={`${usage.entity_type}-${usage.entity_id}`}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-2"
                                        >
                                            <span className="font-semibold text-primary">
                                                {USAGE_LABEL[usage.entity_type] ?? usage.entity_type}
                                            </span>
                                            <span className="truncate text-foreground max-w-[200px]" title={usage.label ?? ''}>
                                                {usage.label ?? `#${usage.entity_id}`}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <a
                                href={detail.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Faylni brauzerda ochish</span>
                            </a>
                            <Button size="sm" variant="outline" onClick={() => setDetailId(null)}>
                                Yopish
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Fayl nomini oʻzgartirish */}
            <Modal
                isOpen={renamingFile !== null}
                onClose={() => setRenamingFile(null)}
                title="Fayl nomini oʻzgartirish"
                className="max-w-sm"
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">Yangi nom</label>
                        <Input
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && handleRenameFile()}
                            autoFocus
                            className="mt-1"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                        <Button variant="outline" size="sm" onClick={() => setRenamingFile(null)}>
                            Bekor qilish
                        </Button>
                        <Button size="sm" onClick={handleRenameFile} isLoading={update.isPending}>
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Faylni koʻchirish modali */}
            <MoveFileModal
                isOpen={movingFile !== null}
                onClose={() => setMovingFile(null)}
                file={movingFile}
                folders={folders}
                onMove={handleMoveFile}
                isPending={update.isPending}
            />

            {/* Yangi papka yaratish */}
            <Modal
                isOpen={isFolderModalOpen}
                onClose={() => setIsFolderModalOpen(false)}
                title="Yangi papka ochish"
                className="max-w-sm"
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">Papka nomi</label>
                        <Input
                            value={folderName}
                            onChange={(event) => setFolderName(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && handleCreateFolder()}
                            placeholder="Masalan: Maʼruza materiallari"
                            autoFocus
                            className="mt-1"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                        <Button variant="outline" size="sm" onClick={() => setIsFolderModalOpen(false)}>
                            Bekor qilish
                        </Button>
                        <Button size="sm" onClick={handleCreateFolder} isLoading={createFolder.isPending}>
                            Yaratish
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Papka nomini tahrirlash */}
            <Modal
                isOpen={editingFolder !== null}
                onClose={() => setEditingFolder(null)}
                title="Papka nomini oʻzgartirish"
                className="max-w-sm"
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">Papka nomi</label>
                        <Input
                            value={editFolderName}
                            onChange={(event) => setEditFolderName(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && handleRenameFolder()}
                            autoFocus
                            className="mt-1"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                        <Button variant="outline" size="sm" onClick={() => setEditingFolder(null)}>
                            Bekor qilish
                        </Button>
                        <Button size="sm" onClick={handleRenameFolder} isLoading={renameFolder.isPending}>
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Faylni oʻchirishni tasdiqlash */}
            <ConfirmDialog
                isOpen={deletingFile !== null}
                onClose={() => setDeletingFile(null)}
                onConfirm={handleDeleteFile}
                title="Faylni oʻchirish"
                description={
                    <>
                        «{deletingFile?.title}» fayli kutubxonadan butunlay olib tashlanadi.
                        {deletingFile && deletingFile.usage_count > 0 && (
                            <span className="mt-2 block font-medium text-destructive">
                                Diqqat: Bu fayl {deletingFile.usage_count} ta joyda ishlatilmoqda. Avval oʻsha joylardan ajratilishi lozim!
                            </span>
                        )}
                    </>
                }
                confirmText="Oʻchirish"
                variant="danger"
                isLoading={remove.isPending}
            />

            {/* Papkani oʻchirishni tasdiqlash */}
            <ConfirmDialog
                isOpen={deletingFolder !== null}
                onClose={() => setDeletingFolder(null)}
                onConfirm={handleDeleteFolderConfirm}
                title="Papkani oʻchirish"
                description={
                    <>
                        «{deletingFolder?.name}» papkasi oʻchiriladi.
                        <span className="mt-1 block text-muted-foreground">
                            Xavotir olmang, papka ichidagi fayllar oʻchmaydi — ular avtomatik ravishda «Papkasiz fayllar» boʻlimiga oʻtadi.
                        </span>
                    </>
                }
                confirmText="Papkani oʻchirish"
                variant="danger"
                isLoading={deleteFolder.isPending}
            />
        </div>
    );
};

export default FilesPage;
