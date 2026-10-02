import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { questionService, type ControlType, type QuestionCreateRequest } from '@/services/questionService';

export const useQuestions = (
    page = 1,
    limit = 10,
    text?: string,
    subject_id?: number,
    user_id?: number,
    /** Dars sahifasi aynan shu darsning savollarini soʻraydi. */
    lesson_id?: number,
) => {
    return useQuery({
        queryKey: ['questions', page, limit, text, subject_id, user_id, lesson_id],
        queryFn: () => questionService.getQuestions(page, limit, text, subject_id, user_id, lesson_id),
        placeholderData: (previousData) => previousData,
    });
};

/** Darsga biriktirilgan savollar — kurs ichidagi roʻyxat uchun. */
export const useLessonQuestions = (lessonId?: number) =>
    useQuery({
        queryKey: ['questions', 'lesson', lessonId],
        queryFn: () => questionService.getQuestions(1, 200, undefined, undefined, undefined, lessonId),
        enabled: !!lessonId,
    });

/** Oraliq nazoratga alohida qoʻshilgan savollar (darsdan kelmaganlari). */
export const useMidtermExtraQuestions = (quizId?: number) =>
    useQuery({
        queryKey: ['questions', 'midterm', quizId],
        queryFn: () => questionService.getQuestions(1, 200, undefined, undefined, undefined, undefined, quizId),
        enabled: !!quizId,
    });

/** Kursning «Test savollari» — tanlangan nazorat turi. */
export const useControlQuestions = (courseId: number, controlType: ControlType) =>
    useQuery({
        queryKey: ['questions', 'control', courseId, controlType],
        queryFn: () => questionService.getControlQuestions(courseId, controlType),
    });

/** Nazorat turlari yonidagi savollar soni. */
export const useControlQuestionCounts = (courseId: number) =>
    useQuery({
        queryKey: ['questions', 'control-counts', courseId],
        queryFn: () => questionService.getControlCounts(courseId),
    });

export const useQuestionCatalog = (search?: string) => useQuery({
    queryKey: ['question-catalog', search],
    queryFn: () => questionService.getCatalog(search),
});

export const useQuestion = (id: number) => {
    return useQuery({
        queryKey: ['question', id],
        queryFn: () => questionService.getQuestionById(id),
        enabled: !!id,
    });
};

export const useCreateQuestion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: QuestionCreateRequest) => questionService.createQuestion(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
            queryClient.invalidateQueries({ queryKey: ['question-catalog'] });
            // Darsga yoki oraliq nazoratga qo'shilgan savol testdagi savollar
            // sonini o'zgartiradi.
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
        },
    });
};

export const useUpdateQuestion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: QuestionCreateRequest }) => questionService.updateQuestion(id, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
            queryClient.invalidateQueries({ queryKey: ['question-catalog'] });
            queryClient.invalidateQueries({ queryKey: ['question', variables.id] });
        },
    });
};

export const useDeleteQuestion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => questionService.deleteQuestion(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
            queryClient.invalidateQueries({ queryKey: ['question-catalog'] });
        },
    });
};

export const useUploadQuestions = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            file, subject_id, lesson_id, control,
        }: {
            file: File;
            subject_id: number;
            lesson_id?: number;
            control?: { course_id: number; control_type: ControlType };
        }) => questionService.uploadQuestions(file, subject_id, lesson_id, control),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
            queryClient.invalidateQueries({ queryKey: ['question-catalog'] });
        },
    });
};

export const useUploadImage = () => {
    return useMutation({
        mutationFn: (file: File) => questionService.uploadImage(file),
    });
};

export const useBulkDeleteQuestions = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { subject_id: number; user_id: number }) => questionService.bulkDeleteQuestions(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
            queryClient.invalidateQueries({ queryKey: ['question-catalog'] });
        },
    });
};

export const useDownloadQuestionsExcel = () => {
    return useMutation({
        mutationFn: (params?: { subject_id?: number; user_id?: number; text?: string }) =>
            questionService.downloadQuestionsExcel(params),
    });
};

export const useDownloadQuestionsExcelTemplate = () => {
    return useMutation({
        mutationFn: () => questionService.downloadQuestionsExcelTemplate(),
    });
};
