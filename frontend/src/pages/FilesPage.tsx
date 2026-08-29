import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    FileText,
    FolderPlus,
    Folder,
    Image as ImageIcon,
    Link2,
    Pencil,
    Search,
    Trash2,
    Upload,
} from 'lucide-react';
import {
    useCreateFolder,
    useDeleteFile,
    useDeleteFolder,
    useFile,
    useFileFolders,
    useFiles,
    useUpdateFile,
    useUploadFile,
} from '@/hooks/useFiles';
import type { LibraryFile } from '@/services/fileService';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Ishlatilish turini oʻqiladigan soʻzga aylantiradi. */
const USAGE_LABEL: Record<string, string> = {
    resource: 'Material',
    homework: 'Vazifa',
    submission: 'Javob',
    question: 'Savol',
};

type FolderFilter = { kind: 'all' } | { kind: 'root' } | { kind: 'folder'; id: number };

export const FilesPage = () => {
    const [folderFilter, setFolderFilter] = useState<FolderFilter>({ kind: 'all' });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const [detailId, setDetailId] = useState<number | null>(null);
    const [renaming, setRenaming] = useState<LibraryFile | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [deleting, setDeleting] = useState<LibraryFile | null>(null);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [folderName, setFolderName] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const listParams = useMemo(
        () => ({
            page,
            size: PAGE_SIZE,
            search: search.trim() || undefined,
            folder_id: folderFilter.kind === 'folder' ? folderFilter.id : undefined,
            root_only: folderFilter.kind === 'root' || undefined,
        }),
        [page, search, folderFilter],
    );

    const { data, isLoading, isError, refetch } = useFiles(listParams);
    const { data: folders } = useFileFolders();
    const { data: detail } = useFile(detailId);

    const upload = useUploadFile();
    const update = useUpdateFile();
    const remove = useDeleteFile();
    const createFolder = useCreateFolder();
    const deleteFolder = useDeleteFolder();

    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    // ─── Amallar ──────────────────────────────────────────────────────

    const handleUpload = async (files: FileList | null) => {
        if (!files?.length) return;
        const folderId = folderFilter.kind === 'folder' ? folderFilter.id : undefined;

        let uploaded = 0;
        let reused = 0;
        for (const file of Array.from(files)) {
            try {
                const before = data?.total ?? 0;
                const result = await upload.mutateAsync({ file, folderId });
                // Server ayni baytlarni topsa mavjud yozuvni qaytaradi —
                // foydalanuvchi buni bilishi kerak, aks holda "yuklanmadi"
                // deb oʻylaydi.
                if (result.usage_count > 0 || before === data?.total) reused += 1;
                uploaded += 1;
            } catch (error) {
                const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                toast.error(typeof detail === 'string' ? detail : `${file.name}: yuklab boʻlmadi`);
            }
        }

        if (uploaded) {
            toast.success(
                reused
                    ? `${uploaded} ta fayl qabul qilindi (ulardan baʼzilari kutubxonada bor edi)`
                    : `${uploaded} ta fayl yuklandi`,
            );
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRename = async () => {
        if (!renaming || !renameValue.trim()) return;
        try {
            await update.mutateAsync({ id: renaming.id, data: { title: renameValue.trim() } });
            toast.success('Nomi oʻzgartirildi');
            setRenaming(null);
        } catch {
            toast.error('Nomini oʻzgartirib boʻlmadi');
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        try {
            await remove.mutateAsync(deleting.id);
            toast.success('Fayl oʻchirildi');
            setDeleting(null);
        } catch (error) {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            // 409 — fayl ishlatilyapti. Server qayerdaligini aytadi, shuni
            // koʻrsatamiz: "oʻchirib boʻlmadi" deyish foydasiz.
            toast.error(typeof detail === 'string' ? detail : 'Faylni oʻchirib boʻlmadi');
            setDeleting(null);
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

    const handleDeleteFolder = async (id: number, name: string) => {
        try {
            await deleteFolder.mutateAsync(id);
            toast.success(`«${name}» papkasi oʻchirildi, fayllar saqlanib qoldi`);
            if (folderFilter.kind === 'folder' && folderFilter.id === id) {
                setFolderFilter({ kind: 'all' });
            }
        } catch {
            toast.error('Papkani oʻchirib boʻlmadi');
        }
    };

    // ─── Jadval ───────────────────────────────────────────────────────

    const columns: DataTableColumn<LibraryFile>[] = [
        {
            key: 'title',
            header: 'Nomi',
            cell: (row) => (
                <div className="flex items-center gap-3 min-w-0">
                    {IMAGE_EXT.test(row.url) ? (
                        <img
                            src={row.url}
                            alt=""
                            loading="lazy"
                            className="h-9 w-9 rounded object-cover border border-border shrink-0"
                        />
                    ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded bg-muted shrink-0">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </span>
                    )}
                    <span className="truncate font-medium">{row.title}</span>
                </div>
            ),
        },
        {
            key: 'size',
            header: 'Hajmi',
            hideBelow: 'sm',
            className: 'tabular-nums text-muted-foreground',
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
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                        <Link2 className="h-3.5 w-3.5" />
                        {row.usage_count} ta joyda
                    </button>
                ) : (
                    <span className="text-sm text-muted-foreground">ishlatilmayapti</span>
                ),
        },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-24',
            cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                    <PermissionGate permission="update:file">
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Nomini oʻzgartirish"
                            onClick={(event) => {
                                event.stopPropagation();
                                setRenaming(row);
                                setRenameValue(row.title);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:file">
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Oʻchirish"
                            onClick={(event) => {
                                event.stopPropagation();
                                setDeleting(row);
                            }}
                        >
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </PermissionGate>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fayl kutubxonasi"
                description="Bir marta yuklangan faylni qayta yuklamasdan boshqa kurs va darslarga qoʻshish mumkin"
                actions={
                    <div className="flex flex-wrap gap-2">
                        <PermissionGate permission="create:file">
                            <Button variant="outline" onClick={() => setIsFolderModalOpen(true)}>
                                <FolderPlus className="h-4 w-4" />
                                Papka
                            </Button>
                            <Button onClick={() => fileInputRef.current?.click()} isLoading={upload.isPending}>
                                <Upload className="h-4 w-4" />
                                Fayl yuklash
                            </Button>
                        </PermissionGate>
                    </div>
                }
            />

            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => handleUpload(event.target.files)}
            />

            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                {/* Papkalar */}
                <aside className="space-y-1">
                    {(
                        [
                            { key: 'all', label: 'Barcha fayllar', filter: { kind: 'all' } as FolderFilter },
                            { key: 'root', label: 'Papkasizlar', filter: { kind: 'root' } as FolderFilter },
                        ]
                    ).map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                                setFolderFilter(item.filter);
                                setPage(1);
                            }}
                            className={cn(
                                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                folderFilter.kind === item.key
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:bg-muted',
                            )}
                        >
                            {item.label}
                        </button>
                    ))}

                    {folders?.length ? <div className="h-px bg-border my-2" /> : null}

                    {folders?.map((folder) => (
                        <div key={folder.id} className="group flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setFolderFilter({ kind: 'folder', id: folder.id });
                                    setPage(1);
                                }}
                                className={cn(
                                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                                    folderFilter.kind === 'folder' && folderFilter.id === folder.id
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:bg-muted',
                                )}
                            >
                                <Folder className="h-4 w-4 shrink-0" />
                                <span className="truncate">{folder.name}</span>
                                <span className="ml-auto text-xs tabular-nums opacity-70">
                                    {folder.file_count}
                                </span>
                            </button>
                            <PermissionGate permission="delete:file">
                                <button
                                    type="button"
                                    aria-label={`«${folder.name}» papkasini oʻchirish`}
                                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded hover:bg-muted"
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                            </PermissionGate>
                        </div>
                    ))}
                </aside>

                {/* Fayllar */}
                <div className="space-y-4 min-w-0">
                    <div className="relative max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Nomi boʻyicha qidirish"
                            className="pl-9"
                        />
                    </div>

                    <DataTable
                        columns={columns}
                        data={data?.items}
                        rowKey={(row) => row.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={refetch}
                        onRowClick={(row) => setDetailId(row.id)}
                        emptyIcon={<ImageIcon className="h-8 w-8" />}
                        emptyTitle={search ? 'Hech narsa topilmadi' : 'Kutubxona hozircha boʻsh'}
                        emptyDescription={
                            search
                                ? 'Boshqa soʻz bilan qidirib koʻring'
                                : 'Yuklangan fayllar shu yerda toʻplanadi va boshqa kurslarga qoʻshish uchun tayyor turadi'
                        }
                    />

                    {totalPages > 1 && (
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={setPage}
                            isLoading={isLoading}
                        />
                    )}
                </div>
            </div>

            {/* Tafsilot */}
            <Modal
                isOpen={detailId !== null}
                onClose={() => setDetailId(null)}
                title={detail?.title ?? 'Fayl'}
            >
                {detail && (
                    <div className="space-y-4">
                        {IMAGE_EXT.test(detail.url) && (
                            <img
                                src={detail.url}
                                alt=""
                                className="max-h-64 w-full rounded-md border border-border object-contain bg-muted"
                            />
                        )}

                        <dl className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <dt className="text-muted-foreground">Hajmi</dt>
                                <dd className="tabular-nums">{formatSize(detail.size_bytes)}</dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-muted-foreground">Asl nomi</dt>
                                <dd className="truncate">{detail.original_name}</dd>
                            </div>
                        </dl>

                        <div>
                            <p className="mb-2 text-sm font-medium">
                                Qayerda ishlatilyapti
                                <span className="ml-1.5 text-muted-foreground">({detail.usages.length})</span>
                            </p>
                            {detail.usages.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Hech qayerda. Bunday faylni oʻchirish mumkin.
                                </p>
                            ) : (
                                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                                    {detail.usages.map((usage) => (
                                        <li
                                            key={`${usage.entity_type}-${usage.entity_id}`}
                                            className="flex items-center gap-2 rounded bg-muted/50 px-3 py-1.5"
                                        >
                                            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                                {USAGE_LABEL[usage.entity_type] ?? usage.entity_type}
                                            </span>
                                            <span className="truncate">
                                                {usage.label ?? `#${usage.entity_id}`}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <a
                            href={detail.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-sm text-primary hover:underline"
                        >
                            Faylni ochish
                        </a>
                    </div>
                )}
            </Modal>

            {/* Nomini oʻzgartirish */}
            <Modal isOpen={renaming !== null} onClose={() => setRenaming(null)} title="Nomini oʻzgartirish">
                <div className="space-y-4">
                    <Input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleRename()}
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRenaming(null)}>
                            Bekor qilish
                        </Button>
                        <Button onClick={handleRename} isLoading={update.isPending}>
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Papka yaratish */}
            <Modal
                isOpen={isFolderModalOpen}
                onClose={() => setIsFolderModalOpen(false)}
                title="Yangi papka"
            >
                <div className="space-y-4">
                    <Input
                        value={folderName}
                        onChange={(event) => setFolderName(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleCreateFolder()}
                        placeholder="Masalan: Maʼruzalar"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsFolderModalOpen(false)}>
                            Bekor qilish
                        </Button>
                        <Button onClick={handleCreateFolder} isLoading={createFolder.isPending}>
                            Yaratish
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Faylni oʻchirish"
                description={
                    <>
                        «{deleting?.title}» kutubxonadan olib tashlanadi.
                        {deleting && deleting.usage_count > 0 && (
                            <span className="mt-2 block text-destructive">
                                Bu fayl {deleting.usage_count} ta joyda ishlatilyapti — avval oʻsha
                                joylardan olib tashlash kerak.
                            </span>
                        )}
                    </>
                }
                confirmText="Oʻchirish"
                variant="danger"
                isLoading={remove.isPending}
            />
        </div>
    );
};

export default FilesPage;
