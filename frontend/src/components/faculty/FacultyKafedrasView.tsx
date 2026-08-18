import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { useKafedras, useDeleteKafedra } from '@/hooks/useReferenceData';
import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import { Crumbs } from './Crumbs';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { KafedraModal } from '@/components/kafedra/KafedraModal'; // We need to import or move the modal

interface FacultyKafedrasViewProps {
    faculty: Faculty;
    onBack: () => void;
    onOpenKafedra: (kafedra: Kafedra) => void;
    hideHeader?: boolean;
}

export const FacultyKafedrasView = ({ faculty, onBack, onOpenKafedra, hideHeader }: FacultyKafedrasViewProps) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 10;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedKafedra, setSelectedKafedra] = useState<Kafedra | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [kafedraToDelete, setKafedraToDelete] = useState<Kafedra | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    const deleteKafedraMutation = useDeleteKafedra();

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: kafedrasData, isLoading, isError, refetch } = useKafedras(currentPage, pageSize, debouncedSearch, faculty.id);
    const kafedras = kafedrasData?.kafedras || [];
    const totalPages = kafedrasData ? Math.ceil(kafedrasData.total / pageSize) : 1;

    const handleDeleteClick = (kafedra: Kafedra, e: React.MouseEvent) => {
        e.stopPropagation();
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

    // Кнопки действий — общие для строки таблицы и мобильной карточки
    const renderActions = (kafedra: Kafedra) => (
        <div className="flex justify-end gap-2">
            <PermissionGate permission="update:kafedra">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedKafedra(kafedra); setIsModalOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:kafedra">
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => handleDeleteClick(kafedra, e)}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    const columns: DataTableColumn<Kafedra>[] = [
        { key: 'id', header: 'ID', headClassName: 'w-[80px]', cell: (kafedra) => kafedra.id },
        { key: 'name', header: 'Nomi', className: 'font-medium capitalize', cell: (kafedra) => kafedra.name },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            hideBelow: 'lg',
            cell: (kafedra) => new Date(kafedra.created_at).toLocaleDateString(),
        },
        {
            key: 'actions',
            header: 'Amallar',
            headClassName: 'text-right',
            cell: (kafedra) => renderActions(kafedra),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {!hideHeader && (
                    <div className="space-y-2">
                        <Crumbs items={[
                            { label: 'Fakultetlar', onClick: onBack },
                            { label: faculty.name },
                        ]} />
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="sm" onClick={onBack}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Orqaga
                            </Button>
                            <h1 className="page-title capitalize">{faculty.name} — kafedralar</h1>
                        </div>
                    </div>
                )}
                {hideHeader && <div />}
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Qidirish..."
                            className="pl-8 w-[220px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <PermissionGate permission="create:kafedra">
                        <Button onClick={() => { setSelectedKafedra(null); setIsModalOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={kafedras}
                        rowKey={(kafedra) => kafedra.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        emptyTitle="Kafedralar topilmadi"
                        emptyDescription="Ushbu fakultetda kafedra yo'q yoki qidiruvga mos kafedra topilmadi."
                        onRowClick={onOpenKafedra}
                        renderCard={(kafedra) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium capitalize text-foreground">{kafedra.name}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            ID: {kafedra.id} · {new Date(kafedra.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {renderActions(kafedra)}
                                </div>
                            </div>
                        )}
                    />
                </CardContent>
            </Card>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isLoading}
            />

            {isModalOpen && (
                <KafedraModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    kafedra={selectedKafedra}
                    faculties={[faculty]}
                    defaultFacultyId={faculty.id}
                    onSuccess={() => setIsModalOpen(false)}
                />
            )}

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
