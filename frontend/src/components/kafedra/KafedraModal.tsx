import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useCreateKafedra, useUpdateKafedra } from '@/hooks/useReferenceData';
import type { Kafedra } from '@/services/kafedraService';
import type { Faculty } from '@/services/facultyService';

const kafedraSchema = z.object({
    name: z.string().min(1, 'Kafedra nomi kiritilishi shart'),
    faculty_id: z.number().min(1, 'Fakultet tanlanishi shart'),
});

type KafedraFormValues = z.infer<typeof kafedraSchema>;

export const KafedraModal = ({ 
    isOpen, 
    onClose, 
    kafedra, 
    faculties, 
    defaultFacultyId,
    onSuccess 
}: {
    isOpen: boolean; 
    onClose: () => void; 
    kafedra: Kafedra | null; 
    faculties: Faculty[]; 
    defaultFacultyId?: number;
    onSuccess: (kafedra?: Kafedra) => void;
}) => {
    const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<KafedraFormValues>({
        resolver: zodResolver(kafedraSchema),
        defaultValues: { name: '', faculty_id: defaultFacultyId || 0 },
    });

    const createMutation = useCreateKafedra();
    const updateMutation = useUpdateKafedra();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const selectedFacultyId = watch('faculty_id');

    useEffect(() => {
        if (kafedra) {
            reset({ name: kafedra.name, faculty_id: kafedra.faculty_id });
        } else {
            reset({ name: '', faculty_id: defaultFacultyId || 0 });
        }
    }, [kafedra, defaultFacultyId, reset]);

    const onSubmit = (data: KafedraFormValues) => {
        if (kafedra) {
            updateMutation.mutate({ id: kafedra.id, data }, {
                onSuccess: (data) => onSuccess(data),
                onError: () => alert('Kafedrani yangilashda xatolik'),
            });
        } else {
            createMutation.mutate(data, {
                onSuccess: (data) => onSuccess(data),
                onError: () => alert('Kafedra yaratishda xatolik'),
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={kafedra ? 'Kafedrani tahrirlash' : 'Kafedra yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Kafedra nomi" {...register('name')} error={errors.name?.message} placeholder="Kafedra nomini kiriting" />
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Fakultet</label>
                    <select
                        value={selectedFacultyId}
                        onChange={(e) => setValue('faculty_id', Number(e.target.value))}
                        disabled={!!defaultFacultyId && faculties.length === 1}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <option value={0}>Fakultetni tanlang...</option>
                        {faculties.map((faculty) => (
                            <option key={faculty.id} value={faculty.id}>{faculty.name}</option>
                        ))}
                    </select>
                    {errors.faculty_id && (
                        <p className="mt-1 text-xs text-destructive">{errors.faculty_id.message}</p>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>{kafedra ? 'Yangilash' : 'Yaratish'}</Button>
                </div>
            </form>
        </Modal>
    );
};
