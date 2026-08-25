import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resultService, type ResultListParams } from '@/services/resultService';

export const useResults = (params: ResultListParams = {}, enabled = true) => {
    return useQuery({
        queryKey: ['results', params],
        queryFn: () => resultService.getResults(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useUserResults = (userId: number, page = 1, limit = 10, grade?: number, group_id?: number, subject_id?: number, quiz_id?: number) => {
    return useQuery({
        queryKey: ['userResults', userId, page, limit, grade, group_id, subject_id, quiz_id],
        queryFn: () => resultService.getUserResults(userId, { page, limit, grade, group_id, subject_id, quiz_id }),
        enabled: !!userId,
        placeholderData: (previousData) => previousData,
    });
};

export const useResult = (id: number) => {
    return useQuery({
        queryKey: ['result', id],
        queryFn: () => resultService.getResultById(id),
        enabled: !!id,
    });
};

export const useDeleteResult = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => resultService.deleteResult(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['results'] });
            queryClient.invalidateQueries({ queryKey: ['userResults'] });
        },
    });
};
