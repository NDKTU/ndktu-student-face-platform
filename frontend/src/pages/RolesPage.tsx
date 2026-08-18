import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { Pagination } from '@/components/ui/Pagination';
import { roleService, type Role } from '@/services/roleService';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Search, ShieldCheck } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

const roleSchema = z.object({
    name: z.string().min(1, 'Rol nomi kiritilishi shart'),
});

type RoleFormValues = z.infer<typeof roleSchema>;

const ACCESS_TABS = [
    { label: 'Rollar', href: '/roles' },
    { label: 'Ruxsatlar', href: '/permissions' },
];

const RolesPage = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 10;
    const navigate = useNavigate();

    const fetchData = async () => {
        try {
            setIsLoading(true);
            setIsError(false);
            const data = await roleService.getRoles(currentPage, pageSize, debouncedSearch);
            setRoles(data.roles);
            setTotalPages(Math.ceil(data.total / pageSize));
        } catch (error) {
            logger.error('Failed to fetch roles', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { fetchData(); }, [currentPage, debouncedSearch]);

    const handleDeleteClick = (role: Role) => {
        setRoleToDelete(role);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!roleToDelete) return;
        try {
            await roleService.deleteRole(roleToDelete.id);
            setRoles((prev) => prev.filter((item) => item.id !== roleToDelete.id));
            toast.success("Rol o'chirildi");
            setIsDeleteModalOpen(false);
            setRoleToDelete(null);
        } catch (error) {
            logger.error('Failed to delete role', error);
            toast.error("Rolni o'chirishda xatolik yuz berdi");
        }
    };

    const handleSuccess = (savedRole?: Role) => {
        setIsModalOpen(false);
        if (savedRole) {
            if (selectedRole) {
                setRoles((prev) => prev.map((r) => (r.id === savedRole.id ? savedRole : r)));
            } else {
                setRoles((prev) => [...prev, savedRole]);
            }
        } else {
            fetchData();
        }
    };

    const visibleRoles = roles.filter((r) => r.name.toLowerCase() !== 'admin');

    const renderPermissions = (role: Role) => (
        <div className="flex flex-wrap gap-1 max-w-[300px] items-center">
            {role.permissions && role.permissions.length > 0 ? (
                <>
                    <span className="inline-flex items-center rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold text-foreground bg-background">
                        {role.permissions[0].name}
                    </span>
                    {role.permissions.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/roles/${role.id}/permissions`); }}
                            className="inline-flex items-center rounded-full bg-secondary/50 hover:bg-secondary px-2.5 py-0.5 text-xs font-semibold transition-colors text-secondary-foreground cursor-pointer"
                        >
                            +{role.permissions.length - 1} ko'proq
                        </button>
                    )}
                </>
            ) : (
                <span>-</span>
            )}
        </div>
    );

    const renderRowActions = (role: Role) => (
        <div className="flex justify-end gap-2">
            <PermissionGate permission="update:role">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedRole(role); setIsModalOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:role">
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteClick(role); }}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    const columns: DataTableColumn<Role>[] = [
        { key: 'id', header: 'ID', cell: (role) => role.id, headClassName: 'w-[80px]' },
        { key: 'name', header: 'Nomi', cell: (role) => role.name, className: 'font-medium' },
        { key: 'permissions', header: 'Ruxsatlar', cell: renderPermissions },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            cell: (role) => (role.created_at ? new Date(role.created_at).toLocaleDateString() : '-'),
            hideBelow: 'lg',
        },
        {
            key: 'actions',
            header: <span className="block text-right">Amallar</span>,
            cell: renderRowActions,
            className: 'text-right',
        },
    ];

    return (
        <div className="space-y-6">
            <PageTabs tabs={ACCESS_TABS} />
            <PageHeader
                title="Rollar"
                description="Tizim rollarini va ruxsatlarni boshqarish"
                actions={
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Qidirish..."
                                className="pl-8 w-[220px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <PermissionGate permission="create:role">
                            <Button onClick={() => { setSelectedRole(null); setIsModalOpen(true); }}>
                                <Plus className="mr-2 h-4 w-4" />
                                Qo'shish
                            </Button>
                        </PermissionGate>
                    </>
                }
            />

            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={visibleRoles}
                        rowKey={(role) => role.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={fetchData}
                        onRowClick={(role) => navigate(`/roles/${role.id}/permissions`)}
                        emptyTitle="Rollar topilmadi"
                        emptyDescription="Qidiruv mezonlariga mos rol yo'q."
                        emptyIcon={<ShieldCheck className="h-6 w-6" />}
                        renderCard={(role) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-foreground">{role.name}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            ID: {role.id}{role.created_at ? ` · ${new Date(role.created_at).toLocaleDateString()}` : ''}
                                        </p>
                                    </div>
                                    {renderRowActions(role)}
                                </div>
                                <div className="mt-2">{renderPermissions(role)}</div>
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

            <RoleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} role={selectedRole}
                onSuccess={handleSuccess} />
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Rolni o'chirish"
                description={`Haqiqatan ham "${roleToDelete?.name}" rolini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
};

const RoleModal = ({ isOpen, onClose, role, onSuccess }: {
    isOpen: boolean; onClose: () => void; role: Role | null; onSuccess: (role?: Role) => void;
}) => {
    const navigate = useNavigate();
    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<RoleFormValues>({
        resolver: zodResolver(roleSchema),
        defaultValues: { name: '' },
    });

    useEffect(() => {
        reset({ name: role?.name || '' });
    }, [role, reset]);

    const onSubmit = async (data: RoleFormValues) => {
        try {
            const result = role
                ? await roleService.updateRole(role.id, { name: data.name })
                : await roleService.createRole({ name: data.name });

            toast.success(role ? 'Rol yangilandi' : 'Rol yaratildi');

            // For new roles, jump straight into the access editor.
            if (!role && result?.id) {
                onSuccess(result);
                navigate(`/roles/${result.id}/permissions`);
                return;
            }
            onSuccess(result);
        } catch (error) {
            logger.error('Failed to save role', error);
            toast.error('Rolni saqlashda xatolik');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={role ? "Rolni tahrirlash" : "Yangi rol"}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Rol nomi" {...register('name')} error={errors.name?.message} placeholder="masalan: teacher, student" />
                <p className="text-xs text-muted-foreground">
                    Saqlagandan so'ng ruxsatlarni rolning sahifasida tahrirlang.
                </p>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>{role ? "Saqlash" : "Yaratish"}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default RolesPage;
