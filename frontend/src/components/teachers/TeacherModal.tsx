import { toast } from 'sonner';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { useKafedras } from '@/hooks/useReferenceData';
import { useCreateTeacher, useUpdateTeacher } from '@/hooks/useTeachers';
import { useAuth } from '@/context/AuthContext';
import type { Teacher } from '@/services/teacherService';
import {
    teacherCreateSchema,
    teacherUpdateSchema,
    type TeacherCreateFormValues,
    type TeacherUpdateFormValues,
} from '@/schemas/teacher';

interface TeacherModalProps {
    isOpen: boolean;
    onClose: () => void;
    teacher: Teacher | null;
    onSuccess: () => void;
}

export const TeacherModal = ({ isOpen, onClose, teacher, onSuccess }: TeacherModalProps) => {
    const { hasPermission } = useAuth();
    const { data: kafedrasData } = useKafedras(1, 100, undefined, undefined, hasPermission('read:kafedra'));
    const kafedras = kafedrasData?.kafedras || [];

    const createForm = useForm<TeacherCreateFormValues>({
        resolver: zodResolver(teacherCreateSchema),
        defaultValues: { username: '', password: '', first_name: '', last_name: '', third_name: '', kafedra_id: null },
    });

    const updateForm = useForm<TeacherUpdateFormValues>({
        resolver: zodResolver(teacherUpdateSchema),
        defaultValues: { first_name: '', last_name: '', third_name: '', kafedra_id: null },
    });

    const createMutation = useCreateTeacher();
    const updateMutation = useUpdateTeacher();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const selectedKafedraIdCreate = createForm.watch('kafedra_id');
    const selectedKafedraIdUpdate = updateForm.watch('kafedra_id');

    useEffect(() => {
        if (teacher) {
            updateForm.reset({
                first_name: teacher.first_name,
                last_name: teacher.last_name,
                third_name: teacher.third_name,
                kafedra_id: teacher.kafedra_id,
            });
        } else {
            createForm.reset({ username: '', password: '', first_name: '', last_name: '', third_name: '', kafedra_id: null });
        }
    }, [teacher, isOpen]);

    const onCreateSubmit = (data: TeacherCreateFormValues) => {
        createMutation.mutate(data, {
            onSuccess: () => onSuccess(),
            onError: (err: any) => toast.error(err?.response?.data?.detail || "O'qituvchi yaratishda xatolik"),
        });
    };

    const onUpdateSubmit = (data: TeacherUpdateFormValues) => {
        updateMutation.mutate({ id: teacher!.id, data }, {
            onSuccess: () => onSuccess(),
            onError: () => toast.error("O'qituvchini yangilashda xatolik"),
        });
    };

    if (!teacher) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="O'qituvchi yaratish">
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Login</label>
                            <Input {...createForm.register('username')} placeholder="Login" />
                            {createForm.formState.errors.username && (
                                <p className="mt-1 text-xs text-destructive">{createForm.formState.errors.username.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Parol</label>
                            <Input type="password" {...createForm.register('password')} placeholder="Parol" />
                            {createForm.formState.errors.password && (
                                <p className="mt-1 text-xs text-destructive">{createForm.formState.errors.password.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Familiya</label>
                            <Input {...createForm.register('last_name')} placeholder="Familiya" />
                            {createForm.formState.errors.last_name && (
                                <p className="mt-1 text-xs text-destructive">{createForm.formState.errors.last_name.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Ism</label>
                            <Input {...createForm.register('first_name')} placeholder="Ism" />
                            {createForm.formState.errors.first_name && (
                                <p className="mt-1 text-xs text-destructive">{createForm.formState.errors.first_name.message}</p>
                            )}
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <label className="text-sm font-medium text-foreground">Otasining ismi</label>
                            <Input {...createForm.register('third_name')} placeholder="Otasining ismi" />
                            {createForm.formState.errors.third_name && (
                                <p className="mt-1 text-xs text-destructive">{createForm.formState.errors.third_name.message}</p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Kafedra</label>
                        <Combobox
                            options={kafedras.map(k => ({ value: k.id.toString(), label: k.name }))}
                            value={selectedKafedraIdCreate ? selectedKafedraIdCreate.toString() : ""}
                            onChange={(val) => createForm.setValue('kafedra_id', val ? Number(val) : null)}
                            placeholder="Kafedrani tanlang..."
                            searchPlaceholder="Kafedrani qidirish..."
                        />
                        {createForm.formState.errors.kafedra_id && (
                            <p className="mt-1 text-xs text-destructive">{createForm.formState.errors.kafedra_id.message}</p>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                        <Button type="submit" isLoading={isSubmitting}>Yaratish</Button>
                    </div>
                </form>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="O'qituvchini tahrirlash">
            <form onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Familiya</label>
                        <Input {...updateForm.register('last_name')} placeholder="Familiya" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Ism</label>
                        <Input {...updateForm.register('first_name')} placeholder="Ism" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-medium text-foreground">Otasining ismi</label>
                        <Input {...updateForm.register('third_name')} placeholder="Otasining ismi" />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Kafedra</label>
                    <Combobox
                        options={kafedras.map(k => ({ value: k.id.toString(), label: k.name }))}
                        value={selectedKafedraIdUpdate ? selectedKafedraIdUpdate.toString() : ""}
                        onChange={(val) => updateForm.setValue('kafedra_id', val ? Number(val) : null)}
                        placeholder="Kafedrani tanlang..."
                        searchPlaceholder="Kafedrani qidirish..."
                    />
                    {updateForm.formState.errors.kafedra_id && (
                        <p className="mt-1 text-xs text-destructive">{updateForm.formState.errors.kafedra_id.message}</p>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>Yangilash</Button>
                </div>
            </form>
        </Modal>
    );
};
