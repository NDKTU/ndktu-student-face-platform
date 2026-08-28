import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    lessonService,
    type LessonCreateRequest,
    type LessonUpdateRequest,
    type LessonListParams,
    type LessonResultUpsertItem,
} from '@/services/lessonService';

export const useLessons = (params?: LessonListParams, enabled = true) => {
    return useQuery({
        queryKey: ['lessons', params],
        queryFn: () => lessonService.list(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useLesson = (id: number | undefined) => {
    return useQuery({
        queryKey: ['lesson', id],
        queryFn: () => lessonService.getById(id!),
        enabled: !!id,
    });
};

export const useCreateLesson = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: LessonCreateRequest) => lessonService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lessons'] });
            queryClient.invalidateQueries({ queryKey: ['course-topics'] });
            queryClient.invalidateQueries({ queryKey: ['courses'] });
        },
    });
};

export const useUpdateLesson = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: LessonUpdateRequest }) =>
            lessonService.update(id, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['lessons'] });
            queryClient.invalidateQueries({ queryKey: ['lesson', data.id] });
            queryClient.invalidateQueries({ queryKey: ['course-topics'] });
        },
    });
};

export const useDeleteLesson = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => lessonService.delete(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lessons'] });
            queryClient.invalidateQueries({ queryKey: ['course-topics'] });
            queryClient.invalidateQueries({ queryKey: ['courses'] });
            // Vazifalar dars bilan birga o'chadi — ro'yxat eskirmasin.
            queryClient.invalidateQueries({ queryKey: ['assignments'] });
        },
    });
};

export const useLessonResults = (lessonId: number | undefined) => {
    return useQuery({
        queryKey: ['lesson-results', lessonId],
        queryFn: () => lessonService.listResults(lessonId!),
        enabled: !!lessonId,
    });
};

export const useUpsertLessonResults = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ lessonId, items }: { lessonId: number; items: LessonResultUpsertItem[] }) =>
            lessonService.upsertResults(lessonId, items),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['lesson-results', variables.lessonId] });
        },
    });
};
