import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Pencil, Trash2, Search, Users as UsersIcon } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';

import {
    useAssignTutorGroups,
    useCreateTutorWithUser,
    useDeleteTutor,
    useTutors,
    useUpdateTutor,
} from '@/hooks/useTutors';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/context/AuthContext';
import type {
    Tutor,
    TutorFullCreateRequest,
    TutorUpdateRequest,
} from '@/services/tutorService';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';

// ── Schemas ──────────────────────────────────────────────────────────────────

const tutorCreateSchema = z.object({
    username: z.string().min(3, "Login kamida 3 ta belgi bo'lishi kerak"),
    password: z.string().min(4, "Parol kamida 4 ta belgi bo'lishi kerak"),
    first_name: z.string().min(1, 'Ism kiritilishi shart'),
    last_name: z.string().min(1, 'Familiya kiritilishi shart'),
    third_name: z.string().min(1, "Otasining ismi kiritilishi shart"),
    phone_number: z.string().optional(),
});

const tutorUpdateSchema = z.object({
    first_name: z.string().min(1, 'Ism kiritilishi shart'),
    last_name: z.string().min(1, 'Familiya kiritilishi shart'),
    third_name: z.string().min(1, "Otasining ismi kiritilishi shart"),
    phone_number: z.string().optional(),
});

type TutorCreateFormValues = z.infer<typeof tutorCreateSchema>;
type TutorUpdateFormValues = z.infer<typeof tutorUpdateSchema>;

const USER_TABS = [
    { label: 'Tizim foydalanuvchilari', href: '/users' },
    { label: 'Talabalar', href: '/students' },
    { label: "O'qituvchilar", href: '/teachers' },
    { label: 'Tyutorlar', href: '/tutors' },
];

// ── Main page ────────────────────────────────────────────────────────────────

const TutorsPage = () => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTutor, setSelectedTutor] = useState<Tutor | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [tutorToDelete, setTutorToDelete] = useState<Tutor | null>(null);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [tutorToAssign, setTutorToAssign] = useState<Tutor | null>(null);

    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: tutorsData, isLoading } = useTutors(currentPage, pageSize, debouncedSearch);
    const deleteMutation = useDeleteTutor();

    const tutors = tutorsData?.tutors || [];
    const totalPages = tutorsData ? Math.ceil(tutorsData.total / pageSize) : 1;

    const handleEditClick = (tutor: Tutor, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedTutor(tutor);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (tutor: Tutor, e: React.MouseEvent) => {
        e.stopPropagation();
        setTutorToDelete(tutor);
        setIsDeleteModalOpen(true);
    };

    const handleAssignGroupsClick = (tutor: Tutor, e: React.MouseEvent) => {
        e.stopPropagation();
        setTutorToAssign(tutor);
        setIsGroupModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (!tutorToDelete) return;
        deleteMutation.mutate(tutorToDelete.id, {
            onSuccess: () => {
                setIsDeleteModalOpen(false);
                setTutorToDelete(null);
            },
            onError: () => {
                alert("O'chirishda xatolik yuz berdi");
                setIsDeleteModalOpen(false);
                setTutorToDelete(null);
            },
        });
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedTutor(null);
    };

    const handleModalSuccess = () => {
        setIsModalOpen(false);
        setSelectedTutor(null);
    };

    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Tyutorlar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Tyutorlar ro'yxati va ular biriktirilgan guruhlar
                    </p>
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
                    <PermissionGate permission="create:tutor">
                        <Button onClick={() => { setSelectedTutor(null); setIsModalOpen(true); }}>
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
                                    <TableHead>F.I.SH</TableHead>
                                    <TableHead>Foydalanuvchi</TableHead>
                                    <TableHead>Telefon</TableHead>
                                    <TableHead>Guruhlar</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tutors.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                                            Tyutorlar topilmadi
                                        </TableCell>
                                    </TableRow>
                                ) : tutors.map((tutor) => {
                                    const fullName = `${tutor.last_name} ${tutor.first_name} ${tutor.third_name}`;
                                    const groupCount = tutor.tutor_groups?.length ?? 0;
                                    return (
                                        <TableRow key={tutor.id} className="hover:bg-muted/50">
                                            <TableCell className="font-medium capitalize">{fullName}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {tutor.user?.username ?? '—'}
                                            </TableCell>
                                            <TableCell>{tutor.phone_number ?? '—'}</TableCell>
                                            <TableCell>
                                                <span className="text-xs text-muted-foreground">
                                                    {groupCount > 0 ? `${groupCount} ta guruh` : 'biriktirilmagan'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => handleAssignGroupsClick(tutor, e)}
                                                        title="Guruhlarni biriktirish"
                                                    >
                                                        <UsersIcon className="h-4 w-4" />
                                                    </Button>
                                                    <PermissionGate permission="update:tutor">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => handleEditClick(tutor, e)}
                                                            title="Tahrirlash"
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                    </PermissionGate>
                                                    <PermissionGate permission="delete:tutor">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => handleDeleteClick(tutor, e)}
                                                            title="O'chirish"
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </PermissionGate>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
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

            <TutorModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                tutor={selectedTutor}
                onSuccess={handleModalSuccess}
            />

            <TutorGroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                tutor={tutorToAssign}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Tyutorni o'chirish"
                description="Haqiqatan ham bu tyutorni o'chirmoqchimisiz? Bu amal guruh biriktiruvlarini ham o'chiradi."
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />
        </div>
    );
};

