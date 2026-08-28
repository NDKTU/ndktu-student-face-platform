import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Combobox } from '@/components/ui/Combobox';
import { useAuth } from '@/context/AuthContext';
import { useRoleView } from '@/hooks/useRoleView';
import { useAvailableQuestions, useCreateQuiz, useUpdateQuiz } from '@/hooks/useQuizzes';
import { useSubjects, useTeacherAssignedSubjects } from '@/hooks/useSubjects';
import { useGroups } from '@/hooks/useGroups';
import { useTeachers, useTeacherAssignedGroups } from '@/hooks/useTeachers';
import type { Quiz, QuizCreateRequest, QuizType } from '@/services/quizService';
import { QUIZ_TYPE_LABELS } from '@/services/quizService';
import type { Teacher } from '@/services/teacherService';
import { logger } from '@/utils/logger';
import { buildQuizTitle } from '@/utils/generatedNames';
import { SEMESTER_OPTIONS } from '@/utils/semester';
import { quizSchema, type QuizFormValues } from '@/schemas/quiz';

interface QuizModalProps {
    isOpen: boolean;
    onClose: () => void;
    quiz: Quiz | null;
    teachers: Teacher[];
    onSuccess: () => void;
}

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Semestr uchun test jadvalida ustun yo'q — u faqat sarlavhada yashaydi.
 * Tahrirlashda uni yo'qotmaslik uchun mavjud sarlavhadan o'qib olamiz.
 */
const SEMESTER_BY_NAME: Record<string, string> = { kuzgi: '1', bahorgi: '2' };

/**
 * Eski sarlavhalarda semestr «(1-semestr)» ko'rinishida, yangilarida
 * «(kuzgi semestr)». Ikkalasi ham tanilishi kerak, aks holda eski testni
 * tahrirlaganda semestr yo'qolardi.
 */
const semesterFromTitle = (title?: string) => {
    const named = title?.match(/\((kuzgi|bahorgi) semestr\)/i)?.[1];
    if (named) return SEMESTER_BY_NAME[named.toLowerCase()] ?? '';
    return title?.match(/\((\d)-semestr\)/)?.[1] ?? '';
};

