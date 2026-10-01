import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
    independentTopicService,
    type IndependentTopicRequest,
} from '@/services/independentTopicService';

const keyFor = (courseId?: number) => ['independent-topics', courseId];

export const useIndependentTopics = (courseId?: number, enabled: boolean = true) =>
    useQuery({
        queryKey: keyFor(courseId),
        queryFn: () => independentTopicService.list(courseId!),
        enabled: !!courseId && enabled,
    });

export const useCreateIndependentTopic = (courseId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: IndependentTopicRequest) => independentTopicService.create(courseId, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: keyFor(courseId) }),
    });
};

export const useUpdateIndependentTopic = (courseId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: IndependentTopicRequest }) =>
            independentTopicService.update(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: keyFor(courseId) }),
    });
};

export const useDeleteIndependentTopic = (courseId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => independentTopicService.remove(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: keyFor(courseId) }),
    });
};
