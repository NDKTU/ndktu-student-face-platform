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

/** Справочники, которые переписывает синхронизация: их кэш надо сбросить. */
const MIRRORED_QUERY_KEYS = [
    'faculties',
    'kafedras',
    'specialities',
    'groups',
    'subjects',
    'employees',
    'teachers',
];

export const useEduPlanApply = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: eduplanService.apply,
        onSuccess: () => {
            // Применение переписывает справочники целиком — сбрасываем всё,
            // что их показывает.
            MIRRORED_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
        },
    });
};

/** Полный прогон одной кнопкой: справочники и нагрузка сразу. */
export const useEduPlanRun = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => eduplanService.run(),
        onSuccess: () => {
            MIRRORED_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
            queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
        },
    });
};

// Отдельного импорта нагрузки в интерфейсе больше нет: она переносится тем же
// прогоном, что и справочники (см. useEduPlanRun). Эндпоинт `/workloads` на
// бэкенде остался — им пользуются API и CLI.
