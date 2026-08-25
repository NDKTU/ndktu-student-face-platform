import { toast } from 'sonner';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useCreateSpeciality, useUpdateSpeciality } from '@/hooks/useReferenceData';
import type { Kafedra } from '@/services/kafedraService';
import type { EducationType, Speciality } from '@/services/specialityService';

const specialitySchema = z.object({
    name: z.string().min(1, 'Mutaxassislik nomi kiritilishi shart'),
    kafedra_id: z.number().min(1, 'Kafedra tanlanishi shart'),
    education_type: z.union([z.literal('Bakalavr'), z.literal('Magistr'), z.literal('')]),
});

type SpecialityFormValues = z.infer<typeof specialitySchema>;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    speciality: Speciality | null;
    kafedras: Kafedra[];
    defaultKafedraId?: number;
    onSuccess: (speciality?: Speciality) => void;
}

export const SpecialityModal = ({ isOpen, onClose, speciality, kafedras, defaultKafedraId, onSuccess }: Props) => {
    const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<SpecialityFormValues>({
        resolver: zodResolver(specialitySchema),
        defaultValues: { name: '', kafedra_id: defaultKafedraId || 0, education_type: '' },
    });

    const createMutation = useCreateSpeciality();
    const updateMutation = useUpdateSpeciality();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const selectedKafedraId = watch('kafedra_id');
    const selectedEducationType = watch('education_type');

    useEffect(() => {
        if (speciality) {
            const type = speciality.education_type === 'Bakalavr' || speciality.education_type === 'Magistr'
                ? speciality.education_type
                : '';
            reset({ name: speciality.name, kafedra_id: speciality.kafedra_id, education_type: type });
        } else {
            reset({ name: '', kafedra_id: defaultKafedraId || 0, education_type: '' });
        }
    }, [speciality, defaultKafedraId, reset]);

    // Бэкенд отвечает 400 с понятным текстом (например, дубль имени на кафедре) —
    // показываем его, иначе администратор не поймёт, что именно не так.
    const errorText = (cause: unknown, fallback: string) => {
        const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        return typeof detail === 'string' ? detail : fallback;
    };

    const onSubmit = (values: SpecialityFormValues) => {
        const payload = {
            name: values.name,
            kafedra_id: values.kafedra_id,
            education_type: (values.education_type || null) as EducationType | null,
        };

        if (speciality) {
            updateMutation.mutate({ id: speciality.id, data: payload }, {
                onSuccess: (updated) => {
                    toast.success('Mutaxassislik yangilandi');
                    onSuccess(updated);
                },
                onError: (cause) => toast.error(errorText(cause, 'Mutaxassislikni yangilashda xatolik')),
            });
        } else {
            createMutation.mutate(payload, {
                onSuccess: (created) => {
                    toast.success('Mutaxassislik yaratildi');
                    onSuccess(created);
                },
                onError: (cause) => toast.error(errorText(cause, 'Mutaxassislik yaratishda xatolik')),
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={speciality ? 'Mutaxassislikni tahrirlash' : 'Mutaxassislik yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Mutaxassislik nomi" {...register('name')} error={errors.name?.message} placeholder="Masalan, Kompyuter injiniringi" />

                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Kafedra</label>
                    <select
                        value={selectedKafedraId}
                        onChange={(event) => setValue('kafedra_id', Number(event.target.value))}
                        disabled={Boolean(defaultKafedraId) && kafedras.length === 1}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value={0}>Kafedrani tanlang...</option>
                        {kafedras.map((kafedra) => (
                            <option key={kafedra.id} value={kafedra.id}>{kafedra.name}</option>
                        ))}
                    </select>
                    {errors.kafedra_id && <p className="mt-1 text-xs text-destructive">{errors.kafedra_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Ta'lim turi <span className="font-normal text-muted-foreground">(ixtiyoriy)</span></label>
                    <select
                        value={selectedEducationType}
                        onChange={(event) => setValue('education_type', event.target.value as SpecialityFormValues['education_type'])}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <option value="">Belgilanmagan</option>
                        <option value="Bakalavr">Bakalavr</option>
                        <option value="Magistr">Magistr</option>
                    </select>
                </div>

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>{speciality ? 'Yangilash' : 'Yaratish'}</Button>
                </div>
            </form>
        </Modal>
    );
};
