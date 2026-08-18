import { toast } from 'sonner';
import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useAuth } from '@/context/AuthContext';
import { useCreateCourse, useUpdateCourse } from '@/hooks/useCourses';
import { useSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers } from '@/hooks/useTeachers';
import { useFaculties, useKafedras, useSpecialities } from '@/hooks/useReferenceData';
import type { Course, CourseCreateRequest, CourseUpdateRequest } from '@/services/courseService';
import { logger } from '@/utils/logger';
import { courseSchema, type CourseFormValues } from '@/schemas/course';

interface CourseModalProps {
    isOpen: boolean;
    onClose: () => void;
    course: Course | null;
    onSuccess: () => void;
}

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export const CourseModal = ({ isOpen, onClose, course, onSuccess }: CourseModalProps) => {
    const { hasPermission } = useAuth();

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors },
    } = useForm<CourseFormValues>({
        resolver: zodResolver(courseSchema) as any,
        defaultValues: {
            name: '', description: '', subject_id: '', teacher_id: '',
            semester_number: '', faculty_id: '', kafedra_id: '', speciality_id: '',
            group_ids: [],
        },
    });

    const createMutation = useCreateCourse();
    const updateMutation = useUpdateCourse();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const { data: subjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const { data: teachersData } = useTeachers(1, 1000, undefined, hasPermission('read:teacher'));
    const { data: facultiesData } = useFaculties(1, 100, undefined, hasPermission('read:faculty'));
    const { data: kafedrasData } = useKafedras(1, 100, undefined, undefined, hasPermission('read:kafedra'));
    const { data: specialitiesData } = useSpecialities(1, 100, undefined, undefined, hasPermission('read:speciality'));
    const { data: groupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));

    const subjectOptions = (subjectsData?.subjects || []).map(s => ({ value: s.id.toString(), label: s.name }));
    const teacherOptions = (teachersData?.teachers || []).map(t => ({
        value: (t.employee?.user_id ?? '').toString(),
        label: t.employee?.full_name ?? '',
    }));
    const facultyOptions = (facultiesData?.faculties || []).map(f => ({ value: f.id.toString(), label: f.name }));
    const kafedraOptions = (kafedrasData?.kafedras || []).map(k => ({ value: k.id.toString(), label: k.name }));
    const specialityOptions = (specialitiesData?.specialities || []).map(s => ({ value: s.id.toString(), label: s.name }));
    const groups = groupsData?.groups || [];

    useEffect(() => {
        if (!isOpen) return;
        if (course) {
            reset({
                name: course.name,
                description: course.description || '',
                subject_id: course.subject_id.toString(),
                teacher_id: course.teacher_id.toString(),
                semester_number: course.semester_number ? course.semester_number.toString() : '',
                faculty_id: course.faculty_id ? course.faculty_id.toString() : '',
                kafedra_id: course.kafedra_id ? course.kafedra_id.toString() : '',
                speciality_id: course.speciality_id ? course.speciality_id.toString() : '',
                group_ids: course.groups.map(g => g.id),
            });
        } else {
            reset({
                name: '', description: '', subject_id: '', teacher_id: '',
                semester_number: '', faculty_id: '', kafedra_id: '', speciality_id: '',
                group_ids: [],
            });
        }
    }, [course, reset, isOpen]);

    const onSubmit = (data: CourseFormValues) => {
        const payload: CourseCreateRequest | CourseUpdateRequest = {
            name: data.name,
            description: data.description || undefined,
            subject_id: parseInt(data.subject_id, 10),
            teacher_id: parseInt(data.teacher_id, 10),
            semester_number: data.semester_number ? parseInt(data.semester_number, 10) : undefined,
            faculty_id: data.faculty_id ? parseInt(data.faculty_id, 10) : undefined,
            kafedra_id: data.kafedra_id ? parseInt(data.kafedra_id, 10) : undefined,
            speciality_id: data.speciality_id ? parseInt(data.speciality_id, 10) : undefined,
            group_ids: data.group_ids,
        };

        if (course) {
            updateMutation.mutate({ id: course.id, data: payload }, {
                onSuccess: () => {
                    toast.success('Kurs yangilandi');
                    onSuccess();
                },
                onError: (error: unknown) => {
                    logger.error('Failed to update course', error);
                    toast.error('Kursni yangilashda xatolik yuz berdi');
                },
            });
        } else {
            createMutation.mutate(payload as CourseCreateRequest, {
                onSuccess: () => {
                    toast.success('Kurs yaratildi');
                    onSuccess();
                },
                onError: (error: unknown) => {
                    logger.error('Failed to create course', error);
                    toast.error('Kurs yaratishda xatolik yuz berdi');
                },
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={course ? 'Kursni tahrirlash' : 'Kurs yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Nomi" {...register('name')} error={errors.name?.message} />

                <div>
                    <label className="text-sm font-medium block mb-1">Tavsif (ixtiyoriy)</label>
                    <textarea
                        className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        {...register('description')}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Fan</label>
                    <Controller
                        name="subject_id"
                        control={control}
                        render={({ field }) => (
                            <Combobox
                                options={subjectOptions}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Fanni tanlang"
                                searchPlaceholder="Qidirish..."
                            />
                        )}
                    />
                    {errors.subject_id && <p className="text-sm text-destructive">{errors.subject_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">O'qituvchi</label>
                    <Controller
                        name="teacher_id"
                        control={control}
                        render={({ field }) => (
                            <Combobox
                                options={teacherOptions}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="O'qituvchini tanlang"
                                searchPlaceholder="Qidirish..."
                            />
                        )}
                    />
                    {errors.teacher_id && <p className="text-sm text-destructive">{errors.teacher_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Semestr (ixtiyoriy)</label>
                    <select className={selectClassName} {...register('semester_number')}>
                        <option value="">Tanlanmagan</option>
                        <option value="1">1-semestr</option>
                        <option value="2">2-semestr</option>
                    </select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Fakultet</label>
                        <Controller
                            name="faculty_id"
                            control={control}
                            render={({ field }) => (
                                <Combobox
                                    options={facultyOptions}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Tanlanmagan"
                                    searchPlaceholder="Qidirish..."
                                />
                            )}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Kafedra</label>
                        <Controller
                            name="kafedra_id"
                            control={control}
                            render={({ field }) => (
                                <Combobox
                                    options={kafedraOptions}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Tanlanmagan"
                                    searchPlaceholder="Qidirish..."
                                />
                            )}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Yo'nalish</label>
                        <Controller
                            name="speciality_id"
                            control={control}
                            render={({ field }) => (
                                <Combobox
                                    options={specialityOptions}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Tanlanmagan"
                                    searchPlaceholder="Qidirish..."
                                />
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Guruhlar</label>
                    <Controller
                        name="group_ids"
                        control={control}
                        render={({ field }) => (
                            <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto p-3 border rounded-md bg-muted/20">
                                {groups.map(group => (
                                    <div key={group.id} className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id={`course-group-${group.id}`}
                                            checked={field.value.includes(group.id)}
                                            onChange={() => {
                                                field.onChange(
                                                    field.value.includes(group.id)
                                                        ? field.value.filter((id: number) => id !== group.id)
                                                        : [...field.value, group.id]
                                                );
                                            }}
                                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                                        />
                                        <label htmlFor={`course-group-${group.id}`} className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                            {group.name}
                                        </label>
                                    </div>
                                ))}
                                {groups.length === 0 && <span className="text-sm text-muted-foreground">Guruhlar topilmadi.</span>}
                            </div>
                        )}
                    />
                    <p className="text-xs text-muted-foreground">Saqlashda guruhlar ro'yxati to'liq almashtiriladi.</p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        {course ? 'Yangilash' : 'Yaratish'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
