import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { uploadService } from '@/services/uploadService';
import { useRoles } from '@/hooks/useReferenceData';
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/useEmployees';
import type { Employee } from '@/services/employeeService';
import {
    employeeCreateSchema,
    employeeUpdateSchema,
    type EmployeeCreateFormValues,
    type EmployeeUpdateFormValues,
} from '@/schemas/employee';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onSuccess: () => void;
}

export const EmployeeModal = ({ isOpen, onClose, employee, onSuccess }: EmployeeModalProps) => {
    const { data: rolesData } = useRoles();
    const roles = rolesData?.roles || [];

    const createForm = useForm<EmployeeCreateFormValues>({
        resolver: zodResolver(employeeCreateSchema),
        defaultValues: {
            first_name: '',
            last_name: '',
            third_name: '',
            phone_number: '',
            image_url: null,
            username: '',
            password: '',
            role_ids: [],
        },
    });

    const updateForm = useForm<EmployeeUpdateFormValues>({
        resolver: zodResolver(employeeUpdateSchema),
        defaultValues: { first_name: '', last_name: '', third_name: '', phone_number: '', image_url: null },
    });

    const createMutation = useCreateEmployee();
    const updateMutation = useUpdateEmployee();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        if (employee) {
            updateForm.reset({
                first_name: employee.first_name,
                last_name: employee.last_name,
                third_name: employee.third_name,
                phone_number: employee.phone_number || '',
                image_url: employee.image_url,
            });
        } else {
            createForm.reset({
                first_name: '',
                last_name: '',
                third_name: '',
                phone_number: '',
                image_url: null,
                username: '',
                password: '',
                role_ids: [],
            });
        }
    }, [employee, isOpen]);

    const onCreateSubmit = (data: EmployeeCreateFormValues) => {
        createMutation.mutate(
            {
                first_name: data.first_name,
                last_name: data.last_name,
                third_name: data.third_name,
                phone_number: data.phone_number || undefined,
                image_url: data.image_url || undefined,
                username: data.username,
                password: data.password,
                roles: data.role_ids.map((id) => ({ name: roles.find((r) => r.id === id)?.name || '' })),
            },
            {
                onSuccess: () => onSuccess(),
                onError: (err: any) => alert(err?.response?.data?.detail || 'Xodim yaratishda xatolik'),
            }
        );
    };

    const onUpdateSubmit = (data: EmployeeUpdateFormValues) => {
        updateMutation.mutate(
            { id: employee!.id, data: { ...data, phone_number: data.phone_number || undefined } },
            {
                onSuccess: () => onSuccess(),
                onError: (err: any) => alert(err?.response?.data?.detail || 'Xodimni yangilashda xatolik'),
            }
        );
    };

    if (!employee) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Xodim yaratish">
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <Controller
                        control={createForm.control}
                        name="image_url"
                        render={({ field }) => (
                            <ImageUploadField label="Rasm (ixtiyoriy)" value={field.value} onChange={field.onChange} uploadFn={uploadService.uploadEmployeeImage} />
                        )}
                    />
                    <Input label="Familiya" {...createForm.register('last_name')} error={createForm.formState.errors.last_name?.message} placeholder="Familiyani kiriting" />
                    <Input label="Ism" {...createForm.register('first_name')} error={createForm.formState.errors.first_name?.message} placeholder="Ismni kiriting" />
                    <Input label="Otasining ismi" {...createForm.register('third_name')} error={createForm.formState.errors.third_name?.message} placeholder="Otasining ismini kiriting" />
                    <Input label="Telefon raqami" {...createForm.register('phone_number')} error={createForm.formState.errors.phone_number?.message} placeholder="+998 90 123 45 67" />
                    <Input label="Username" {...createForm.register('username')} error={createForm.formState.errors.username?.message} placeholder="Loginni kiriting" autoComplete="off" />
                    <Input label="Parol" type="password" {...createForm.register('password')} error={createForm.formState.errors.password?.message} placeholder="Parolni kiriting" autoComplete="new-password" />
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Rollar</label>
                        <Controller
                            control={createForm.control}
                            name="role_ids"
                            render={({ field }) => (
                                <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto p-2 border rounded-md">
                                    {roles.map((role) => (
                                        <div key={role.id} className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id={`emp-role-${role.id}`}
                                                checked={field.value.includes(role.id)}
                                                onChange={(e) => {
                                                    field.onChange(
                                                        e.target.checked
                                                            ? [...field.value, role.id]
                                                            : field.value.filter((id) => id !== role.id)
                                                    );
                                                }}
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                            <label htmlFor={`emp-role-${role.id}`} className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                                {role.name}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            )}
                        />
                        {createForm.formState.errors.role_ids && (
                            <p className="text-xs text-destructive">{createForm.formState.errors.role_ids.message}</p>
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
        <Modal isOpen={isOpen} onClose={onClose} title="Xodimni tahrirlash">
            <form onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="space-y-4">
                <Controller
                    control={updateForm.control}
                    name="image_url"
                    render={({ field }) => (
                        <ImageUploadField label="Rasm (ixtiyoriy)" value={field.value} onChange={field.onChange} uploadFn={uploadService.uploadEmployeeImage} />
                    )}
                />
                <Input label="Familiya" {...updateForm.register('last_name')} error={updateForm.formState.errors.last_name?.message} placeholder="Familiyani kiriting" />
                <Input label="Ism" {...updateForm.register('first_name')} error={updateForm.formState.errors.first_name?.message} placeholder="Ismni kiriting" />
                <Input label="Otasining ismi" {...updateForm.register('third_name')} error={updateForm.formState.errors.third_name?.message} placeholder="Otasining ismini kiriting" />
                <Input label="Telefon raqami" {...updateForm.register('phone_number')} error={updateForm.formState.errors.phone_number?.message} placeholder="+998 90 123 45 67" />
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>Yangilash</Button>
                </div>
            </form>
        </Modal>
    );
};
