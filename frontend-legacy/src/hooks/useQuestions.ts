import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { questionService, type QuestionCreateRequest } from '@/services/questionService';

export const useQuestions = (page = 1, limit = 10, text?: string, subject_id?: number, user_id?: number) => {
    return useQuery({
        queryKey: ['questions', page, limit, text, subject_id, user_id],
        queryFn: () => questionService.getQuestions(page, limit, text, subject_id, user_id),
        placeholderData: (previousData) => previousData,
    });
};

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
        },
    });
};

export const useUpdateQuestion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: QuestionCreateRequest }) => questionService.updateQuestion(id, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
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
        },
    });
};

export const useUploadQuestions = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, subject_id }: { file: File; subject_id: number }) => questionService.uploadQuestions(file, subject_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
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
        },
    });
};

export const useDownloadQuestionsExcel = () => {
    return useMutation({
        mutationFn: (params?: { subject_id?: number; user_id?: number; text?: string }) =>
            questionService.downloadQuestionsExcel(params),
    });
};
