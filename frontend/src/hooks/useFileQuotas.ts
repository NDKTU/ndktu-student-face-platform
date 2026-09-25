import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fileQuotaService, type TeacherQuotaListParams } from '@/services/fileQuotaService';

const KEY = 'file-quotas';

export const useQuotaDefault = () => useQuery({
    queryKey: [KEY, 'default'],
    queryFn: () => fileQuotaService.getDefault(),
});

export const useTeacherQuotas = (params: TeacherQuotaListParams) => useQuery({
    queryKey: [KEY, 'teachers', params],
    queryFn: () => fileQuotaService.listTeachers(params),
    placeholderData: keepPreviousData,
});

/**
 * Limit o'zgargach jadval ham, o'z limiti ham (`file-quota`) yangilanadi:
 * admin o'zini o'qituvchi ko'rinishida ko'rayotgan bo'lishi mumkin.
 */
const invalidate = (queryClient: ReturnType<typeof useQueryClient>) => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['file-quota'] });
};

export const useUpdateQuotaDefault = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (limitBytes: number) => fileQuotaService.updateDefault(limitBytes),
        onSuccess: () => invalidate(queryClient),
    });
};

export const useUpdateTeacherQuota = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, limitBytes }: { userId: number; limitBytes: number | null }) =>
            fileQuotaService.updateTeacher(userId, limitBytes),
        onSuccess: () => invalidate(queryClient),
    });
};
