import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    lessonService,
    type LessonCreateRequest,
    type LessonUpdateRequest,
    type LessonListParams,
    type LessonResultUpsertItem,
} from '@/services/lessonService';

export const useLessons = (params?: LessonListParams) => {
    return useQuery({
        queryKey: ['lessons', params],
        queryFn: () => lessonService.list(params),
        placeholderData: (previousData) => previousData,
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
        },
    });
};

export const useDeleteLesson = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => lessonService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lessons'] });
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
