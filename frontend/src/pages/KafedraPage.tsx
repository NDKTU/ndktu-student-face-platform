import { toast } from 'sonner';
import { useEffect, useState, useMemo } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { type Kafedra } from '@/services/kafedraService';

import { Button } from '@/components/ui/Button';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { useKafedras, useDeleteKafedra, useFaculties } from '@/hooks/useReferenceData';
import { Combobox } from '@/components/ui/Combobox';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { tileFor, initialsOf } from '@/lib/avatarTiles';
import { KafedraModal } from '@/components/kafedra/KafedraModal';



const KafedraPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedKafedra, setSelectedKafedra] = useState<Kafedra | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [kafedraToDelete, setKafedraToDelete] = useState<Kafedra | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedFacultyFilter, setSelectedFacultyFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const facultyIdParam = selectedFacultyFilter === 'all' ? undefined : Number(selectedFacultyFilter);
    const { data: kafedrasData, isLoading: isKafedrasLoading, isError: isKafedrasError, refetch } = useKafedras(currentPage, pageSize, debouncedSearch, facultyIdParam);
    const { data: facultiesData } = useFaculties();
    const deleteKafedraMutation = useDeleteKafedra();

    const kafedras = kafedrasData?.kafedras || [];
    const totalPages = kafedrasData ? Math.ceil(kafedrasData.total / pageSize) : 1;
    const faculties = facultiesData?.faculties || [];

    const facultyOptions = useMemo(() => {
        const options = faculties.map(f => ({
            value: f.id.toString(),
            label: f.name
        }));
        return [{ value: 'all', label: 'Barcha fakultetlar' }, ...options];
    }, [faculties]);

    const handleDeleteClick = (kafedra: Kafedra) => {
        setKafedraToDelete(kafedra);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!kafedraToDelete) return;

        deleteKafedraMutation.mutate({ id: kafedraToDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                toast.success("Kafedra o'chirildi");
                setIsDeleteModalOpen(false);
                setKafedraToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error("O'chirishda xatolik yuz berdi");
                    setIsDeleteModalOpen(false);
                    setKafedraToDelete(null);
                    setCascadeWarnings([]);
                }
            }
        });
    };

    const getFacultyName = (facultyId: number) => {
        const faculty = faculties.find(f => f.id === facultyId);
        return faculty ? faculty.name : `ID: ${facultyId}`;
    };

    const handleSuccess = (_savedKafedra?: Kafedra) => {
        setIsModalOpen(false);
    };

    // Кнопки действий — общие для строки таблицы и мобильной карточки.
    // Записи зеркала не редактируются: правку отклонит бэкенд.
    const renderActions = (kafedra: Kafedra) => (
        <div className="flex justify-end gap-2">
            {!isExternal(kafedra) && (
                <>
                    <PermissionGate permission="update:kafedra">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedKafedra(kafedra); setIsModalOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:kafedra">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteClick(kafedra)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
        </div>
    );

    /* Карточка кафедры в стиле референса */
    const renderKafedraCard = (kafedra: Kafedra) => (
        <div
            key={kafedra.id}
            className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
        >
            <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tileFor(kafedra.id)}`}>
                    {initialsOf(kafedra.name)}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold capitalize leading-snug text-foreground">
                        {kafedra.name}
                    </p>
                    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
                        <ExternalSourceBadge row={kafedra} />
                        <InactiveBadge row={kafedra} />
                    </span>
                </div>
                {renderActions(kafedra)}
            </div>
            <div className="mt-4 border-t border-border/60 pt-3">
                <span className="badge badge-primary capitalize">{getFacultyName(kafedra.faculty_id)}</span>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Kafedralar"
                description="Universitet kafedralarini boshqarish"
                actions={
                    <PermissionGate permission="create:kafedra">
                        <Button onClick={() => { setSelectedKafedra(null); setIsModalOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
                }
            />

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-sm sm:w-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Kafedra nomi bo'yicha qidirish..."
                        className="pl-8 sm:w-[300px]"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="w-full sm:w-[300px]">
                    <Combobox
                        options={facultyOptions}
                        value={selectedFacultyFilter}
                        onChange={(val: string) => {
                            setSelectedFacultyFilter(val);
                            setCurrentPage(1);
                        }}
                        placeholder="Fakultet bo'yicha saralash"
                    />
                </div>
            </div>

            {isKafedrasError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isKafedrasLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-36 w-full rounded-2xl" />
                    ))}
                </div>
            ) : kafedras.length === 0 ? (
                <EmptyState
                    title="Kafedralar topilmadi"
                    description="Hozircha kafedra qo'shilmagan yoki qidiruvga mos kafedra yo'q."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {kafedras.map(renderKafedraCard)}
                </div>
            )}

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isKafedrasLoading}
            />

            <KafedraModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} kafedra={selectedKafedra}
                faculties={faculties} onSuccess={handleSuccess} />
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setKafedraToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Kafedrani o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu kafedrani o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${kafedraToDelete?.name}" kafedrasini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};


export default KafedraPage;
