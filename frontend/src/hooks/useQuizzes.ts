import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quizService, type QuizCreateRequest, type QuizListParams } from '@/services/quizService';

export const useQuizzes = (params: QuizListParams = {}, enabled = true) => {
    return useQuery({
        queryKey: ['quizzes', params],
        queryFn: () => quizService.getQuizzes(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useQuizCatalog = (enabled = true) => useQuery({
    queryKey: ['quiz-catalog'],
    queryFn: quizService.getCatalog,
    enabled,
});

export const useQuizAnalytics = (id?: number) => useQuery({
    queryKey: ['quiz-analytics', id],
    queryFn: () => quizService.getAnalytics(id!),
    enabled: Boolean(id),
});

export const useActiveQuizzes = (page = 1, limit = 10, title?: string, user_id?: number, group_id?: number, subject_id?: number, sort_dir?: string) => {
    return useQuery({
        queryKey: ['active-quizzes', page, limit, title, user_id, group_id, subject_id, sort_dir],
        queryFn: () => quizService.getActiveQuizzes(page, limit, title, user_id, group_id, subject_id, sort_dir),
        placeholderData: (previousData) => previousData,
    });
};

export const useQuiz = (id: number) => {
    return useQuery({
        queryKey: ['quiz', id],
        queryFn: () => quizService.getQuizById(id),
        enabled: !!id,
    });
};

/**
 * Ma'ruzachining bankida nechta savol borligi. Tashkilotchi testni yig'ishdan oldin
 * shu songa qarab savollar yetarli ekanini biladi — aks holda test auditoriyada
 * yetarli savolsiz ochilardi.
 */
export const useAvailableQuestions = (lecturer_id?: number, subject_id?: number) => {
    return useQuery({
        queryKey: ['available-questions', lecturer_id, subject_id],
        queryFn: () => quizService.getAvailableQuestions(lecturer_id!, subject_id!),
        enabled: !!lecturer_id && !!subject_id,
    });
};

export const useCreateQuiz = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: QuizCreateRequest) => quizService.createQuiz(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
            queryClient.invalidateQueries({ queryKey: ['quiz-catalog'] });
        },
    });
};

export const useUpdateQuiz = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: QuizCreateRequest }) => quizService.updateQuiz(id, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
            queryClient.invalidateQueries({ queryKey: ['quiz-catalog'] });
            queryClient.invalidateQueries({ queryKey: ['quiz', variables.id] });
        },
    });
};

export const useDeleteQuiz = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => quizService.deleteQuiz(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
            queryClient.invalidateQueries({ queryKey: ['quiz-catalog'] });
        },
    });
};

export const useRepeatQuiz = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => quizService.repeatQuiz(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
            queryClient.invalidateQueries({ queryKey: ['quiz-catalog'] });
        },
    });
};
