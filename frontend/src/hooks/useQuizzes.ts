import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quizService, type QuizCreateRequest } from '@/services/quizService';

export const useQuizzes = (page = 1, limit = 10, title?: string, is_active?: boolean, user_id?: number, group_id?: number, subject_id?: number, sort_dir?: string, enabled = true) => {
    return useQuery({
        queryKey: ['quizzes', page, limit, title, is_active, user_id, group_id, subject_id, sort_dir],
        queryFn: () => quizService.getQuizzes(page, limit, title, is_active, user_id, group_id, subject_id, sort_dir),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

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
        },
    });
};

export const useUpdateQuiz = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: QuizCreateRequest }) => quizService.updateQuiz(id, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
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
        },
    });
};

export const useRepeatQuiz = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => quizService.repeatQuiz(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
        },
    });
};

