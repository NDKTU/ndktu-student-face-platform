import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resourceService, type ResourceCreateRequest } from '@/services/resourceService';

export const useResources = (lessonId?: number) => useQuery({
    queryKey: ['resources', 'lesson', lessonId],
    queryFn: () => resourceService.list({ lesson_id: lessonId }),
    enabled: Boolean(lessonId),
});

export const useCreateResource = (lessonId?: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: ResourceCreateRequest) => resourceService.create(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources', 'lesson', lessonId] }),
    });
};

export const useDeleteResource = (lessonId?: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => resourceService.delete(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources', 'lesson', lessonId] }),
    });
};
