import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

const questionSchema = z.object({
    subject_id: z.string().min(1, 'Subject is required'),
    text: z.string().min(1, 'Question text is required'),
    option_a: z.string().min(1, 'Option A is required'),
    option_b: z.string().min(1, 'Option B is required'),
    option_c: z.string().min(1, 'Option C is required'),
    option_d: z.string().min(1, 'Option D is required'),
    correct_option: z.enum(['a', 'b', 'c', 'd']),
});

type QuestionFormValues = z.infer<typeof questionSchema>;

const QuestionFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isEditMode = !!id;
    const questionId = id ? parseInt(id, 10) : 0;

    const { data: subjectsData } = useSubjects(1, 100);
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
        formState: { errors },
    } = useForm<QuestionFormValues>({
        resolver: zodResolver(questionSchema),
        defaultValues: {
            subject_id: '',
            text: '',
            option_a: '',
            option_b: '',
            option_c: '',
            option_d: '',
            correct_option: 'a',
        }
    });

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
            placeholder: 'Start writing...',
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
            console.error('Image upload failed', error);
            alert('Rasm yuklashda xatolik yuz berdi');
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
            alert('User not authenticated');
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
            navigate('/questions');
        };

        const onError = (error: unknown) => {
            console.error('Failed to save question', error);
            alert('Failed to save question');
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
                <Loader2 className="h-8 w-8 animate-spin" />
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

            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigate('/questions')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Subject</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    {...register('subject_id')}
                                >
                                    <option value="">Select Subject</option>
                                    {subjects.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                {errors.subject_id && <p className="text-xs text-destructive">{errors.subject_id.message}</p>}
                            </div>
                        </div>

                        <Controller
                            name="text"
                            control={control}
                            render={({ field }) => renderEditorWithUpload('Question Text', field, errors.text?.message)}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Controller
                                name="option_a"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('Option A', field, errors.option_a?.message, 'a')}
                            />
                            <Controller
                                name="option_b"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('Option B', field, errors.option_b?.message, 'b')}
                            />
                            <Controller
                                name="option_c"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('Option C', field, errors.option_c?.message, 'c')}
                            />
                            <Controller
                                name="option_d"
                                control={control}
                                render={({ field }) => renderEditorWithUpload('Option D', field, errors.option_d?.message, 'd')}
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => navigate('/questions')}>Cancel</Button>
                            <Button type="submit" isLoading={isSubmitting}>
                                {isEditMode ? 'Update Question' : 'Create Question'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default QuestionFormPage;
