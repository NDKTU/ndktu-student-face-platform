import { toast } from 'sonner';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { logger } from '@/utils/logger';
import type { QuestionCreateRequest } from '@/services/questionService';
import { questionService } from '@/services/questionService';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ArrowLeft, Loader2, ImagePlus } from 'lucide-react';
import JoditEditor from 'jodit-react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuestion, useCreateQuestion, useUpdateQuestion } from '@/hooks/useQuestions';
import { useSubjects } from '@/hooks/useSubjects';
import { useLesson } from '@/hooks/useLessons';

const questionSchema = z.object({
    subject_id: z.string().min(1, 'Fan tanlanishi shart'),
    text: z.string().min(1, 'Savol matni kiritilishi shart'),
    option_a: z.string().min(1, 'A varianti kiritilishi shart'),
    option_b: z.string().min(1, 'B varianti kiritilishi shart'),
    option_c: z.string().min(1, 'C varianti kiritilishi shart'),
    option_d: z.string().min(1, 'D varianti kiritilishi shart'),
    correct_option: z.enum(['a', 'b', 'c', 'd']),
});

type QuestionFormValues = z.infer<typeof questionSchema>;

const QuestionFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    // Dars sahifasidan kelinganda fan oldindan tanlangan bo'ladi va saqlagach
    // o'sha darsga qaytiladi — o'qituvchi savolni test uchun shu yerda qo'shadi.
    const [searchParams] = useSearchParams();
    const presetSubjectId = searchParams.get('subject_id') ?? '';
    const lessonIdParam = searchParams.get('lesson_id');
    const returnTo = searchParams.get('return_to');
    const { user } = useAuth();
    const isEditMode = !!id;
    const questionId = id ? parseInt(id, 10) : 0;

    const { data: subjectsData } = useSubjects(1, 100);
    // Dars sahifasidan kelinganda fan darsdan olinadi va tanlash so'ralmaydi:
    // dars allaqachon o'qituvchi-fan juftligiga bog'langan.
    const { data: lessonData } = useLesson(lessonIdParam ? Number.parseInt(lessonIdParam, 10) : undefined);
    const lessonSubjectId = lessonData?.teacher_subject?.subject_id;
    const { data: question, isLoading: isQuestionLoading } = useQuestion(questionId);

    const createMutation = useCreateQuestion();
    const updateMutation = useUpdateQuestion();

    const subjects = subjectsData?.subjects || [];
    const isSubmitting = createMutation.isPending || updateMutation.isPending;
    const isLoading = isEditMode && isQuestionLoading;

    // Refs to track which editor is "active" for image insertion
    const activeEditorRef = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        register,
        handleSubmit,
        control,
        reset,
        setValue,
        formState: { errors },
    } = useForm<QuestionFormValues>({
        resolver: zodResolver(questionSchema),
        defaultValues: {
            subject_id: presetSubjectId,
            text: '',
            option_a: '',
            option_b: '',
            option_c: '',
            option_d: '',
            correct_option: 'a',
        }
    });

    useEffect(() => {
        if (lessonSubjectId && !isEditMode) {
            setValue('subject_id', lessonSubjectId.toString());
        }
    }, [lessonSubjectId, isEditMode, setValue]);

    useEffect(() => {
        if (question) {
            reset({
                subject_id: question.subject_id.toString(),
                text: question.text,
                option_a: question.option_a,
                option_b: question.option_b,
                option_c: question.option_c,
                option_d: question.option_d,
                correct_option: (question.correct_option as 'a' | 'b' | 'c' | 'd') || 'a',
            });
        }
    }, [question, reset]);

    const joditConfig = useMemo(() => {
        return {
            readonly: false,
            placeholder: 'Yozishni boshlang...',
            uploader: {
                insertImageAsBase64URI: false,
            },
        } as any;
    }, []);

    const handleImageUpload = async (file: File, editorInstance: any) => {
        try {
            const result = await questionService.uploadImage(file);
            if (result.url && editorInstance) {
                editorInstance.selection.insertHTML(
                    `<img src="${result.url}" alt="uploaded" style="max-width: 100%;" />`
                );
            }
        } catch (error) {
            logger.error('Image upload failed', error);
            // Бэкенд отклоняет файл с понятной причиной (тип, размер, битое содержимое) —
            // без неё преподаватель видит одно и то же сообщение и для сбоя сети, и для
            // слишком большого файла.
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.error(detail || 'Rasm yuklashda xatolik yuz berdi');
        }
    };

    const handleUploadButtonClick = (editorInstance: any) => {
        activeEditorRef.current = editorInstance;
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && activeEditorRef.current) {
            await handleImageUpload(file, activeEditorRef.current);
        }
        // Reset input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const onSubmit = (data: QuestionFormValues) => {
        if (!user) {
            toast.error('Avtorizatsiyadan o\'tilmagan');
            return;
        }

        const payload: QuestionCreateRequest = {
            subject_id: parseInt(data.subject_id, 10),
            user_id: user.id,
            text: data.text,
            option_a: data.option_a,
            option_b: data.option_b,
            option_c: data.option_c,
            option_d: data.option_d,
            correct_option: data.correct_option,
        };

        // Editing creates a new version with a new id (see backend Question
        // versioning) — we always navigate away on success rather than staying
        // on this page, so there's no stale id left referencing the old version.
        const onSuccess = () => {
            toast.success(isEditMode ? 'Savol yangilandi' : 'Savol yaratildi');
            navigate(returnTo || '/questions');
        };

        const onError = (error: unknown) => {
            logger.error('Failed to save question', error);
            toast.error('Savolni saqlashda xatolik');
        }

        if (isEditMode && id) {
            updateMutation.mutate({ id: parseInt(id), data: payload }, { onSuccess, onError });
        } else {
            createMutation.mutate(payload, { onSuccess, onError });
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const renderEditorWithUpload = (
        label: string,
        field: any,
        error?: string,
        optionKey?: 'a' | 'b' | 'c' | 'd'
    ) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium">{label}</label>
                    {optionKey && (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                            <input
                                type="radio"
                                value={optionKey}
                                {...register('correct_option')}
                                className="h-3.5 w-3.5"
                            />
                            To'g'ri javob
                        </label>
                    )}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUploadButtonClick(field.ref)}
                    className="flex items-center gap-1 text-xs"
                >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Rasm yuklash
                </Button>
            </div>
            <JoditEditor
                ref={(ref: any) => { field.ref = ref; }}
                value={field.value}
                config={joditConfig}
                onBlur={(newContent: string) => field.onChange(newContent)}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );

    return (
        <div className="space-y-6 w-full mx-auto pb-10">
            {/* Hidden file input for image upload */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelected}
                className="hidden"
            />

            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/questions')}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Orqaga
                </Button>
                <div>
                    <h1 className="page-title">{isEditMode ? 'Savolni tahrirlash' : 'Yangi savol'}</h1>
                    <p className="page-description mt-0.5">
                        {isEditMode ? 'Savol matni va variantlarini yangilang' : 'Savol matni va variantlarini kiriting'}
                    </p>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Fan</label>
                                {lessonSubjectId ? (
                                    <>
                                        {/* Dars fani — tanlanmaydi, shunchaki ko'rsatiladi. */}
                                        <p className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm">
                                            {subjects.find((s) => s.id === lessonSubjectId)?.name
                                                ?? lessonData?.teacher_subject?.subject?.name
                                                ?? `#${lessonSubjectId}`}
                                        </p>
                                        <input type="hidden" {...register('subject_id')} />
                                        <p className="text-xs text-muted-foreground">
                                            Fan darsdan olindi: «{lessonData?.topic}».
                                        </p>
                                    </>
                                ) : (
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        {...register('subject_id')}
                                    >
                                        <option value="">Fanni tanlang</option>
                                        {subjects.map((s) => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                )}
                                {errors.subject_id && <p className="text-xs text-destructive">{errors.subject_id.message}</p>}
                            </div>
                        </div>

                        <Controller
                            name="text"
                            control={control}
                            render={({ field }) => renderEditorWithUpload('Savol matni', field, errors.text?.message)}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Controller
                                name="option_a"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('A varianti', field, errors.option_a?.message, 'a')}
                            />
                            <Controller
                                name="option_b"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('B varianti', field, errors.option_b?.message, 'b')}
                            />
                            <Controller
                                name="option_c"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('C varianti', field, errors.option_c?.message, 'c')}
                            />
                            <Controller
                                name="option_d"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('D varianti', field, errors.option_d?.message, 'd')}
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => navigate('/questions')}>Bekor qilish</Button>
                            <Button type="submit" isLoading={isSubmitting}>
                                {isEditMode ? 'Savolni yangilash' : 'Savol yaratish'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default QuestionFormPage;
