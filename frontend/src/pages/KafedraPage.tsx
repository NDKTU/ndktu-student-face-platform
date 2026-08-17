import { useEffect, useState, useMemo } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { type Kafedra } from '@/services/kafedraService';

import { Button } from '@/components/ui/Button';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { useKafedras, useDeleteKafedra, useFaculties } from '@/hooks/useReferenceData';
import { Combobox } from '@/components/ui/Combobox';
import { PermissionGate } from '@/components/auth/PermissionGate';
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
    const { data: kafedrasData, isLoading: isKafedrasLoading } = useKafedras(currentPage, pageSize, debouncedSearch, facultyIdParam);
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
                setIsDeleteModalOpen(false);
                setKafedraToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    alert("O'chirishda xatolik yuz berdi");
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

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Kafedralar</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">Universitet kafedralarini boshqarish</p>
                    </div>
                    <PermissionGate permission="create:kafedra">
                        <Button onClick={() => { setSelectedKafedra(null); setIsModalOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
                </div>

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
            </div>

            <Card>
                <CardContent className="pt-6">
                    {isKafedrasLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>Nomi</TableHead>
                                    <TableHead>Fakultet</TableHead>
                                    <TableHead>Yaratilgan sana</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {kafedras.map((kafedra) => (
                                    <TableRow key={kafedra.id}>
                                        <TableCell>{kafedra.id}</TableCell>
                                        <TableCell className="font-medium capitalize">
                                            <span className="inline-flex items-center gap-2">
                                                {kafedra.name}
                                                <ExternalSourceBadge row={kafedra} />
                                                <InactiveBadge row={kafedra} />
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 capitalize">
                                                {getFacultyName(kafedra.faculty_id)}
                                            </span>
                                        </TableCell>
                                        <TableCell>{new Date(kafedra.created_at).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            {/* Записи зеркала не редактируются: правку отклонит бэкенд. */}
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
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {kafedras.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Kafedralar topilmadi.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

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
                            <p className="text-red-600 font-medium">Diqqat! Ushbu kafedrani o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-red-500">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-red-700 mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
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
