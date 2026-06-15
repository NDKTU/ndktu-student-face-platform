import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Combobox } from '@/components/ui/Combobox';
import { useAuth } from '@/context/AuthContext';
import { useCreateQuiz, useUpdateQuiz } from '@/hooks/useQuizzes';
import { useSubjects, useTeacherAssignedSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers, useTeacherAssignedGroups } from '@/hooks/useTeachers';
import { useAcademicYears } from '@/hooks/useAcademicYear';
import type { Quiz, QuizCreateRequest } from '@/services/quizService';
import type { Teacher } from '@/services/teacherService';
import { quizSchema, type QuizFormValues } from '@/schemas/quiz';

interface QuizModalProps {
    isOpen: boolean;
    onClose: () => void;
    quiz: Quiz | null;
    teachers: Teacher[];
    onSuccess: () => void;
}

export const QuizModal = ({ isOpen, onClose, quiz, teachers, onSuccess }: QuizModalProps) => {
    const { user, hasPermission } = useAuth();
    const isTeacher = user?.roles?.some(r => r.name.toLowerCase() === 'teacher');

    const [teacherSearch, setTeacherSearch] = useState('');
    const [debouncedTeacherSearch, setDebouncedTeacherSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTeacherSearch(teacherSearch);
        }, 300);
        return () => clearTimeout(timer);
    }, [teacherSearch]);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        control,
        formState: { errors },
    } = useForm<QuizFormValues>({
        resolver: zodResolver(quizSchema),
        defaultValues: { title: '', is_active: false, proctoring_mode: 'standard' },
    });

    const createMutation = useCreateQuiz();
    const updateMutation = useUpdateQuiz();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const isActive = watch('is_active');
    const proctoringMode = watch('proctoring_mode');
    const selectedUserId = watch('user_id');

    const effectiveUserId = isTeacher ? user?.id?.toString() : selectedUserId;

    const { data: allSubjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));
    const { data: searchTeachersData } = useTeachers(1, 100, debouncedTeacherSearch, hasPermission('read:teacher'));
    const { data: assignedSubjectsData } = useTeacherAssignedSubjects(
        effectiveUserId ? parseInt(effectiveUserId) : undefined
    );
    const { data: assignedGroupsData } = useTeacherAssignedGroups(
        effectiveUserId ? parseInt(effectiveUserId) : undefined
    );

    const allSubjects = allSubjectsData?.subjects || [];
    const allGroups = allGroupsData?.groups || [];

    const subjectOptions = (isTeacher && effectiveUserId && assignedSubjectsData)
        ? assignedSubjectsData.subject_teachers.map(st => ({ value: st.subject_id.toString(), label: st.subject.name }))
        : allSubjects.map(s => ({ value: s.id.toString(), label: s.name }));

    const groupOptions = (isTeacher && effectiveUserId && assignedGroupsData)
        ? assignedGroupsData.group_teachers.map(gt => ({ value: gt.group_id.toString(), label: gt.group.name }))
        : allGroups.map(g => ({ value: g.id.toString(), label: g.name }));

    const teacherOptions = (searchTeachersData?.teachers || teachers).map(t => ({
        value: t.user_id.toString(),
        label: t.full_name,
    }));

    const { data: academicYearsData } = useAcademicYears(undefined, isOpen);
    
    const semesterOptions = academicYearsData?.years
        ?.flatMap(year => year.semesters.map(semester => ({
            value: semester.id.toString(),
            label: `${year.name} - ${semester.number}-semestr`,
            isActive: semester.is_active,
        })))
        // Optional: sort active first or label them
        .map(opt => ({
            ...opt,
            label: opt.isActive ? `★ ${opt.label} (Faol)` : opt.label,
        })) || [];

    useEffect(() => {
        if (!isOpen) return;
        if (quiz) {
            reset({
                title: quiz.title,
                question_number: quiz.question_number.toString(),
                duration: quiz.duration.toString(),
                pin: quiz.pin,
                user_id: quiz.user_id ? quiz.user_id.toString() : '',
                group_id: quiz.group_id ? quiz.group_id.toString() : '',
                subject_id: quiz.subject_id ? quiz.subject_id.toString() : '',
                semester_id: quiz.semester_id ? quiz.semester_id.toString() : '',
                is_active: quiz.is_active,
                proctoring_mode: quiz.proctoring_mode ?? 'standard',
            });
        } else {
            // Find semester matching current date, fallback to active semester
            const today = new Date();
            let defaultSemester = semesterOptions.find(opt => {
                const year = academicYearsData?.years.find(y => 
                    y.semesters.some(s => s.id.toString() === opt.value)
                );
                const semester = year?.semesters.find(s => s.id.toString() === opt.value);
                if (semester && semester.start_date && semester.end_date) {
                    const start = new Date(semester.start_date);
                    const end = new Date(semester.end_date);
                    return today >= start && today <= end;
                }
                return false;
            });
            
            if (!defaultSemester) {
                defaultSemester = semesterOptions.find(opt => opt.isActive);
            }

            reset({
                title: '',
                question_number: '10',
                duration: '30',
                pin: Math.random().toString().slice(2, 6),
                user_id: isTeacher && user?.id ? user.id.toString() : '',
                group_id: '',
                subject_id: '',
                semester_id: defaultSemester ? defaultSemester.value : '',
                is_active: false,
                proctoring_mode: 'standard',
            });
        }
    }, [quiz, reset, isOpen, isTeacher, user, academicYearsData]);

    useEffect(() => {
        if (isOpen && !quiz && !isTeacher) {
            setValue('subject_id', '');
            setValue('group_id', '');
        }
    }, [selectedUserId, isOpen, quiz, isTeacher]);

    const onSubmit = (data: QuizFormValues) => {
        const resolvedUserId = isTeacher && user?.id
            ? user.id
            : (data.user_id && data.user_id !== '' ? parseInt(data.user_id, 10) : null);

        const payload: QuizCreateRequest = {
            title: data.title,
            question_number: parseInt(data.question_number, 10),
            duration: parseInt(data.duration, 10),
            pin: data.pin,
            user_id: resolvedUserId,
            group_id: data.group_id && data.group_id !== '' ? parseInt(data.group_id, 10) : null,
            subject_id: data.subject_id && data.subject_id !== '' ? parseInt(data.subject_id, 10) : null,
            semester_id: data.semester_id && data.semester_id !== '' ? parseInt(data.semester_id, 10) : null,
            is_active: data.is_active,
            proctoring_mode: data.proctoring_mode,
        };

        if (quiz) {
            updateMutation.mutate({ id: quiz.id, data: payload }, {
                onSuccess: () => onSuccess(),
                onError: (error: unknown) => {
                    console.error('Failed to update quiz', error);
                    alert('Testni yangilashda xatolik yuz berdi');
                },
            });
        } else {
            createMutation.mutate(payload, {
                onSuccess: () => onSuccess(),
                onError: (error: unknown) => {
                    console.error('Failed to create quiz', error);
                    alert('Testni yaratishda xatolik yuz berdi');
                },
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={quiz ? 'Testni tahrirlash' : 'Test yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Sarlavha" {...register('title')} error={errors.title?.message} />

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Savollar soni" type="number" {...register('question_number')} error={errors.question_number?.message} />
                    <Input label="Davomiyligi (daq)" type="number" {...register('duration')} error={errors.duration?.message} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input label="PIN kod" {...register('pin')} error={errors.pin?.message} />
                    <div className="flex items-center space-x-2 pt-8">
                        <Switch
                            id="modal-is-active"
                            checked={isActive}
                            onCheckedChange={(checked) => setValue('is_active', checked)}
                        />
                        <label htmlFor="modal-is-active" className="text-sm font-medium leading-none cursor-pointer">
                            Faol
                        </label>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Test rejimi</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setValue('proctoring_mode', 'standard')}
                            className={`text-left rounded-lg border px-3 py-2 transition ${
                                proctoringMode === 'standard'
                                    ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                                    : 'border-input hover:border-primary/50'
                            }`}
                        >
                            <div className="text-sm font-medium">Standart</div>
                            <div className="text-xs text-muted-foreground">Kamerasiz oddiy test</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setValue('proctoring_mode', 'face')}
                            className={`text-left rounded-lg border px-3 py-2 transition ${
                                proctoringMode === 'face'
                                    ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                                    : 'border-input hover:border-primary/50'
                            }`}
                        >
                            <div className="text-sm font-medium">Kamera bilan</div>
                            <div className="text-xs text-muted-foreground">Yuz orqali kuzatuv</div>
                        </button>
                    </div>
                    {errors.proctoring_mode && (
                        <p className="text-sm text-red-500">{errors.proctoring_mode.message}</p>
                    )}
                </div>

                {isTeacher ? (
                    <div className="space-y-1">
                        <label className="text-sm font-medium">O'qituvchi</label>
                        <p className="text-sm bg-muted rounded px-3 py-2">
                            {teachers.find(t => t.user_id === user?.id)?.full_name || user?.username || '-'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="text-sm font-medium">O'qituvchi</label>
                        <Controller
                            name="user_id"
                            control={control}
                            render={({ field }) => (
                                <Combobox
                                    options={teacherOptions}
                                    value={field.value}
                                    onChange={(val) => {
                                        field.onChange(val);
                                        setValue('subject_id', '');
                                        setValue('group_id', '');
                                    }}
                                    placeholder="O'qituvchini tanlang"
                                    searchPlaceholder="Qidirish..."
                                    onSearchChange={setTeacherSearch}
                                />
                            )}
                        />
                        {errors.user_id && <p className="text-sm text-red-500">{errors.user_id.message}</p>}
                    </div>
                )}

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
                    {errors.subject_id && <p className="text-sm text-red-500">{errors.subject_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Guruh</label>
                    <Controller
                        name="group_id"
                        control={control}
                        render={({ field }) => (
                            <Combobox
                                options={groupOptions}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Guruhni tanlang"
                                searchPlaceholder="Qidirish..."
                            />
                        )}
                    />
                    {errors.group_id && <p className="text-sm text-red-500">{errors.group_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Semestr</label>
                    <Controller
                        name="semester_id"
                        control={control}
                        render={({ field }) => (
                            <Combobox
                                options={semesterOptions}
                                value={field.value || ''}
                                onChange={field.onChange}
                                placeholder="Semestrni tanlang (Majburiy emas)"
                                searchPlaceholder="Qidirish..."
                            />
                        )}
                    />
                    {errors.semester_id && <p className="text-sm text-red-500">{errors.semester_id.message}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        {quiz ? 'Yangilash' : 'Yaratish'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