export const QuizModal = ({ isOpen, onClose, quiz, teachers, onSuccess }: QuizModalProps) => {
    const { user, hasPermission } = useAuth();
    const { isTeacher } = useRoleView();

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
        defaultValues: { is_active: false, proctoring_mode: 'standard', quiz_type: 'LESSON_QUIZ' },
    });

    const createMutation = useCreateQuiz();
    const updateMutation = useUpdateQuiz();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const isActive = watch('is_active');
    const proctoringMode = watch('proctoring_mode');
    const selectedLecturerId = watch('lecturer_id');
    const selectedSubjectId = watch('subject_id');
    const selectedGroupId = watch('group_id');
    const selectedSemester = watch('semester_number');
    const questionNumber = watch('question_number');

    const effectiveUserId = isTeacher ? user?.id?.toString() : selectedLecturerId;

    const { data: allSubjectsData } = useSubjects(1, 1000, '', undefined, hasPermission('read:subject'));
    const { data: allGroupsData } = useGroups(1, 1000, '', undefined, undefined, hasPermission('read:group'));
    const { data: searchTeachersData } = useTeachers(1, 100, debouncedTeacherSearch, hasPermission('read:teacher'));
    const { data: assignedSubjectsData, isFetching: isFetchingSubjects } = useTeacherAssignedSubjects(
        effectiveUserId ? parseInt(effectiveUserId) : undefined
    );
    const { data: assignedGroupsData, isFetching: isFetchingGroups } = useTeacherAssignedGroups(
        effectiveUserId ? parseInt(effectiveUserId) : undefined
    );

    // Fan va guruh ro'yxati doim tanlangan ma'ruzachiga biriktirilganidan yig'iladi
    // — tashkilotchi ham barcha fanlar orasidan emas, shu ro'yxatdan tanlaydi.
    // Tahrirlashda testning joriy fani/guruhi ro'yxatda bo'lmasa, qo'shib qo'yiladi.
    const subjectOptions = useMemo(() => {
        const options = (assignedSubjectsData?.subject_teachers ?? []).map(st => ({
            value: st.subject_id.toString(),
            label: st.subject.name,
        }));
        if (quiz?.subject_id && !options.some(o => o.value === quiz.subject_id!.toString())) {
            const name = (allSubjectsData?.subjects ?? []).find(s => s.id === quiz.subject_id)?.name;
            if (name) options.push({ value: quiz.subject_id.toString(), label: name });
        }
        return options;
    }, [assignedSubjectsData, quiz, allSubjectsData]);

    const groupOptions = useMemo(() => {
        const options = (assignedGroupsData?.group_teachers ?? []).map(gt => ({
            value: gt.group_id.toString(),
            label: gt.group.name,
        }));
        if (quiz?.group_id && !options.some(o => o.value === quiz.group_id!.toString())) {
            const name = (allGroupsData?.groups ?? []).find(g => g.id === quiz.group_id)?.name;
            if (name) options.push({ value: quiz.group_id.toString(), label: name });
        }
        return options;
    }, [assignedGroupsData, quiz, allGroupsData]);

    const teacherOptions = (searchTeachersData?.teachers || teachers).map(t => ({
        value: (t.user_id ?? '').toString(),
        label: t.full_name ?? '',
    }));

    const hasLecturer = Boolean(effectiveUserId);
    const noSubjects = hasLecturer && !isFetchingSubjects && subjectOptions.length === 0;
    const noGroups = hasLecturer && !isFetchingGroups && groupOptions.length === 0;

    useEffect(() => {
        if (!isOpen) return;
        if (quiz) {
            reset({
                question_number: quiz.question_number.toString(),
                duration: quiz.duration.toString(),
                pin: quiz.pin,
                lecturer_id: quiz.lecturer_id ? quiz.lecturer_id.toString() : '',
                group_id: quiz.group_id ? quiz.group_id.toString() : '',
                subject_id: quiz.subject_id ? quiz.subject_id.toString() : '',
                semester_number: semesterFromTitle(quiz.title),
                quiz_type: quiz.quiz_type ?? 'LESSON_QUIZ',
                is_active: quiz.is_active,
                proctoring_mode: quiz.proctoring_mode ?? 'standard',
            });
        } else {
            reset({
                question_number: '10',
                duration: '30',
                pin: Math.random().toString().slice(2, 6),
                lecturer_id: isTeacher && user?.id ? user.id.toString() : '',
                group_id: '',
                subject_id: '',
                semester_number: '',
                quiz_type: 'LESSON_QUIZ',
                is_active: false,
                proctoring_mode: 'standard',
            });
        }
    }, [quiz, reset, isOpen, isTeacher, user]);

    useEffect(() => {
        if (isOpen && !quiz && !isTeacher) {
            setValue('subject_id', '');
            setValue('group_id', '');
        }
    }, [selectedLecturerId, isOpen, quiz, isTeacher]);

    // Сколько вопросов в банке выбранного лектора по выбранному предмету. Без этого
    // организатор не знает, загрузил ли лектор вопросы, и узнал бы об этом только
    // в аудитории — активный тест требует не меньше вопросов, чем question_number.
    const { data: availableData } = useAvailableQuestions(
        effectiveUserId ? parseInt(effectiveUserId, 10) : undefined,
        selectedSubjectId ? parseInt(selectedSubjectId, 10) : undefined,
    );
    const available = availableData?.available;
    const requested = parseInt(questionNumber ?? '', 10);
    const notEnough = available !== undefined && !isNaN(requested) && requested > available;

    // Sarlavhani server yig'adi; bu yerda faqat qanday chiqishini ko'rsatamiz.
    // Tahrirlashda sana test yaratilgan kun bo'lib qoladi — serverdagi kabi.
    const previewTitle = useMemo(() => buildQuizTitle(
        subjectOptions.find(o => o.value === selectedSubjectId)?.label,
        groupOptions.find(o => o.value === selectedGroupId)?.label,
        selectedSemester ? parseInt(selectedSemester, 10) : undefined,
        quiz ? new Date(quiz.created_at) : new Date(),
    ), [subjectOptions, selectedSubjectId, groupOptions, selectedGroupId, selectedSemester, quiz]);

    /**
     * 409 от бэкенда несёт осмысленное сообщение (не хватает вопросов, смена
     * лектора запрещена) — показываем его, а не общее «произошла ошибка».
     */
    const showError = (error: unknown, fallback: string) => {
        const detail = (error as { response?: { status?: number; data?: { detail?: { message?: string } } } })
            ?.response;
        if (detail?.status === 409 && detail.data?.detail?.message) {
            toast.error(detail.data.detail.message);
            return;
        }
        toast.error(fallback);
    };

    const onSubmit = (data: QuizFormValues) => {
        const resolvedLecturerId = isTeacher && user?.id
            ? user.id
            : parseInt(data.lecturer_id, 10);

        // Sarlavha yuborilmaydi — uni server fan, guruh, sana va semestrdan yig'adi.
        const payload: QuizCreateRequest = {
            question_number: parseInt(data.question_number, 10),
            duration: parseInt(data.duration, 10),
            pin: data.pin,
            lecturer_id: resolvedLecturerId,
            group_id: parseInt(data.group_id, 10),
            subject_id: parseInt(data.subject_id, 10),
            semester_number: parseInt(data.semester_number, 10),
            quiz_type: data.quiz_type,
            is_active: data.is_active,
            proctoring_mode: data.proctoring_mode,
        };

        if (quiz) {
            updateMutation.mutate({ id: quiz.id, data: payload }, {
                onSuccess: () => {
                    toast.success('Test yangilandi');
                    onSuccess();
                },
                onError: (error: unknown) => {
                    logger.error('Failed to update quiz', error);
                    showError(error, 'Testni yangilashda xatolik yuz berdi');
                },
            });
        } else {
            createMutation.mutate(payload, {
                onSuccess: () => {
                    toast.success('Test yaratildi');
                    onSuccess();
                },
                onError: (error: unknown) => {
                    logger.error('Failed to create quiz', error);
                    showError(error, 'Testni yaratishda xatolik yuz berdi');
                },
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={quiz ? 'Testni tahrirlash' : 'Test yaratish'}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {isTeacher ? (
                    <div className="space-y-1">
                        <label className="text-sm font-medium">Ma'ruzachi</label>
                        <p className="text-sm bg-muted rounded px-3 py-2">
                            {teachers.find(t => t.user_id === user?.id)?.full_name || user?.username || '-'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Ma'ruzachi</label>
                        <Controller
                            name="lecturer_id"
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
                                    placeholder="Ma'ruzachini tanlang"
                                    searchPlaceholder="Qidirish..."
                                    onSearchChange={setTeacherSearch}
                                    disabled={!!quiz}
                                />
                            )}
                        />
                        <p className="text-xs text-muted-foreground">
                            {quiz
                                ? "Test yaratilgandan keyin ma'ruzachini o'zgartirish mumkin emas: savollar uning bankidan yig'ilgan."
                                : "Savollar tanlangan ma'ruzachining bankidan yig'iladi."}
                        </p>
                        {errors.lecturer_id && <p className="text-sm text-destructive">{errors.lecturer_id.message}</p>}
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
                                placeholder={hasLecturer ? 'Fanni tanlang' : "Avval ma'ruzachini tanlang"}
                                searchPlaceholder="Qidirish..."
                                disabled={!hasLecturer || noSubjects}
                            />
                        )}
                    />
                    {noSubjects && (
                        <p className="text-sm text-destructive">
                            O'qituvchiga fan biriktirilmagan. "O'qituvchilar" bo'limida fan biriktiring.
                        </p>
                    )}
                    {errors.subject_id && <p className="text-sm text-destructive">{errors.subject_id.message}</p>}
                    {available !== undefined && (
                        <p className={`text-xs ${notEnough ? 'text-destructive' : 'text-muted-foreground'}`}>
                            Bankda mavjud savollar: {available}
                            {notEnough && ` — so'ralgan ${requested} tadan kam, faol test yaratilmaydi`}
                        </p>
                    )}
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
                                placeholder={hasLecturer ? 'Guruhni tanlang' : "Avval ma'ruzachini tanlang"}
                                searchPlaceholder="Qidirish..."
                                disabled={!hasLecturer || noGroups}
                            />
                        )}
                    />
                    {noGroups && (
                        <p className="text-sm text-destructive">
                            O'qituvchiga guruh biriktirilmagan. "O'qituvchilar" bo'limida guruh biriktiring.
                        </p>
                    )}
                    {errors.group_id && <p className="text-sm text-destructive">{errors.group_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Nazorat turi</label>
                    <select className={selectClassName} {...register('quiz_type')}>
                        {(Object.keys(QUIZ_TYPE_LABELS) as QuizType[]).map((value) => (
                            <option key={value} value={value}>{QUIZ_TYPE_LABELS[value]}</option>
                        ))}
                    </select>
                    {errors.quiz_type && <p className="text-sm text-destructive">{errors.quiz_type.message}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Semestr</label>
                    <select className={selectClassName} {...register('semester_number')}>
                        <option value="">Tanlanmagan</option>
                        {SEMESTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    {errors.semester_number && (
                        <p className="text-sm text-destructive">{errors.semester_number.message}</p>
                    )}
                </div>

                <div className="space-y-1 rounded-md border border-dashed bg-muted/20 px-3 py-2">
                    <label className="text-xs font-medium text-muted-foreground">Test sarlavhasi (avtomatik)</label>
                    <p className="text-sm font-medium">{previewTitle}</p>
                </div>

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
                        <p className="text-sm text-destructive">{errors.proctoring_mode.message}</p>
                    )}
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
