import { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { Pagination } from '@/components/ui/Pagination';
import { roleService, type Role } from '@/services/roleService';
import { Button } from '@/components/ui/Button';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';

const roleSchema = z.object({
    name: z.string().min(1, 'Role name is required'),
});

type RoleFormValues = z.infer<typeof roleSchema>;

const ACCESS_TABS = [
    { label: 'Rollar', href: '/roles' },
    { label: 'Ruxsatlar', href: '/permissions' },
];

const RolesPage = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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
            const data = await roleService.getRoles(currentPage, pageSize, debouncedSearch);
            setRoles(data.roles);
            setTotalPages(Math.ceil(data.total / pageSize));
        } catch (error) {
            logger.error('Failed to fetch roles', error);
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
            setIsDeleteModalOpen(false);
            setRoleToDelete(null);
        } catch (error) {
            logger.error('Failed to delete role', error);
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

    return (
        <div className="space-y-6">
            <PageTabs tabs={ACCESS_TABS} />
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Rollar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Tizim rollarini va ruxsatlarni boshqarish</p>
                </div>
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
                    <PermissionGate permission="create:role">
                        <Button onClick={() => { setSelectedRole(null); setIsModalOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>Nomi</TableHead>
                                    <TableHead>Ruxsatlar</TableHead>
                                    <TableHead>Yaratilgan sana</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {roles.filter((r) => r.name.toLowerCase() !== 'admin').map((role) => (
                                    <TableRow
                                        key={role.id}
                                        onClick={() => navigate(`/roles/${role.id}/permissions`)}
                                        className="cursor-pointer hover:bg-accent/40 transition-colors"
                                    >
                                        <TableCell>{role.id}</TableCell>
                                        <TableCell className="font-medium">{role.name}</TableCell>
                                        <TableCell>
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
                                        </TableCell>
                                        <TableCell>{role.created_at ? new Date(role.created_at).toLocaleDateString() : '-'}</TableCell>
                                        <TableCell className="text-right">
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
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {roles.filter((r) => r.name.toLowerCase() !== 'admin').length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No roles found.</TableCell>
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
                isLoading={isLoading}
            />

            <RoleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} role={selectedRole}
                onSuccess={handleSuccess} />
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Role"
                description={`Are you sure you want to delete the role "${roleToDelete?.name}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
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

            // For new roles, jump straight into the access editor.
            if (!role && result?.id) {
                onSuccess(result);
                navigate(`/roles/${result.id}/permissions`);
                return;
            }
            onSuccess(result);
        } catch (error) {
            logger.error('Failed to save role', error);
            alert('Rolni saqlashda xatolik');
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
