import { useEffect } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useCreateGroup, useUpdateGroup } from '@/hooks/useGroups';
import type { Group } from '@/services/groupService';
import type { Faculty } from '@/services/facultyService';
import type { Speciality } from '@/services/specialityService';

const groupSchema = z.object({
    name: z.string().min(1, 'Guruh nomi kiritilishi shart'),
    faculty_id: z.number().min(1, 'Fakultet tanlanishi shart'),
    speciality_id: z.number().optional().nullable(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

interface GroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: Group | null;
    faculties?: Faculty[];
    defaultFacultyId?: number;
    specialities?: Speciality[];
    defaultSpecialityId?: number;
    onSuccess: (group?: Group) => void;
}

export const GroupModal: React.FC<GroupModalProps> = ({
    isOpen,
    onClose,
    group,
    faculties = [],
    defaultFacultyId,
    specialities = [],
    defaultSpecialityId,
    onSuccess,
}) => {
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
        setValue,
        watch,
    } = useForm<GroupFormValues>({
        resolver: zodResolver(groupSchema),
        defaultValues: {
            name: '',
            faculty_id: defaultFacultyId || 0,
            speciality_id: defaultSpecialityId || undefined,
        },
    });

    const createMutation = useCreateGroup();
    const updateMutation = useUpdateGroup();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const selectedFacultyId = watch('faculty_id');
    const selectedSpecialityId = watch('speciality_id');

    useEffect(() => {
        if (group) {
            reset({
                name: group.name,
                faculty_id: group.faculty_id,
                speciality_id: group.speciality_id || undefined,
            });
        } else {
            reset({
                name: '',
                faculty_id: defaultFacultyId || 0,
                speciality_id: defaultSpecialityId || undefined,
            });
        }
    }, [group, defaultFacultyId, defaultSpecialityId, reset]);

    const onSubmit = (data: GroupFormValues) => {
        const payload: any = {
            name: data.name,
            faculty_id: data.faculty_id,
        };
        if (data.speciality_id) {
            payload.speciality_id = data.speciality_id;
        }

        if (group) {
            updateMutation.mutate(
                { id: group.id, data: payload },
                {
                    onSuccess: (updated) => {
                        toast.success('Guruh yangilandi');
                        onSuccess(updated);
                    },
                    onError: () => toast.error('Guruhni yangilashda xatolik'),
                }
            );
        } else {
            createMutation.mutate(payload, {
                onSuccess: (created) => {
                    toast.success('Guruh yaratildi');
                    onSuccess(created);
                },
                onError: () => toast.error('Guruh yaratishda xatolik'),
            });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={group ? 'Guruhni tahrirlash' : 'Guruh yaratish'}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                    label="Guruh nomi"
                    {...register('name')}
                    error={errors.name?.message}
                    placeholder="Masalan: 129a-23 NRM"
                />

                {faculties.length > 0 && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Fakultet</label>
                        <select
                            value={selectedFacultyId}
                            onChange={(e) => setValue('faculty_id', Number(e.target.value))}
                            disabled={Boolean(defaultFacultyId) && faculties.length === 1}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value={0}>Fakultetni tanlang...</option>
                            {faculties.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                        {errors.faculty_id && (
                            <p className="mt-1 text-xs text-destructive">{errors.faculty_id.message}</p>
                        )}
                    </div>
                )}

                {specialities.length > 0 && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Mutaxassislik <span className="text-xs text-muted-foreground">(ixtiyoriy)</span>
                        </label>
                        <select
                            value={selectedSpecialityId || 0}
                            onChange={(e) => setValue('speciality_id', Number(e.target.value) || undefined)}
                            disabled={Boolean(defaultSpecialityId) && specialities.length === 1}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value={0}>Mutaxassislikni tanlang...</option>
                            {specialities.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        {group ? 'Yangilash' : 'Yaratish'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
