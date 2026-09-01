import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import { Pagination } from '@/components/ui/Pagination';
import type { User, Role } from '@/types/auth';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
    Plus,
    Pencil,
    Trash2,
    CheckCircle2,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useAssignRoles } from '@/hooks/useUsers';
import { useRoles } from '@/hooks/useReferenceData';
import { ExpandableTags } from '@/components/ui/ExpandableTags';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar, FilterChipGroup } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';

const userSchema = z.object({
    username: z.string().min(3, "Foydalanuvchi nomi kamida 3 ta belgidan iborat bo'lishi kerak"),
    password: z.string().optional(),
    role_ids: z.array(z.coerce.number()).min(1, 'Kamida bitta rol tanlanishi shart'),
});

type UserFormValues = z.infer<typeof userSchema>;

type SortField = 'id' | 'username' | 'created_at';
type SortOrder = 'asc' | 'desc';

export const UsersPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [sortField, setSortField] = useState<SortField>('id');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const pageSize = 15;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
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

    const rawUsers = usersData?.users || [];
    const totalPages = usersData ? Math.ceil(usersData.total / pageSize) : 1;
    const totalCount = usersData?.total ?? rawUsers.length;
    const roles = rolesData?.roles || [];

    const getRoleName = (roleId?: number) => {
        if (!roleId) return '-';
        const role = roles.find((r: Role) => r.id === roleId);
        return role ? role.name : `ID: ${roleId}`;
    };

    const roleChipOptions = useMemo(() => {
        const list = roles.map((r) => ({ value: String(r.id), label: r.name }));
        return [{ value: 'all', label: 'Barchasi' }, ...list];
    }, [roles]);

    const filteredUsers = useMemo(() => {
        if (selectedRoleFilter === 'all') return rawUsers;
        const roleIdNum = Number(selectedRoleFilter);
        return rawUsers.filter((u) => u.roles?.some((r) => r.id === roleIdNum));
    }, [rawUsers, selectedRoleFilter]);

    const sortedUsers = useMemo(() => {
        return [...filteredUsers].sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'id') {
                valA = a.id;
                valB = b.id;
            } else if (sortField === 'username') {
                valA = a.username.toLowerCase();
                valB = b.username.toLowerCase();
            } else if (sortField === 'created_at') {
                valA = new Date(a.created_at).getTime();
                valB = new Date(b.created_at).getTime();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredUsers, sortField, sortOrder]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleDeleteClick = (user: User) => {
        setUserToDelete(user);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete) return;
        deleteUserMutation.mutate(
            { id: userToDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Foydalanuvchi o'chirildi");
                    setIsDeleteModalOpen(false);
                    setUserToDelete(null);
                    setCascadeWarnings([]);
                    refetchUsers();
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
                },
            }
        );
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
        refetchUsers();
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />;
        }
        return sortOrder === 'asc' ? (
            <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-primary" />
        ) : (
            <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
        );
    };

    const renderRowActions = (user: User) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <PermissionGate permission="update:user">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Tahrirlash"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUser(user);
                        setIsModalOpen(true);
                    }}
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:user">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                    title="O'chirish"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(user);
                    }}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Top Sub-Navigation Tabs */}

            {/* Breadcrumb Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Foydalanuvchilar', onClick: () => {} }, { label: 'Tizim foydalanuvchilari' }]}
                title="Tizim Foydalanuvchilari"
                description="Tizim hisoblari, administratorlar, xodimlar va biriktirilgan rollar"
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Foydalanuvchi nomi bo'yicha qidirish..."
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                totalCount={totalCount}
                totalLabel="Foydalanuvchilar"
                chips={
                    roleChipOptions.length > 1 ? (
                        <FilterChipGroup
                            label="Rol bo'yicha"
                            value={selectedRoleFilter}
                            onChange={(val) => {
                                setSelectedRoleFilter(val);
                                setCurrentPage(1);
                            }}
                            options={roleChipOptions}
                        />
                    ) : undefined
                }
                actions={
                    <PermissionGate permission="create:user">
                        <Button
                            size="sm"
                            onClick={() => {
                                setSelectedUser(null);
                                setIsModalOpen(true);
                            }}
                            className="h-9 gap-1.5 font-semibold shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Qo'shish</span>
                        </Button>
                    </PermissionGate>
                }
            />

            {/* Content */}
            {isUsersError ? (
                <ErrorState onRetry={() => refetchUsers()} />
            ) : isUsersLoading ? (
                viewMode === 'table' ? (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <CatalogGrid>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                        ))}
                    </CatalogGrid>
                )
            ) : sortedUsers.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title="Foydalanuvchilar topilmadi"
                        description={
                            searchTerm || selectedRoleFilter !== 'all'
                                ? "Tanlangan filtrlarga mos foydalanuvchi topilmadi."
                                : "Hozircha tizimda foydalanuvchi qo'shilmagan."
                        }
                    />
                </div>
            ) : viewMode === 'table' ? (
                /* High-Density Optimized Table View */
                <Table className="min-w-full border-separate border-spacing-0">
                    <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="border-b border-border/80">
                            <TableHead
                                onClick={() => handleSort('id')}
                                className="w-[60px] group cursor-pointer select-none text-center font-bold font-mono text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>#</span>
                                    {renderSortIcon('id')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('username')}
                                className="group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Foydalanuvchi</span>
                                    {renderSortIcon('username')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs">Biriktirilgan Rollar</TableHead>
                            <TableHead
                                onClick={() => handleSort('created_at')}
                                className="group cursor-pointer select-none font-bold text-xs hidden md:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Yaratilgan sana</span>
                                    {renderSortIcon('created_at')}
                                </div>
                            </TableHead>
                            <TableHead className="text-center font-bold text-xs">Holati</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">Amallar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedUsers.map((user, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const isActive = user.is_active !== false;

                            return (
                                <TableRow
                                    key={user.id}
                                    className="group transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[60px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Foydalanuvchi */}
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                    tileFor(user.id)
                                                )}
                                            >
                                                {initialsOf(user.username)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                    {user.username}
                                                </p>
                                                <span className="font-mono text-[11px] text-muted-foreground">
                                                    ID: #{user.id}
                                                </span>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Biriktirilgan Rollar */}
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-1.5 max-w-[320px]">
                                            {(user.roles && user.roles.length > 0) ? (
                                                <ExpandableTags
                                                    items={user.roles.map((r) => ({
                                                        id: r.id,
                                                        name: getRoleName(r.id),
                                                    }))}
                                                    limit={3}
                                                />
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">Rol biriktirilmagan</span>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Yaratilgan sana */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Holati */}
                                    <TableCell className="text-center">
                                        {isActive ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span>Faol</span>
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/15 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                                                <span>Bloklangan</span>
                                            </span>
                                        )}
                                    </TableCell>

                                    {/* Amallar */}
                                    <TableCell className="text-right pr-4">
                                        {renderRowActions(user)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {sortedUsers.map((user) => (
                        <CatalogCard
                            key={user.id}
                            id={user.id}
                            title={user.username}
                            subtitle={
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {(user.roles || []).map((r) => (
                                        <span key={r.id} className="badge badge-primary text-[11px]">
                                            {getRoleName(r.id)}
                                        </span>
                                    ))}
                                </div>
                            }
                            metrics={[
                                { label: 'User ID', value: `#${user.id}` },
                                { label: 'Sana', value: user.created_at ? new Date(user.created_at).toLocaleDateString() : '—' },
                            ]}
                            actions={renderRowActions(user)}
                        />
                    ))}
                </CatalogGrid>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    isLoading={isUsersLoading}
                />
            )}

            {/* User Create / Edit Modal */}
            <UserModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
                roles={roles}
                onSuccess={handleSuccess}
            />

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCascadeWarnings([]);
                    setUserToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Foydalanuvchini o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                Diqqat! Ushbu foydalanuvchini o'chirish quyidagi ma'lumotlarni ham o'chiradi:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-destructive/80">
                                {cascadeWarnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">
                                Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!
                            </p>
                        </div>
                    ) : (
                        `Siz haqiqatan ham '${userToDelete?.username}' foydalanuvchisini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
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
    const isSubmitting =
        createMutation.isPending || updateMutation.isPending || assignRolesMutation.isPending;

    useEffect(() => {
        if (user) {
            reset({
                username: user.username,
                password: '',
                role_ids: user.roles?.map((r) => r.id) || [],
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

            const currentRoleIds = [...(user.roles?.map((r) => r.id) ?? [])].sort();
            const nextRoleIds = [...data.role_ids].sort();
            const rolesChanged =
                currentRoleIds.length !== nextRoleIds.length ||
                currentRoleIds.some((id, index) => id !== nextRoleIds[index]);

            updateMutation.mutate(
                { id: user.id, data: payload },
                {
                    onSuccess: (updatedUser: any) => {
                        if (!rolesChanged) {
                            toast.success('Foydalanuvchi yangilandi');
                            onSuccess(updatedUser);
                            return;
                        }
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
                            }
                        );
                    },
                    onError: (error) => {
                        logger.error('Failed to update user', error);
                        toast.error('Foydalanuvchini yangilashda xatolik yuz berdi');
                    },
                }
            );
        } else {
            if (!data.password) {
                toast.error('Yangi foydalanuvchilar uchun parol talab qilinadi');
                return;
            }

            const payload = {
                username: data.username,
                password: data.password,
                roles: data.role_ids.map((id) => ({
                    name: roles.find((r) => r.id === id)?.name || '',
                })),
            };

            createMutation.mutate(payload, {
                onSuccess: (newUser: any) => {
                    toast.success('Foydalanuvchi yaratildi');
                    onSuccess(newUser);
                },
                onError: (error: any) => {
                    logger.error('Failed to create user', error);
                    toast.error('Foydalanuvchi yaratishda xatolik yuz berdi');
                },
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
                    placeholder="masalan: admin_dekanat"
                />

                <Input
                    label={user ? "Yangi parol (o'zgartirish shart bo'lmasa bo'sh qoldiring)" : 'Parol'}
                    type="password"
                    autoComplete="new-password"
                    {...register('password')}
                    error={errors.password?.message}
                    placeholder={user ? '••••••••' : 'Kamida 6 ta belgi'}
                />

                <div className="space-y-2 relative z-0">
                    <label className="text-sm font-medium">Tizim Rollari</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-2.5 border border-border rounded-xl bg-card">
                        {roles.map((role) => (
                            <div key={role.id} className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id={`role-${role.id}`}
                                    value={role.id}
                                    {...register('role_ids')}
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                <label
                                    htmlFor={`role-${role.id}`}
                                    className="text-xs font-medium cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis select-none"
                                >
                                    {role.name}
                                </label>
                            </div>
                        ))}
                    </div>
                    {errors.role_ids && (
                        <p className="text-xs text-destructive">{errors.role_ids.message}</p>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-border">
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
