import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    hemisScheduleService,
    type ScheduleListParams,
    type ScheduleScope,
} from '@/services/hemisScheduleService';

/** O'z jadvali — o'qituvchi yoki talaba, tanlangan hafta bo'yicha. */
export const useMySchedule = (dateFrom: string, dateTo: string) =>
    useQuery({
        queryKey: ['hemis-schedule', 'my', dateFrom, dateTo],
        queryFn: () => hemisScheduleService.my({ date_from: dateFrom, date_to: dateTo }),
        placeholderData: (previous) => previous,
    });

export const useScheduleList = (params: ScheduleListParams, enabled = true) =>
    useQuery({
        queryKey: ['hemis-schedule', 'list', params],
        queryFn: () => hemisScheduleService.list(params),
        placeholderData: (previous) => previous,
        enabled,
    });

export const useScheduleFilters = (scope: ScheduleScope) =>
    useQuery({
        queryKey: ['hemis-schedule', 'filters', scope],
        queryFn: () => hemisScheduleService.filters(scope),
        staleTime: 5 * 60_000,
        // Fakultet almashganda eski ro'yxat ko'rinib turadi, yangisi kelguncha.
        placeholderData: (previous) => previous,
    });

export const useScheduleSync = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (allowBulkDeactivate: boolean) =>
            hemisScheduleService.sync({ allow_bulk_deactivate: allowBulkDeactivate }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hemis-schedule'] }),
    });
};
