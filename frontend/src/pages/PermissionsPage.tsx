import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { permissionService, type Permission } from '@/services/permissionService';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Search, KeyRound } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { labelFor, parsePermission } from '@/constants/resources';
import { PageTabs } from '@/components/ui/PageTabs';
import { PageHeader } from '@/components/ui/PageHeader';

const permissionSchema = z.object({
    name: z.string().min(1, 'Ruxsat nomi kiritilishi shart'),
});

type PermissionFormValues = z.infer<typeof permissionSchema>;

const ACCESS_TABS = [
    { label: 'Rollar', href: '/roles' },
    { label: 'Ruxsatlar', href: '/permissions' },
];

const PermissionsPage = () => {
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [permissionToDelete, setPermissionToDelete] = useState<Permission | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const fetchData = async () => {
        try {
            setIsLoading(true);
            setIsError(false);
            const data = await permissionService.getPermissions(1, 1000, debouncedSearch);
            setPermissions(data.permissions);
        } catch (error) {
            logger.error('Failed to fetch permissions', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { fetchData(); }, [debouncedSearch]);

    const handleDeleteClick = (permission: Permission) => {
        setPermissionToDelete(permission);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!permissionToDelete) return;
        try {
            await permissionService.deletePermission(permissionToDelete.id);
            setPermissions((prev) => prev.filter((item) => item.id !== permissionToDelete.id));
            toast.success("Ruxsat o'chirildi");
            setIsDeleteModalOpen(false);
            setPermissionToDelete(null);
        } catch (error) {
            logger.error('Failed to delete permission', error);
            toast.error("Ruxsatni o'chirishda xatolik yuz berdi");
        }
    };

    const handleSuccess = (savedPermission?: Permission) => {
        setIsModalOpen(false);
        if (savedPermission) {
            if (selectedPermission) {
                setPermissions((prev) => prev.map((p) => (p.id === savedPermission.id ? savedPermission : p)));
            } else {
                setPermissions((prev) => [...prev, savedPermission]);
            }
        } else {
            fetchData();
        }
    };

    const grouped = permissions.reduce<Record<string, Permission[]>>((acc, perm) => {
        const { resource } = parsePermission(perm.name);
        (acc[resource] ??= []).push(perm);
        return acc;
    }, {});

    const sortedGroups = Object.entries(grouped).sort(([a], [b]) =>
        labelFor(a).localeCompare(labelFor(b))
    );

    return (
        <div className="space-y-6">
            <PageTabs tabs={ACCESS_TABS} />
            <PageHeader
                title="Ruxsatlar"
                description="Tizim ruxsatlarini boshqarish"
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
                        <Button onClick={() => { setSelectedPermission(null); setIsModalOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </>
                }
            />

            {isError ? (
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState onRetry={fetchData} />
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {Array.from({ length: 4 }, (_, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-3">
                                <Skeleton className="h-5 w-40" />
                            </CardHeader>
                            <CardContent className="pt-0 space-y-3">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-2/3" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : permissions.length === 0 ? (
                <Card>
                    <CardContent className="pt-6">
                        <EmptyState
                            title="Ruxsatlar topilmadi"
                            description="Qidiruv mezonlariga mos ruxsat yo'q."
                            icon={<KeyRound className="h-6 w-6" />}
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {sortedGroups.map(([resource, perms]) => (
                        <Card key={resource}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center justify-between text-base">
                                    <span>{labelFor(resource)}</span>
                                    <span className="badge badge-muted">
                                        {perms.length} ta
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="divide-y divide-border/60">
                                    {perms
                                        .slice()
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((perm) => (
                                            <div key={perm.id} className="flex items-center justify-between py-2">
                                                <span className="font-mono text-sm break-all">{perm.name}</span>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedPermission(perm); setIsModalOpen(true); }}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteClick(perm)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <PermissionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} permission={selectedPermission}
                onSuccess={handleSuccess} />
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Ruxsatni o'chirish"
                description={`Haqiqatan ham "${permissionToDelete?.name}" ruxsatini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.`}
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
};

const PermissionModal = ({ isOpen, onClose, permission, onSuccess }: {
    isOpen: boolean; onClose: () => void; permission: Permission | null; onSuccess: (permission?: Permission) => void;
}) => {
    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PermissionFormValues>({
        resolver: zodResolver(permissionSchema),
        defaultValues: { name: '' },
    });

    useEffect(() => {
        reset({ name: permission?.name || '' });
    }, [permission, reset]);

    const onSubmit = async (data: PermissionFormValues) => {
        try {
            let result;
            if (permission) {
                result = await permissionService.updatePermission(permission.id, data);
            } else {
                result = await permissionService.createPermission(data);
            }
            toast.success(permission ? 'Ruxsat yangilandi' : 'Ruxsat yaratildi');
            onSuccess(result);
        } catch (error) {
            logger.error('Failed to save permission', error);
            toast.error('Ruxsatni saqlashda xatolik');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={permission ? 'Ruxsatni tahrirlash' : 'Ruxsat yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Ruxsat nomi" {...register('name')} error={errors.name?.message} placeholder="masalan: read:user, create:quiz" />
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>{permission ? 'Yangilash' : 'Yaratish'}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default PermissionsPage;
