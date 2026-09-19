import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, FileText, FolderOpen, Image as ImageIcon, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCourseFiles } from '@/hooks/useFiles';
import { resourceService } from '@/services/resourceService';
import type { CourseLibraryFile, LibraryFile } from '@/services/fileService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { FileSourceField } from '@/components/file/FileSourceField';
import { apiErrorMessage } from '@/utils/apiError';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatSize } from '@/utils/fileSize';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * Kursning umumiy kutubxonasi.
 *
 * Bu yerda kursda ishlatilayotgan barcha fayllar bir joyda: dars
 * materiallari, konspektlar va uy vazifasi ilovalari. Ilgari ularni topish
 * uchun darslarni birma-bir ochib chiqish kerak edi.
 *
 * Ro'yxat `file_usages` dan yig'iladi — yangi jadval yo'q, ya'ni darsga fayl
 * biriktirilishi bilan u shu yerda ham paydo bo'ladi va hech qachon
 * eskirmaydi. Talabalarning topshirgan ishlari ataylab kirmaydi: ular
 * shaxsiy ish, kurs materiali emas.
 *
 * Darsga bog'lanmagan kitob yoki qo'llanma kurs darajasidagi material
 * (`course_id` bilan, `lesson_id` siz) sifatida shu yerdan qo'shiladi va
 * shu yerdan olib tashlanadi. Darsga biriktirilgan fayl esa bu yerdan
 * olib tashlanmaydi: bu darsdagi materialni ko'rinmas tarzda o'chirib
 * yuborardi — uni dars sahifasida olib tashlash kerak.
 */
