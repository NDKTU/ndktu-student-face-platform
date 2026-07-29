import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { facultyService, type Faculty } from '@/services/facultyService';
import { facultySchema, type FacultyFormValues } from '@/schemas/faculty';
import { logger } from '@/utils/logger';

interface FacultyModalProps {
    isOpen: boolean;
    onClose: () => void;
    faculty: Faculty | null;
    onSuccess: (faculty?: Faculty) => void;
}

export const FacultyModal = ({ isOpen, onClose, faculty, onSuccess }: FacultyModalProps) => {
    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FacultyFormValues>({
        resolver: zodResolver(facultySchema),
        defaultValues: { name: '' },
    });

    useEffect(() => {
        reset({ name: faculty?.name || '' });
    }, [faculty, reset]);

    const onSubmit = async (data: FacultyFormValues) => {
        try {
            const result = faculty
                ? await facultyService.updateFaculty(faculty.id, data)
                : await facultyService.createFaculty(data);
            onSuccess(result);
        } catch (error) {
            logger.error('Fakultetni saqlashda xatolik', error);
            alert('Fakultetni saqlashda xatolik');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={faculty ? 'Fakultetni tahrirlash' : 'Fakultet yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Fakultet nomi</label>
                    <Input {...register('name')} error={errors.name?.message} placeholder="Fakultet nomini kiriting" />
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>{faculty ? 'Yangilash' : 'Yaratish'}</Button>
                </div>
            </form>
        </Modal>
    );
};
