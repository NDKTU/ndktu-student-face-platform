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

export const useEduPlanSettings = () =>
    useQuery({
        queryKey: ['eduplan', 'settings'],
        queryFn: () => eduplanService.getSettings(),
        refetchOnWindowFocus: false,
    });

/** Сохранение учётных данных: после него статус подключения нужно перепроверить. */
export const useUpdateEduPlanSettings = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: eduplanService.updateSettings,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'settings'] });
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'status'] });
        },
    });
};

export const useClearEduPlanSettings = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => eduplanService.clearSettings(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'settings'] });
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'status'] });
        },
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
/**
 * Prognni fonda boshlaydi. Javob — boshlangʻich holat, natija emas.
 *
 * Keshni bu yerda yangilamaymiz: soʻrov qaytganda progn hali ketyapti va
 * yangilanadigan maʼlumot yoʻq. Kesh progn tugaganda, sahifadagi kuzatuvchi
 * `done` holatini koʻrgach yangilanadi.
 */
export const useEduPlanRun = () =>
    useMutation({
        mutationFn: () => eduplanService.run(),
    });

/** Progn tugagach chaqiriladi: koʻchirilgan spravochniklar keshini yangilaydi. */
export const useInvalidateMirrored = () => {
    const queryClient = useQueryClient();
    return () => {
        MIRRORED_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
        queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
    };
};

// Отдельного импорта нагрузки в интерфейсе больше нет: она переносится тем же
// прогоном, что и справочники (см. useEduPlanRun). Эндпоинт `/workloads` на
// бэкенде остался — им пользуются API и CLI.
