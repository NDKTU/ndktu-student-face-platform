import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { type Group } from '@/services/groupService';
import { type Faculty } from '@/services/facultyService';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/hooks/useGroups';
import { useFaculties } from '@/hooks/useReferenceData';
import { useAuth } from '@/context/AuthContext';
import { Combobox } from '@/components/ui/Combobox';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

const groupSchema = z.object({
    name: z.string().min(1, 'Guruh nomi kiritilishi shart'),
    faculty_id: z.number({ message: 'Fakultet tanlanishi shart' }).min(1, 'Fakultetni tanlang'),
});

type GroupFormValues = z.infer<typeof groupSchema>;

const GroupsPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
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

    const { hasPermission } = useAuth();
    const canReadFaculty = hasPermission('read:faculty');

    const facultyIdParam = selectedFacultyFilter === 'all' ? undefined : Number(selectedFacultyFilter);
    const { data: groupsData, isLoading: isGroupsLoading, isError: isGroupsError, refetch } = useGroups(currentPage, pageSize, debouncedSearch, undefined, facultyIdParam);
    const { data: facultiesData } = useFaculties(1, 100, undefined, canReadFaculty);
    const deleteGroupMutation = useDeleteGroup();

    const groups = groupsData?.groups || [];
    const totalPages = groupsData ? Math.ceil(groupsData.total / pageSize) : 1;
    const faculties = facultiesData?.faculties || [];

    const facultyOptions = useMemo(() => {
        const options = faculties.map(f => ({
            value: f.id.toString(),
            label: f.name
        }));
        return [{ value: 'all', label: 'Barcha fakultetlar' }, ...options];
    }, [faculties]);

    const handleDeleteClick = (group: Group) => {
        setGroupToDelete(group);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!groupToDelete) return;

        deleteGroupMutation.mutate({ id: groupToDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                toast.success("Guruh o'chirildi");
                setIsDeleteModalOpen(false);
                setGroupToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error("O'chirishda xatolik yuz berdi");
                    setIsDeleteModalOpen(false);
                    setGroupToDelete(null);
                    setCascadeWarnings([]);
                }
            }
        });
    };

    const getFacultyName = (facultyId: number) => {
        const faculty = faculties.find(f => f.id === facultyId);
        return faculty ? faculty.name : `ID: ${facultyId}`;
    };

    const handleSuccess = (_savedGroup?: Group) => {
        setIsModalOpen(false);
    };

    // Кнопки действий — общие для строки таблицы и мобильной карточки.
    // Записи зеркала не редактируются: правку отклонит бэкенд.
    const renderActions = (group: Group) => (
        <div className="flex justify-end gap-2">
            {!isExternal(group) && (
                <>
                    <PermissionGate permission="update:group">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedGroup(group); setIsModalOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:group">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteClick(group)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
        </div>
    );

    const columns: DataTableColumn<Group>[] = [
        { key: 'id', header: 'ID', headClassName: 'w-[80px]', cell: (group) => group.id },
        {
            key: 'name',
            header: 'Nomi',
            className: 'font-medium capitalize',
            cell: (group) => (
                <span className="inline-flex items-center gap-2">
                    {group.name}
                    <ExternalSourceBadge row={group} />
                    <InactiveBadge row={group} />
                </span>
            ),
        },
        {
            key: 'faculty',
            header: 'Fakultet',
            cell: (group) => (
                <span className="badge badge-primary capitalize">
                    {getFacultyName(group.faculty_id)}
                </span>
            ),
        },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            hideBelow: 'lg',
            cell: (group) => new Date(group.created_at).toLocaleDateString(),
        },
        {
            key: 'actions',
            header: 'Amallar',
            headClassName: 'text-right',
            cell: (group) => renderActions(group),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Guruhlar"
                description="Universitet o'quv guruhlarini boshqarish"
                actions={
                    <PermissionGate permission="create:group">
                        <Button onClick={() => { setSelectedGroup(null); setIsModalOpen(true); }}>
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
                        placeholder="Guruh nomi bo'yicha qidirish..."
                        className="pl-8 sm:w-[300px]"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <PermissionGate permission="read:faculty">
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
                </PermissionGate>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={groups}
                        rowKey={(group) => group.id}
                        isLoading={isGroupsLoading}
                        isError={isGroupsError}
                        onRetry={() => refetch()}
                        emptyTitle="Guruhlar topilmadi"
                        emptyDescription="Hozircha guruh qo'shilmagan yoki qidiruvga mos guruh yo'q."
                        renderCard={(group) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium capitalize text-foreground">
                                            <span className="inline-flex flex-wrap items-center gap-2">
                                                {group.name}
                                                <ExternalSourceBadge row={group} />
                                                <InactiveBadge row={group} />
                                            </span>
                                        </p>
                                        <p className="mt-1.5">
                                            <span className="badge badge-primary capitalize">
                                                {getFacultyName(group.faculty_id)}
                                            </span>
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            ID: {group.id} · {new Date(group.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {renderActions(group)}
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
                isLoading={isGroupsLoading}
            />

            <GroupModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} group={selectedGroup}
                faculties={faculties} onSuccess={handleSuccess} />
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setGroupToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Guruhni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu guruhni o'chirish quyidagi ma'lumotlarni ham o'zgartiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${groupToDelete?.name}" guruhini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

const GroupModal = ({ isOpen, onClose, group, faculties, onSuccess }: {
    isOpen: boolean; onClose: () => void; group: Group | null; faculties: Faculty[]; onSuccess: (group?: Group) => void;
}) => {
    const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<GroupFormValues>({
        resolver: zodResolver(groupSchema),
        defaultValues: { name: '', faculty_id: 0 },
    });

    const createMutation = useCreateGroup();
    const updateMutation = useUpdateGroup();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const selectedFacultyId = watch('faculty_id');

    useEffect(() => {
        if (group) {
            reset({ name: group.name, faculty_id: group.faculty_id });
        } else {
            reset({ name: '', faculty_id: 0 });
        }
    }, [group, reset]);

    const onSubmit = (data: GroupFormValues) => {
        if (group) {
            updateMutation.mutate({ id: group.id, data }, {
                onSuccess: (data) => {
                    toast.success('Guruh yangilandi');
                    onSuccess(data);
                },
                onError: () => toast.error('Guruhni yangilashda xatolik'),
            });
        } else {
            createMutation.mutate(data, {
                onSuccess: (data) => {
                    toast.success('Guruh yaratildi');
                    onSuccess(data);
                },
                onError: () => toast.error('Guruh yaratishda xatolik'),
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={group ? 'Guruhni tahrirlash' : 'Guruh yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Guruh nomi" {...register('name')} error={errors.name?.message} placeholder="Guruh nomini kiriting" />
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Fakultet</label>
                    <select
                        value={selectedFacultyId}
                        onChange={(e) => setValue('faculty_id', Number(e.target.value))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <option value={0}>Fakultetni tanlang...</option>
                        {faculties.map((faculty) => (
                            <option key={faculty.id} value={faculty.id}>{faculty.name}</option>
                        ))}
                    </select>
                    {errors.faculty_id && (
                        <p className="mt-1 text-xs text-destructive">{errors.faculty_id.message}</p>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>{group ? 'Yangilash' : 'Yaratish'}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default GroupsPage;
