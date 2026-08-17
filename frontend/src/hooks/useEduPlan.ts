import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eduplanService } from '@/services/eduplanService';

export const useEduPlanStatus = () => {
    return useQuery({
        queryKey: ['eduplan', 'status'],
        queryFn: () => eduplanService.getStatus(),
        // Статус дёргает внешний сервис — незачем перепроверять его при
        // каждом возврате на вкладку.
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
};

export const useEduPlanPreview = () => {
    return useMutation({
        mutationFn: () => eduplanService.preview(),
    });
};

export const useEduPlanApply = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: eduplanService.apply,
        onSuccess: () => {
            // Применение переписывает справочники целиком — сбрасываем всё,
            // что их показывает.
            ['faculties', 'kafedras', 'specialities', 'groups', 'subjects', 'employees', 'teachers'].forEach(
                (key) => queryClient.invalidateQueries({ queryKey: [key] }),
            );
        },
    });
};

export const useEduPlanWorkloadSync = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (academicYearId?: number) => eduplanService.syncWorkloads(academicYearId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
        },
    });
};
