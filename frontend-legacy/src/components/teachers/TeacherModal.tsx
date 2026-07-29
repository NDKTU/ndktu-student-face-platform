import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useKafedras } from '@/hooks/useReferenceData';
import { useEmployees } from '@/hooks/useEmployees';
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
    const { data: employeesData } = useEmployees(1, 100);
    const kafedras = kafedrasData?.kafedras || [];
    const employees = employeesData?.employees || [];

    const createForm = useForm<TeacherCreateFormValues>({
        resolver: zodResolver(teacherCreateSchema),
        defaultValues: { employee_id: 0, kafedra_id: 0 },
    });

    const updateForm = useForm<TeacherUpdateFormValues>({
        resolver: zodResolver(teacherUpdateSchema),
        defaultValues: { kafedra_id: 0 },
    });

    const createMutation = useCreateTeacher();
    const updateMutation = useUpdateTeacher();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const selectedEmployeeIdCreate = createForm.watch('employee_id');
    const selectedKafedraIdCreate = createForm.watch('kafedra_id');
    const selectedKafedraIdUpdate = updateForm.watch('kafedra_id');

    useEffect(() => {
        if (teacher) {
            updateForm.reset({ kafedra_id: teacher.kafedra_id });
        } else {
            createForm.reset({ employee_id: 0, kafedra_id: 0 });
        }
    }, [teacher, isOpen]);

    const onCreateSubmit = (data: TeacherCreateFormValues) => {
        createMutation.mutate(data, {
            onSuccess: () => onSuccess(),
            onError: (err: any) => alert(err?.response?.data?.detail || "O'qituvchi yaratishda xatolik"),
        });
    };

    const onUpdateSubmit = (data: TeacherUpdateFormValues) => {
        updateMutation.mutate({ id: teacher!.id, data }, {
            onSuccess: () => onSuccess(),
            onError: () => alert("O'qituvchini yangilashda xatolik"),
        });
    };

    if (!teacher) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="O'qituvchi yaratish">
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Xodim</label>
                        <Combobox
                            options={employees.map(e => ({ value: e.id.toString(), label: e.full_name }))}
                            value={selectedEmployeeIdCreate ? selectedEmployeeIdCreate.toString() : ""}
                            onChange={(val) => createForm.setValue('employee_id', val ? Number(val) : 0)}
                            placeholder="Xodimni tanlang..."
                            searchPlaceholder="Xodimni qidirish..."
                        />
                        {createForm.formState.errors.employee_id && (
                            <p className="mt-1 text-xs text-destructive">{createForm.formState.errors.employee_id.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Kerakli xodim topilmadimi?{' '}
                            <Link to="/employees" className="underline">
                                Avval xodim yarating
                            </Link>
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Kafedra</label>
                        <Combobox
                            options={kafedras.map(k => ({ value: k.id.toString(), label: k.name }))}
                            value={selectedKafedraIdCreate ? selectedKafedraIdCreate.toString() : ""}
                            onChange={(val) => createForm.setValue('kafedra_id', val ? Number(val) : 0)}
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
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Kafedra</label>
                    <Combobox
                        options={kafedras.map(k => ({ value: k.id.toString(), label: k.name }))}
                        value={selectedKafedraIdUpdate ? selectedKafedraIdUpdate.toString() : ""}
                        onChange={(val) => updateForm.setValue('kafedra_id', val ? Number(val) : 0)}
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