// ── Create / Edit modal ──────────────────────────────────────────────────────

const TutorModal = ({
    isOpen,
    onClose,
    tutor,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    tutor: Tutor | null;
    onSuccess: () => void;
}) => {
    const createForm = useForm<TutorCreateFormValues>({
        resolver: zodResolver(tutorCreateSchema),
        defaultValues: {
            username: '', password: '',
            first_name: '', last_name: '', third_name: '',
            phone_number: '',
        },
    });

    const updateForm = useForm<TutorUpdateFormValues>({
        resolver: zodResolver(tutorUpdateSchema),
        defaultValues: {
            first_name: '', last_name: '', third_name: '',
            phone_number: '',
        },
    });

    const createMutation = useCreateTutorWithUser();
    const updateMutation = useUpdateTutor();

    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        if (!isOpen) return;
        if (tutor) {
            updateForm.reset({
                first_name: tutor.first_name,
                last_name: tutor.last_name,
                third_name: tutor.third_name,
                phone_number: tutor.phone_number ?? '',
            });
            setImageUrl(tutor.image_url ?? null);
        } else {
            createForm.reset({
                username: '', password: '',
                first_name: '', last_name: '', third_name: '',
                phone_number: '',
            });
            setImageUrl(null);
        }
    }, [tutor, isOpen]);

    const onCreateSubmit = (data: TutorCreateFormValues) => {
        const payload: TutorFullCreateRequest = {
            username: data.username,
            password: data.password,
            first_name: data.first_name,
            last_name: data.last_name,
            third_name: data.third_name,
            phone_number: data.phone_number || null,
            image_url: imageUrl,
        };
        createMutation.mutate(payload, {
            onSuccess: () => onSuccess(),
            onError: (err: any) => alert(err?.response?.data?.detail || "Tyutor yaratishda xatolik"),
        });
    };

    const onUpdateSubmit = (data: TutorUpdateFormValues) => {
        if (!tutor) return;
        const payload: TutorUpdateRequest = {
            first_name: data.first_name,
            last_name: data.last_name,
            third_name: data.third_name,
            phone_number: data.phone_number || null,
            image_url: imageUrl,
        };
        updateMutation.mutate({ id: tutor.id, data: payload }, {
            onSuccess: () => onSuccess(),
            onError: () => alert("Tyutorni yangilashda xatolik"),
        });
    };

    const ImagePicker = (
        <ImageUploadField
            label="Rasm (ixtiyoriy)"
            value={imageUrl}
            onChange={setImageUrl}
        />
    );

    if (!tutor) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Tyutor yaratish">
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <Input
                        label="Familiya"
                        {...createForm.register('last_name')}
                        error={createForm.formState.errors.last_name?.message}
                        placeholder="Familiyani kiriting"
                    />
                    <Input
                        label="Ism"
                        {...createForm.register('first_name')}
                        error={createForm.formState.errors.first_name?.message}
                        placeholder="Ismni kiriting"
                    />
                    <Input
                        label="Otasining ismi"
                        {...createForm.register('third_name')}
                        error={createForm.formState.errors.third_name?.message}
                        placeholder="Otasining ismini kiriting"
                    />
                    <Input
                        label="Login"
                        {...createForm.register('username')}
                        error={createForm.formState.errors.username?.message}
                        placeholder="Loginni kiriting"
                        autoComplete="off"
                    />
                    <Input
                        label="Parol"
                        type="password"
                        {...createForm.register('password')}
                        error={createForm.formState.errors.password?.message}
                        placeholder="Parolni kiriting"
                        autoComplete="new-password"
                    />
                    <Input
                        label="Telefon raqami (ixtiyoriy)"
                        {...createForm.register('phone_number')}
                        placeholder="+998 ..."
                    />
                    {ImagePicker}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                        <Button type="submit" isLoading={isSubmitting}>Yaratish</Button>
                    </div>
                </form>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Tyutorni tahrirlash">
            <form onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="space-y-4">
                <Input
                    label="Familiya"
                    {...updateForm.register('last_name')}
                    error={updateForm.formState.errors.last_name?.message}
                />
                <Input
                    label="Ism"
                    {...updateForm.register('first_name')}
                    error={updateForm.formState.errors.first_name?.message}
                />
                <Input
                    label="Otasining ismi"
                    {...updateForm.register('third_name')}
                    error={updateForm.formState.errors.third_name?.message}
                />
                <Input
                    label="Telefon raqami (ixtiyoriy)"
                    {...updateForm.register('phone_number')}
                    placeholder="+998 ..."
                />
                {ImagePicker}
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>Yangilash</Button>
                </div>
            </form>
        </Modal>
    );
};