export const CourseFileLibrary = ({
    courseId,
    canAdd = false,
    canEdit = false,
    canRemove = false,
}: {
    courseId: number;
    canAdd?: boolean;
    canEdit?: boolean;
    canRemove?: boolean;
}) => {
    const queryClient = useQueryClient();
    const { data, isLoading, isError, refetch } = useCourseFiles(courseId);
    const [search, setSearch] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [removing, setRemoving] = useState<CourseLibraryFile | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);
    const [editing, setEditing] = useState<CourseLibraryFile | null>(null);

    const remove = async () => {
        if (!removing) return;
        setIsRemoving(true);
        try {
            // Bitta fayl kursga ikki marta kitob sifatida qo'shilgan bo'lishi mumkin.
            await Promise.all(removing.course_resource_ids.map((id) => resourceService.delete(id)));
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['files'] }),
                queryClient.invalidateQueries({ queryKey: ['resources'] }),
            ]);
            toast.success(
                removing.used_in_lessons
                    ? "Kutubxonadan olib tashlandi. Fayl darslarda ishlatilgani uchun ro'yxatda qoladi"
                    : "Kutubxonadan olib tashlandi",
            );
            setRemoving(null);
        } catch (cause) {
            toast.error(apiErrorMessage(cause, "Olib tashlashda xatolik"));
        } finally {
            setIsRemoving(false);
        }
    };

    const addButton = canAdd && (
        <Button size="sm" onClick={() => setIsAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Kitob qo'shish
        </Button>
    );
    const addModal = canAdd && (
        <AddCourseFileModal courseId={courseId} isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
    );

    const files = useMemo(() => {
        const all = data?.items ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return all;
        return all.filter(
            (f) =>
                f.title.toLowerCase().includes(q) ||
                f.original_name.toLowerCase().includes(q),
        );
    }, [data, search]);

    if (isError) {
        return <ErrorState title="Kutubxonani yuklab bo'lmadi" onRetry={() => void refetch()} />;
    }

    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
            </div>
        );
    }

    const total = data?.items.length ?? 0;

    if (total === 0) {
        return (
            <>
                <EmptyState
                    icon={<FolderOpen className="h-6 w-6" />}
                    title="Kutubxona bo'sh"
                    description={
                        canAdd
                            ? "Kursga kitob yoki qo'llanma qo'shing. Darslarga biriktirilgan materiallar ham shu yerda to'planadi."
                            : "Darslarga material yoki uy vazifasiga ilova biriktirilgach, ular shu yerda to'planadi."
                    }
                    action={addButton}
                />
                {addModal}
            </>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="search"
                        name="search"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        placeholder="Fayl nomi bo'yicha qidirish..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 pl-9 text-sm"
                    />
                </div>
                <span className="text-sm text-muted-foreground">
                    {search ? `${files.length} / ${total}` : `${total} ta fayl`}
                </span>
                {addButton && <div className="ml-auto">{addButton}</div>}
            </div>

            {files.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    Qidiruvga mos fayl topilmadi.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {files.map((file) => {
                        const isImage = IMAGE_EXT.test(file.original_name);
                        return (
                            <div
                                key={file.id}
                                className="group flex items-center gap-1 rounded-xl border border-border/60 pr-2 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                            >
                                <a
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    // Sarlavha kitob nomi bo'lishi mumkin — kengaytmasiz.
                                    download={file.original_name}
                                    className="flex min-w-0 flex-1 items-center gap-3 p-3"
                                >
                                    {isImage ? (
                                        <ImageIcon className="h-5 w-5 shrink-0 text-primary" />
                                    ) : (
                                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium group-hover:text-primary">
                                            {file.title}
                                        </span>
                                        {file.title !== file.original_name && (
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {file.original_name}
                                            </span>
                                        )}
                                        <span className="block text-xs text-muted-foreground">
                                            {formatSize(file.size_bytes)}
                                            {file.used_in_lessons && ' · darsda biriktirilgan'}
                                        </span>
                                    </span>
                                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </a>
                                {canEdit && file.course_resource_ids.length > 0 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`${file.title} — nomini tahrirlash`}
                                        title="Nomini tahrirlash"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        onClick={() => setEditing(file)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                )}
                                {canRemove && file.course_resource_ids.length > 0 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`${file.title} — kutubxonadan olib tashlash`}
                                        title="Kutubxonadan olib tashlash"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                        onClick={() => setRemoving(file)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {addModal}
            <RenameCourseFileModal file={editing} onClose={() => setEditing(null)} />
            <ConfirmDialog
                isOpen={removing !== null}
                onClose={() => setRemoving(null)}
                onConfirm={() => void remove()}
                isLoading={isRemoving}
                title="Kutubxonadan olib tashlash"
                description={
                    removing && (
                        <>
                            <b>{removing.title}</b> kurs kutubxonasidan olib tashlanadi.
                            {removing.used_in_lessons
                                ? " Fayl darslarda ham biriktirilgan — u yerda qoladi va ro'yxatda ko'rinishda davom etadi."
                                : ' Faylning o‘zi fayllar kutubxonasida saqlanib qoladi.'}
                        </>
                    )
                }
                confirmText="Olib tashlash"
            />
        </div>
    );
};

/**
 * Kitob nomini tahrirlash. Nom kurs materialida (`Resource.title`) turadi,
 * fayl yozuvida emas — shuning uchun faylning o'zi va boshqa kurslardagi
 * nomi o'zgarmaydi.
 */
function RenameCourseFileModal({ file, onClose }: { file: CourseLibraryFile | null; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [openedFor, setOpenedFor] = useState<number | null>(null);

    // Oyna boshqa kitob uchun ochilganda maydon shu kitob nomi bilan to'ladi.
    if (file && file.id !== openedFor) {
        setOpenedFor(file.id);
        setTitle(file.title);
        setError('');
    }
    if (!file && openedFor !== null) setOpenedFor(null);

    const submit = async () => {
        if (!file) return;
        const next = title.trim();
        if (!next) { setError('Nomini kiriting'); return; }
        if (next === file.title) { onClose(); return; }
        setSaving(true); setError('');
        try {
            // Bitta fayl kursga bir necha marta qo'shilgan bo'lsa, hammasi bir xil nomlanadi.
            await Promise.all(file.course_resource_ids.map((id) => resourceService.update(id, { title: next })));
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['files'] }),
                queryClient.invalidateQueries({ queryKey: ['resources'] }),
            ]);
            toast.success('Nomi yangilandi');
            onClose();
        } catch (cause) {
            setError(apiErrorMessage(cause, 'Saqlashda xatolik'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={file !== null} onClose={() => { if (!saving) onClose(); }} title="Kitob nomini tahrirlash">
            <form
                className="space-y-4"
                onSubmit={(event) => { event.preventDefault(); void submit(); }}
            >
                <div>
                    <label className="mb-1 block text-sm font-medium">Nomi</label>
                    <Input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Kitob yoki qo'llanma nomi"
                        maxLength={255}
                        autoFocus
                    />
                    {file && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">Fayl: {file.original_name}</p>
                    )}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Bekor qilish</Button>
                    <Button type="submit" disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Saqlash
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Kursga fayl qo'shish oynasi: qurilmadan yuklash yoki shaxsiy
 * kutubxonadan tanlash. Natija — kurs darajasidagi `file` materiali.
 */
function AddCourseFileModal({ courseId, isOpen, onClose }: { courseId: number; isOpen: boolean; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState('');
    const [file, setFile] = useState<File | null>(null);
    // Kutubxonadan tanlangan fayl allaqachon serverda — yuklanmaydi.
    const [libraryFile, setLibraryFile] = useState<LibraryFile | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const close = () => {
        setTitle(''); setFile(null); setLibraryFile(null); setError('');
        onClose();
    };

    const submit = async () => {
        if (!file && !libraryFile) { setError('Faylni tanlang'); return; }
        setSaving(true); setError('');
        try {
            const fileUrl = file ? (await resourceService.upload(file)).url : libraryFile!.url;
            await resourceService.create({
                course_id: courseId,
                resource_type: 'file',
                title: title.trim() || file?.name || libraryFile?.title || 'Kitob',
                file_url: fileUrl,
            });
            await queryClient.invalidateQueries({ queryKey: ['files'] });
            toast.success("Kutubxonaga qo'shildi");
            close();
        } catch (cause) {
            setError(apiErrorMessage(cause, 'Saqlashda xatolik'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={close} title="Kutubxonaga kitob qo'shish">
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-sm font-medium">Nomi</label>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Kitob yoki qo'llanma nomi" />
                </div>
                <FileSourceField
                    label="Fayl"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                    deviceHint="PDF, Word, Excel, PowerPoint, TXT yoki ZIP"
                    onFiles={(picked) => { setFile(picked[0] ?? null); setLibraryFile(null); setError(''); }}
                    onPickLibrary={() => setIsPickerOpen(true)}
                >
                    {(file || libraryFile) && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-sm">{file?.name ?? libraryFile?.title}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{file ? 'qurilmadan' : 'kutubxonadan'}</span>
                            <Button type="button" variant="ghost" size="icon" aria-label="Olib tashlash" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { setFile(null); setLibraryFile(null); }}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </FileSourceField>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={close} disabled={saving}>Bekor qilish</Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Saqlash
                    </Button>
                </div>
                <FilePickerModal
                    isOpen={isPickerOpen}
                    onClose={() => setIsPickerOpen(false)}
                    multiple={false}
                    kind="document"
                    title="Kitobni tanlash"
                    onSelect={(files) => { const picked = files[0]; if (picked) { setLibraryFile(picked); setFile(null); setError(''); } }}
                />
            </div>
        </Modal>
    );
}
