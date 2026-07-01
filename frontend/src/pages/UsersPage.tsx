import { useState, useEffect } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import type { User, Role } from '@/types/auth';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
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

const userSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().optional(),
    role_ids: z.array(z.coerce.number()).min(1, 'Kamida bitta rol tanlanishi shart'),
});

type UserFormValues = z.infer<typeof userSchema>;

const USER_TABS = [
    { label: 'Tizim foydalanuvchilari', href: '/users' },
    { label: 'Talabalar', href: '/students' },
    { label: "O'qituvchilar", href: '/teachers' },
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

    const { data: usersData, isLoading: isUsersLoading } = useUsers(currentPage, pageSize, debouncedSearch);
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
                setIsDeleteModalOpen(false);
                setUserToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    alert("O'chirishda xatolik yuz berdi");
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
        if (!roleId) return 'N/A';
        // Explicitly typo role to avoid implicit any if the roles array type isn't fully inferred or is loose
        const role = roles.find((r: Role) => r.id === roleId);
        return role ? role.name : `ID: ${roleId}`;
    };



    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Foydalanuvchilar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Tizim foydalanuvchilarini boshqarish</p>
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
                    <PermissionGate permission="create:user">
                        <Button onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    {isUsersLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="flex justify-center p-8 text-muted-foreground">
                            Foydalanuvchilar topilmadi.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>Foydalanuvchi nomi</TableHead>
                                    <TableHead>Rol</TableHead>
                                    <TableHead>Yaratilgan sana</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell>{user.id}</TableCell>
                                        <TableCell className="font-medium">{user.username}</TableCell>
                                        <TableCell>
                                            <ExpandableTags
                                                items={(user.roles || []).map(r => ({ id: r.id, name: getRoleName(r.id) }))}
                                                limit={2}
                                            />
                                        </TableCell>

                                        <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
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
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
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
                            <p className="text-red-600 font-medium">Diqqat! Ushbu foydalanuvchini o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-red-500">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-red-700 mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
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

            updateMutation.mutate({ id: user.id, data: payload }, {
                onSuccess: (updatedUser: any) => {
                    onSuccess(updatedUser);
                },
                onError: (error) => {
                    console.error('Failed to update user', error);
                    alert('Foydalanuvchini yangilashda xatolik yuz berdi');
                }
            });
        } else {
            if (!data.password) {
                alert('Yangi foydalanuvchilar uchun parol talab qilinadi');
                return;
            }

            const payload = {
                username: data.username,
                password: data.password,
                roles: data.role_ids.map(id => ({ name: roles.find(r => r.id === id)?.name || '' })),
            };

            createMutation.mutate(payload, {
                onSuccess: (newUser: any) => onSuccess(newUser),
                onError: (error: any) => {
                    console.error('Failed to create user', error);
                    alert('Foydalanuvchi yaratishda xatolik yuz berdi');
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
                    <>
                        <Input
                            label="Parol"
                            type="password"
                            autoComplete="new-password"
                            {...register('password')}
                            error={errors.password?.message}
                        />

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
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
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
                    </>
                )}



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