// ── Assign groups modal ─────────────────────────────────────────────────────

const TutorGroupModal = ({
    isOpen,
    onClose,
    tutor,
}: {
    isOpen: boolean;
    onClose: () => void;
    tutor: Tutor | null;
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const { hasPermission } = useAuth();
    const { data: groupsData } = useGroups(
        1,
        100,
        debouncedSearch,
        undefined,
        undefined,
        hasPermission('read:group'),
    );
    const assignMutation = useAssignTutorGroups();
    const groups = groupsData?.groups || [];

    const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

    useEffect(() => {
        if (tutor && isOpen) {
            setSelectedGroupIds(tutor.tutor_groups?.map(tg => tg.group_id) || []);
            setSearchQuery('');
            setDebouncedSearch('');
        }
    }, [tutor, isOpen]);

    const handleToggle = (id: number) => {
        setSelectedGroupIds(prev =>
            prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
        );
    };

    const handleSave = () => {
        if (!tutor) return;
        assignMutation.mutate(
            { tutor_id: tutor.id, group_ids: selectedGroupIds },
            {
                onSuccess: () => onClose(),
                onError: () => alert("Guruhlarni biriktirishda xatolik yuz berdi"),
            }
        );
    };

    const fullName = tutor ? `${tutor.last_name} ${tutor.first_name}` : '';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`${fullName} ga guruhlarni biriktirish`}
        >
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Guruhlarni qidirish..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-4 border rounded-md bg-muted/20">
                    {groups.map(group => (
                        <div key={group.id} className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id={`tutor-group-${group.id}`}
                                checked={selectedGroupIds.includes(group.id)}
                                onChange={() => handleToggle(group.id)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <label
                                htmlFor={`tutor-group-${group.id}`}
                                className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis"
                            >
                                {group.name}
                            </label>
                        </div>
                    ))}
                    {groups.length === 0 && (
                        <span className="text-sm text-muted-foreground">Guruhlar topilmadi.</span>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button onClick={handleSave} isLoading={assignMutation.isPending}>Saqlash</Button>
                </div>
            </div>
        </Modal>
    );
};

export default TutorsPage;
