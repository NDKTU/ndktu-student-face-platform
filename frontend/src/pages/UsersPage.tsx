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
import { useCatalogView } from '@/hooks/useCatalogView';
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
import { formatDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useUrlState, useUrlNumberState } from '@/hooks/useUrlState';

// Sxema fabrika: zod xabarlari yaratilish paytida hisoblanadi, shuning uchun
// til almashtirilganda yangilanishi uchun ular `t` bilan birga qayta
// quriladi (`useMemo` da).
const buildUserSchema = (t: TFunction) =>
    z.object({
        username: z.string().min(3, t("Foydalanuvchi nomi kamida 3 ta belgidan iborat bo'lishi kerak")),
        password: z.string().optional(),
        role_ids: z.array(z.coerce.number()).min(1, t('Kamida bitta rol tanlanishi shart')),
    });

type UserFormValues = z.infer<ReturnType<typeof buildUserSchema>>;

type SortField = 'id' | 'username' | 'created_at';
type SortOrder = 'asc' | 'desc';

export const UsersPage = () => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    // Filtrlar va sahifa URL'da: yangilashda ham, «Orqaga» bosganda ham
    // saqlanadi va havola qilib yuborsa bo'ladi.
    const [currentPage, setCurrentPage] = useUrlNumberState('page', 1);
    const [selectedRoleFilter, setSelectedRoleFilter] = useUrlState<string>('role', 'all');
    // Ko'rinish almashtirgichi asboblar panelidan olib tashlangan,
    // shuning uchun o'zgartiruvchi yo'q — qiymat boshlang'ich holatda qoladi.
    // Telefonda (md dan past) jadval oʻrniga kartochkalar: hooknig oʻzi
    // ekran kengligiga qarab tanlaydi (hooks/useCatalogView.ts).
    const viewMode = useCatalogView();

    const [sortField, setSortField] = useUrlState<SortField>('sort', 'id');
    const [sortOrder, setSortOrder] = useUrlState<SortOrder>('order', 'desc');

    const [searchTerm, setSearchTerm] = useUrlState<string>('q', '');
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
    } = useUsers(currentPage, pageSize, debouncedSearch, {
        // Rol filtri va saralash serverda: sahifadagi 15 qatorni filtrlash
        // «teacher» uchun bo'sh ro'yxat berar, sahifalash esa baribir o'nlab
        // sahifani ko'rsatib turardi.
        role_id: selectedRoleFilter === 'all' ? undefined : Number(selectedRoleFilter),
        sort_by: sortField,
        order: sortOrder,
    });
    const { data: rolesData } = useRoles();
    const deleteUserMutation = useDeleteUser();

    const users = usersData?.users || [];
    const totalPages = usersData ? Math.ceil(usersData.total / pageSize) : 1;
    const totalCount = usersData?.total ?? users.length;
    const roles = rolesData?.roles || [];

    const getRoleName = (roleId?: number) => {
        if (!roleId) return '-';
        const role = roles.find((r: Role) => r.id === roleId);
        return role ? role.name : `ID: ${roleId}`;
    };

    const roleChipOptions = useMemo(() => {
        const list = roles.map((r) => ({ value: String(r.id), label: r.name }));
        return [{ value: 'all', label: t('Barchasi') }, ...list];
        // `t` ham bog'liqlik: usiz til almashtirilganda memo eski qiymatni
        // ushlab qolardi va chip o'zbekcha bo'lib qolardi.
    }, [roles, t]);

    const handleSort = (field: SortField) => {
        // Tartib o'zgargach birinchi sahifaga qaytamiz: aks holda admin yangi
        // tartibning o'rtasidan ko'rardi.
        setCurrentPage(1);
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
                    toast.success(t("Foydalanuvchi o'chirildi"));
                    setIsDeleteModalOpen(false);
                    setUserToDelete(null);
                    setCascadeWarnings([]);
                    refetchUsers();
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        toast.error(t("O'chirishda xatolik yuz berdi"));
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
                    title={t('Tahrirlash')}
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
                    title={t("O'chirish")}
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
                items={[{ label: t('Foydalanuvchilar'), onClick: () => {} }, { label: t('Tizim foydalanuvchilari') }]}
                title={t('Tizim Foydalanuvchilari')}
                description={t('Tizim hisoblari, administratorlar, xodimlar va biriktirilgan rollar')}
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder={t("Foydalanuvchi nomi bo'yicha qidirish...")}
                totalCount={totalCount}
                totalLabel={t('Foydalanuvchilar')}
                activeFilterCount={(selectedRoleFilter !== 'all' ? 1 : 0) + (searchTerm ? 1 : 0)}
                onClearFilters={() => {
                    setSelectedRoleFilter('all');
                    setSearchTerm('');
                    setCurrentPage(1);
                }}
                chips={
                    roleChipOptions.length > 1 ? (
                        <FilterChipGroup
                            label={t("Rol bo'yicha")}
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
                            <span>{t("Qo'shish")}</span>
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
            ) : users.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title={t('Foydalanuvchilar topilmadi')}
                        description={
                            searchTerm || selectedRoleFilter !== 'all'
                                ? t('Tanlangan filtrlarga mos foydalanuvchi topilmadi.')
                                : t("Hozircha tizimda foydalanuvchi qo'shilmagan.")
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
                                    <span>{t('Foydalanuvchi')}</span>
                                    {renderSortIcon('username')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs">{t('Biriktirilgan Rollar')}</TableHead>
                            <TableHead
                                onClick={() => handleSort('created_at')}
                                className="group cursor-pointer select-none font-bold text-xs hidden md:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>{t('Yaratilgan sana')}</span>
                                    {renderSortIcon('created_at')}
                                </div>
                            </TableHead>
                            <TableHead className="text-center font-bold text-xs">{t('Holati')}</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">{t('Amallar')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user, index) => {
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
                                            {formatDate(user.created_at)}
                                        </span>
                                    </TableCell>

                                    {/* Holati */}
                                    <TableCell className="text-center">
                                        {isActive ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span>{t('Faol')}</span>
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
                    {users.map((user) => (
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
                                { label: t('Sana'), value: formatDate(user.created_at) },
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
                title={t("Foydalanuvchini o'chirish")}
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                {t("Diqqat! Ushbu foydalanuvchini o'chirish quyidagi ma'lumotlarni ham o'chiradi:")}
                            </p>
                            <ul className="list-disc pl-5 text-sm text-destructive/80">
                                {cascadeWarnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">
                                {t("Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!")}
                            </p>
                        </div>
                    ) : (
                        t("Siz haqiqatan ham '{{username}}' foydalanuvchisini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.", { username: userToDelete?.username })
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? t("Ha, majburiy o'chirish") : t("O'chirish")}
                cancelText={t('Bekor qilish')}
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
    const { t } = useTranslation();
    // Sxema `t` ga bog'liq: til almashtirilganda validatsiya xabarlari ham
    // yangi tilda chiqishi kerak.
    const userSchema = useMemo(() => buildUserSchema(t), [t]);
    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
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

    // Rollar `register('role_ids')` bilan emas, aniq `checked`/`onChange` bilan
    // boshqariladi — kodbazadagi qolgan checkbox-guruhlar ham shunday
    // (`RolePermissionsPage`, `TeacherGroupModal`).
    //
    // `register` bu yerda ishlamasdi: DOM'da `value` doim SATR (`"3"`), forma
    // holatida esa rol id'lari SON (`user.roles.map(r => r.id)`). RHF checkbox
    // guruhini belgilashda massivni input'ning satr qiymati bilan solishtiradi,
    // `[3].includes("3")` esa `false` — shuning uchun tahrirlashda hamma
    // katakcha bo'sh chiqardi. Endi ikkala tomonda ham son.
    const selectedRoleIds = watch('role_ids') ?? [];

    const toggleRole = (roleId: number, checked: boolean) => {
        const next = checked
            ? [...selectedRoleIds, roleId]
            : selectedRoleIds.filter((id) => id !== roleId);
        setValue('role_ids', next, { shouldValidate: true, shouldDirty: true });
    };

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
                            toast.success(t('Foydalanuvchi yangilandi'));
                            onSuccess(updatedUser);
                            return;
                        }
                        assignRolesMutation.mutate(
                            { user_id: user.id, role_ids: data.role_ids },
                            {
                                onSuccess: () => {
                                    toast.success(t('Foydalanuvchi va rollari yangilandi'));
                                    onSuccess(updatedUser);
                                },
                                onError: (error) => {
                                    logger.error('Failed to assign roles', error);
                                    toast.error(t("Rollarni o'zgartirishda xatolik yuz berdi"));
                                },
                            }
                        );
                    },
                    onError: (error) => {
                        logger.error('Failed to update user', error);
                        toast.error(t('Foydalanuvchini yangilashda xatolik yuz berdi'));
                    },
                }
            );
        } else {
            if (!data.password) {
                toast.error(t('Yangi foydalanuvchilar uchun parol talab qilinadi'));
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
                    toast.success(t('Foydalanuvchi yaratildi'));
                    onSuccess(newUser);
                },
                onError: (error: any) => {
                    logger.error('Failed to create user', error);
                    toast.error(t('Foydalanuvchi yaratishda xatolik yuz berdi'));
                },
            });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={user ? t('Foydalanuvchini tahrirlash') : t('Foydalanuvchi yaratish')}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                    label={t('Foydalanuvchi nomi')}
                    {...register('username')}
                    error={errors.username?.message}
                    placeholder={t('masalan: admin_dekanat')}
                />

                <Input
                    label={user ? t("Yangi parol (o'zgartirish shart bo'lmasa bo'sh qoldiring)") : t('Parol')}
                    type="password"
                    autoComplete="new-password"
                    {...register('password')}
                    error={errors.password?.message}
                    placeholder={user ? '••••••••' : t('Kamida 6 ta belgi')}
                />

                <div className="space-y-2 relative z-0">
                    <label className="text-sm font-medium">{t('Tizim Rollari')}</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-2.5 border border-border rounded-xl bg-card">
                        {roles.map((role) => (
                            <div key={role.id} className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id={`role-${role.id}`}
                                    checked={selectedRoleIds.includes(role.id)}
                                    onChange={(event) => toggleRole(role.id, event.target.checked)}
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
                        {t('Bekor qilish')}
                    </Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        {user ? t('Yangilash') : t('Yaratish')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default UsersPage;
