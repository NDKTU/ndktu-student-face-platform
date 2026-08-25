import { toast } from 'sonner';
import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useAuth } from '@/context/AuthContext';
import { useCreateCourse, useUpdateCourse } from '@/hooks/useCourses';
import { useTeachers, useTeacherAssignedGroups } from '@/hooks/useTeachers';
import { useTeacherAssignedSubjects } from '@/hooks/useSubjects';
import type { Course, CourseCreateRequest, CourseUpdateRequest } from '@/services/courseService';
import { logger } from '@/utils/logger';
import { buildCourseName } from '@/utils/generatedNames';
import { courseSchema, type CourseFormValues } from '@/schemas/course';

interface CourseModalProps {
    isOpen: boolean;
    onClose: () => void;
    course: Course | null;
    onSuccess: () => void;
}

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const emptyForm: CourseFormValues = {
    teacher_id: '',
    subject_id: '',
    semester_number: '',
    group_ids: [],
};

export const CourseModal = ({ isOpen, onClose, course, onSuccess }: CourseModalProps) => {
    const { hasPermission } = useAuth();

    const {
        handleSubmit,
        register,
        reset,
        control,
        setValue,
        watch,
        formState: { errors },
    } = useForm<CourseFormValues>({
        resolver: zodResolver(courseSchema) as any,
        defaultValues: emptyForm,
    });

    const createMutation = useCreateCourse();
    const updateMutation = useUpdateCourse();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const teacherId = watch('teacher_id');
    const subjectId = watch('subject_id');
    const semesterNumber = watch('semester_number');
    const selectedGroupIds = watch('group_ids');

    const { data: teachersData } = useTeachers(1, 1000, undefined, hasPermission('read:teacher'));

    // Fan va guruh ro'yxati tanlangan o'qituvchiga biriktirilganidan yig'iladi:
    // barcha 754 fan va 206 guruhdan tanlash kursni noto'g'ri bog'lashning eng
    // qulay yo'li edi.
    const teacherUserId = teacherId ? parseInt(teacherId, 10) : undefined;
    const { data: assignedSubjectsData, isFetching: isFetchingSubjects } = useTeacherAssignedSubjects(teacherUserId);
    const { data: assignedGroupsData, isFetching: isFetchingGroups } = useTeacherAssignedGroups(teacherUserId);

    const teacherOptions = (teachersData?.teachers || []).map(t => ({
        value: (t.employee?.user_id ?? '').toString(),
        label: t.employee?.full_name ?? '',
    }));

    // Tahrirlashda kursning joriy fani va guruhlari ro'yxatda bo'lmasligi mumkin
    // (eski kurs, biriktiruvi keyin olib tashlangan) — ularni qo'shib qo'yamiz,
    // aks holda saqlashda jimgina yo'qolardi.
    const subjectOptions = useMemo(() => {
        const options = (assignedSubjectsData?.subject_teachers ?? []).map(st => ({
            value: st.subject_id.toString(),
            label: st.subject.name,
        }));
        if (course?.subject && !options.some(o => o.value === course.subject_id.toString())) {
            options.push({ value: course.subject_id.toString(), label: course.subject.name });
        }
        return options;
    }, [assignedSubjectsData, course]);

    const groupOptions = useMemo(() => {
        const options = (assignedGroupsData?.group_teachers ?? []).map(gt => ({
            id: gt.group_id,
            name: gt.group.name,
        }));
        for (const group of course?.groups ?? []) {
            if (!options.some(o => o.id === group.id)) {
                options.push({ id: group.id, name: group.name });
            }
        }
        return options;
    }, [assignedGroupsData, course]);

    const hasTeacher = Boolean(teacherId);
    const noSubjects = hasTeacher && !isFetchingSubjects && subjectOptions.length === 0;
    const noGroups = hasTeacher && !isFetchingGroups && groupOptions.length === 0;

    useEffect(() => {
        if (!isOpen) return;
        if (course) {
            reset({
                teacher_id: course.teacher_id.toString(),
                subject_id: course.subject_id.toString(),
                semester_number: course.semester_number ? course.semester_number.toString() : '',
                group_ids: course.groups.map(g => g.id),
            });
        } else {
            reset(emptyForm);
        }
    }, [course, reset, isOpen]);

    const previewName = useMemo(() => {
        const subjectName = subjectOptions.find(o => o.value === subjectId)?.label;
        const groupNames = groupOptions.filter(g => selectedGroupIds.includes(g.id)).map(g => g.name);
        return buildCourseName(subjectName, groupNames, semesterNumber ? parseInt(semesterNumber, 10) : undefined);
    }, [subjectOptions, subjectId, groupOptions, selectedGroupIds, semesterNumber]);

    const onSubmit = (data: CourseFormValues) => {
        // Nom yuborilmaydi — uni server fan, guruhlar va semestrdan yig'adi.
        const payload: CourseCreateRequest | CourseUpdateRequest = {
            subject_id: parseInt(data.subject_id, 10),
            teacher_id: parseInt(data.teacher_id, 10),
            semester_number: parseInt(data.semester_number, 10),
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
                <div className="space-y-2">
                    <label className="text-sm font-medium">O'qituvchi</label>
                    <Controller
                        name="teacher_id"
                        control={control}
                        render={({ field }) => (
                            <Combobox
                                options={teacherOptions}
                                value={field.value}
                                onChange={(val) => {
                                    field.onChange(val);
                                    setValue('subject_id', '');
                                    setValue('group_ids', []);
                                }}
                                placeholder="O'qituvchini tanlang"
                                searchPlaceholder="Qidirish..."
                            />
                        )}
                    />
                    {errors.teacher_id && <p className="text-sm text-destructive">{errors.teacher_id.message}</p>}
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
                                placeholder={hasTeacher ? 'Fanni tanlang' : "Avval o'qituvchini tanlang"}
                                searchPlaceholder="Qidirish..."
                                disabled={!hasTeacher || noSubjects}
                            />
                        )}
                    />
                    {noSubjects && (
                        <p className="text-sm text-destructive">
                            O'qituvchiga fan biriktirilmagan. "O'qituvchilar" bo'limida fan biriktiring.
                        </p>
                    )}
                    {errors.subject_id && <p className="text-sm text-destructive">{errors.subject_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Semestr</label>
                    <select className={selectClassName} {...register('semester_number')}>
                        <option value="">Tanlanmagan</option>
                        <option value="1">1-semestr</option>
                        <option value="2">2-semestr</option>
                    </select>
                    {errors.semester_number && (
                        <p className="text-sm text-destructive">{errors.semester_number.message}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Guruhlar</label>
                    <Controller
                        name="group_ids"
                        control={control}
                        render={({ field }) => (
                            <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto p-3 border rounded-md bg-muted/20">
                                {groupOptions.map(group => (
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
                                {!hasTeacher && (
                                    <span className="text-sm text-muted-foreground">Avval o'qituvchini tanlang.</span>
                                )}
                                {noGroups && (
                                    <span className="text-sm text-destructive">
                                        O'qituvchiga guruh biriktirilmagan. "O'qituvchilar" bo'limida guruh biriktiring.
                                    </span>
                                )}
                            </div>
                        )}
                    />
                    {errors.group_ids && <p className="text-sm text-destructive">{errors.group_ids.message}</p>}
                    <p className="text-xs text-muted-foreground">Saqlashda guruhlar ro'yxati to'liq almashtiriladi.</p>
                </div>

                <div className="space-y-1 rounded-md border border-dashed bg-muted/20 px-3 py-2">
                    <label className="text-xs font-medium text-muted-foreground">Kurs nomi (avtomatik)</label>
                    <p className="text-sm font-medium">{previewName}</p>
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
