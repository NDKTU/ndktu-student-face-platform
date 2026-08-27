import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { Pagination } from '@/components/ui/Pagination';
import type { User, Role } from '@/types/auth';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useAssignRoles } from '@/hooks/useUsers';
import { useRoles } from '@/hooks/useReferenceData';
import { ExpandableTags } from '@/components/ui/ExpandableTags';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

const userSchema = z.object({
    username: z.string().min(3, "Foydalanuvchi nomi kamida 3 ta belgidan iborat bo'lishi kerak"),
    password: z.string().optional(),
    role_ids: z.array(z.coerce.number()).min(1, 'Kamida bitta rol tanlanishi shart'),
});

type UserFormValues = z.infer<typeof userSchema>;

const USER_TABS = [
    { label: 'Tizim foydalanuvchilari', href: '/users' },
    { label: 'Talabalar', href: '/students' },
    { label: "O'qituvchilar", href: '/teachers' },
    { label: 'Xodimlar', href: '/employees' },
];

const UsersPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1); // Reset to first page on search
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    const {
        data: usersData,
        isLoading: isUsersLoading,
        isError: isUsersError,
        refetch: refetchUsers,
    } = useUsers(currentPage, pageSize, debouncedSearch);
    const { data: rolesData } = useRoles();
    const deleteUserMutation = useDeleteUser();


    const users = usersData?.users || [];
    const totalPages = usersData ? Math.ceil(usersData.total / pageSize) : 1;
    const roles = rolesData?.roles || [];

    const handleDeleteClick = (user: User) => {
        setUserToDelete(user);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete) return;
        deleteUserMutation.mutate({ id: userToDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                toast.success("Foydalanuvchi o'chirildi");
                setIsDeleteModalOpen(false);
                setUserToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error("O'chirishda xatolik yuz berdi");
                    setIsDeleteModalOpen(false);
                    setUserToDelete(null);
                    setCascadeWarnings([]);
                }
            }
        });
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
    };

    const getRoleName = (roleId?: number) => {
        if (!roleId) return '-';
        // Explicitly typo role to avoid implicit any if the roles array type isn't fully inferred or is loose
        const role = roles.find((r: Role) => r.id === roleId);
        return role ? role.name : `ID: ${roleId}`;
    };

    const renderRowActions = (user: User) => (
        <div className="flex justify-end gap-2">
            <PermissionGate permission="update:user">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedUser(user); setIsModalOpen(true); }}
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:user">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteClick(user)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    const columns: DataTableColumn<User>[] = [
        { key: 'id', header: 'ID', cell: (user) => user.id, headClassName: 'w-[80px]' },
        { key: 'username', header: 'Foydalanuvchi nomi', cell: (user) => user.username, className: 'font-medium' },
        {
            key: 'roles',
            header: 'Rol',
            cell: (user) => (
                <ExpandableTags
                    items={(user.roles || []).map(r => ({ id: r.id, name: getRoleName(r.id) }))}
                    limit={2}
                />
            ),
        },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            cell: (user) => new Date(user.created_at).toLocaleDateString(),
            hideBelow: 'lg',
        },
        {
            key: 'actions',
            header: <span className="block text-right">Amallar</span>,
            cell: (user) => renderRowActions(user),
            className: 'text-right',
        },
    ];

    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            <PageHeader
                title="Foydalanuvchilar"
                description="Tizim foydalanuvchilarini boshqarish"
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
                        <PermissionGate permission="create:user">
                            <Button onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}>
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
                        data={users}
                        rowKey={(user) => user.id}
                        isLoading={isUsersLoading}
                        isError={isUsersError}
                        onRetry={() => refetchUsers()}
                        emptyTitle="Foydalanuvchilar topilmadi"
                        emptyDescription="Qidiruv mezonlariga mos foydalanuvchi yo'q."
                        emptyIcon={<Users className="h-6 w-6" />}
                        renderCard={(user) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-foreground">{user.username}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            ID: {user.id} · {new Date(user.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {renderRowActions(user)}
                                </div>
                                <div className="mt-2">
                                    <ExpandableTags
                                        items={(user.roles || []).map(r => ({ id: r.id, name: getRoleName(r.id) }))}
                                        limit={2}
                                    />
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
                isLoading={isUsersLoading}
            />

            <UserModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
                roles={roles}
                onSuccess={handleSuccess}
            />



            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setUserToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Foydalanuvchini o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">Diqqat! Ushbu foydalanuvchini o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/80">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham '${userToDelete?.username}' foydalanuvchisini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

const UserModal = ({
    isOpen,
    onClose,
    user,
    roles,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    roles: Role[];
    onSuccess: (user?: User) => void;
}) => {
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<UserFormValues>({
        resolver: zodResolver(userSchema) as any,
        defaultValues: {
            username: '',
            password: '',
            role_ids: [],
        },
    });

    const createMutation = useCreateUser();
    const updateMutation = useUpdateUser();
    const assignRolesMutation = useAssignRoles();
    const isSubmitting = createMutation.isPending || updateMutation.isPending || assignRolesMutation.isPending;

    useEffect(() => {
        if (user) {
            reset({
                username: user.username,
                password: '', // Don't fill password on edit
                role_ids: user.roles?.map(r => r.id) || [],
            });
        } else {
            reset({
                username: '',
                password: '',
                role_ids: [],
            });
        }
    }, [user, reset]);

    const onSubmit = (data: UserFormValues) => {
        if (user) {
            const payload: any = {
                username: data.username,
            };
            if (data.password) {
                payload.password = data.password;
            }

            const currentRoleIds = [...(user.roles?.map(r => r.id) ?? [])].sort();
            const nextRoleIds = [...data.role_ids].sort();
            const rolesChanged =
                currentRoleIds.length !== nextRoleIds.length ||
                currentRoleIds.some((id, index) => id !== nextRoleIds[index]);

            updateMutation.mutate({ id: user.id, data: payload }, {
                onSuccess: (updatedUser: any) => {
                    if (!rolesChanged) {
                        toast.success('Foydalanuvchi yangilandi');
                        onSuccess(updatedUser);
                        return;
                    }
                    // `assign_role` rollar to'plamini butunlay almashtiradi —
                    // qo'shmaydi, shuning uchun formadagi ro'yxat yakuniy holat.
                    assignRolesMutation.mutate(
                        { user_id: user.id, role_ids: data.role_ids },
                        {
                            onSuccess: () => {
                                toast.success('Foydalanuvchi va rollari yangilandi');
                                onSuccess(updatedUser);
                            },
                            onError: (error) => {
                                logger.error('Failed to assign roles', error);
                                toast.error("Rollarni o'zgartirishda xatolik yuz berdi");
                            },
                        },
                    );
                },
                onError: (error) => {
                    logger.error('Failed to update user', error);
                    toast.error('Foydalanuvchini yangilashda xatolik yuz berdi');
                }
            });
        } else {
            if (!data.password) {
                toast.error('Yangi foydalanuvchilar uchun parol talab qilinadi');
                return;
            }

            const payload = {
                username: data.username,
                password: data.password,
                roles: data.role_ids.map(id => ({ name: roles.find(r => r.id === id)?.name || '' })),
            };

            createMutation.mutate(payload, {
                onSuccess: (newUser: any) => {
                    toast.success('Foydalanuvchi yaratildi');
                    onSuccess(newUser);
                },
                onError: (error: any) => {
                    logger.error('Failed to create user', error);
                    toast.error('Foydalanuvchi yaratishda xatolik yuz berdi');
                }
            });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={user ? 'Foydalanuvchini tahrirlash' : 'Foydalanuvchi yaratish'}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                    label="Foydalanuvchi nomi"
                    {...register('username')}
                    error={errors.username?.message}
                />

                {!user && (
                    <Input
                        label="Parol"
                        type="password"
                        autoComplete="new-password"
                        {...register('password')}
                        error={errors.password?.message}
                    />
                )}

                <div className="space-y-2 relative z-0">
                    <label className="text-sm font-medium">Rollar</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto p-2 border rounded-md">
                        {roles.map((role) => (
                            <div key={role.id} className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id={`role-${role.id}`}
                                    value={role.id}
                                    {...register('role_ids')}
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                <label htmlFor={`role-${role.id}`} className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                    {role.name}
                                </label>
                            </div>
                        ))}
                    </div>
                    {errors.role_ids && (
                        <p className="text-xs text-destructive">{errors.role_ids.message}</p>
                    )}
                </div>



                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        {user ? 'Yangilash' : 'Yaratish'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};



export default UsersPage;
