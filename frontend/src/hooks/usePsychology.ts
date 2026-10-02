import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { psychologyService, type BreakdownBy, type StatsFilterParams, type TimelinePeriod, type MethodCreateRequest, type MethodUpdateRequest, type QuestionCreateRequest, type QuestionUpdateRequest, type ResultListParams, type TestSubmitRequest } from '@/services/psychologyService';

export const useMethods = (page = 1, limit = 20) =>
    useQuery({
        queryKey: ['psychology-methods', page, limit],
        queryFn: () => psychologyService.listMethods(page, limit),
        placeholderData: (prev) => prev,
    });

export const useMethod = (id: number | null) =>
    useQuery({
        queryKey: ['psychology-method', id],
        queryFn: () => psychologyService.getMethod(id!),
        enabled: id !== null,
    });

export const useCreateMethod = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: MethodCreateRequest) => psychologyService.createMethod(data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['psychology-methods'] }),
    });
};

export const useUpdateMethod = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: MethodUpdateRequest }) =>
            psychologyService.updateMethod(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['psychology-methods'] });
            qc.invalidateQueries({ queryKey: ['psychology-method'] });
        },
    });
};

export const useDeleteMethod = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => psychologyService.deleteMethod(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['psychology-methods'] }),
    });
};

export const useCreateQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: QuestionCreateRequest) => psychologyService.createQuestion(data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['psychology-methods'] });
            qc.invalidateQueries({ queryKey: ['psychology-method', vars.method_id] });
        },
    });
};

export const useUpdateQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: QuestionUpdateRequest }) =>
            psychologyService.updateQuestion(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['psychology-methods'] });
            qc.invalidateQueries({ queryKey: ['psychology-method'] });
        },
    });
};

export const useDeleteQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => psychologyService.deleteQuestion(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['psychology-methods'] });
            qc.invalidateQueries({ queryKey: ['psychology-method'] });
        },
    });
};

export const useSubmitTest = () =>
    useMutation({
        mutationFn: ({ methodId, data }: { methodId: number; data: TestSubmitRequest }) =>
            psychologyService.submitTest(methodId, data),
    });

export const useDeleteResult = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => psychologyService.deleteResult(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['psychology-my-results'] });
            qc.invalidateQueries({ queryKey: ['psychology-stats'] });
        },
    });
};

export const useMyResults = (params?: ResultListParams) =>
    useQuery({
        queryKey: ['psychology-my-results', params],
        queryFn: () => psychologyService.listMyResults(params),
        placeholderData: (previousData) => previousData,
    });

/** Natijalar filtri — `read:faculty`/`read:group` ruxsatisiz ham ishlaydi. */
export const useResultFilterOptions = (enabled = true) =>
    useQuery({
        queryKey: ['psychology-result-filter-options'],
        queryFn: () => psychologyService.getResultFilterOptions(),
        enabled,
    });

// ── Statistika ──────────────────────────────────────────────────────────────

export const usePsychologyStatsOverview = (filters: StatsFilterParams) =>
    useQuery({
        queryKey: ['psychology-stats', 'overview', filters],
        queryFn: () => psychologyService.getStatsOverview(filters),
        placeholderData: (prev) => prev,
    });

export const usePsychologyTimeline = (filters: StatsFilterParams, period: TimelinePeriod, methodId?: number) =>
    useQuery({
        queryKey: ['psychology-stats', 'timeline', filters, period, methodId],
        queryFn: () => psychologyService.getStatsTimeline({ ...filters, period, method_id: methodId }),
        placeholderData: (prev) => prev,
    });

export const useMethodStats = (methodId: number | undefined, filters: StatsFilterParams, latestOnly: boolean) =>
    useQuery({
        queryKey: ['psychology-stats', 'method', methodId, filters, latestOnly],
        queryFn: () => psychologyService.getMethodStats(methodId!, { ...filters, latest_only: latestOnly }),
        enabled: methodId !== undefined,
        placeholderData: (prev) => prev,
    });

export const useMethodBreakdown = (
    methodId: number | undefined,
    filters: StatsFilterParams,
    by: BreakdownBy,
    category: string | undefined,
    latestOnly: boolean,
) =>
    useQuery({
        queryKey: ['psychology-stats', 'breakdown', methodId, filters, by, category, latestOnly],
        queryFn: () =>
            psychologyService.getMethodBreakdown(methodId!, { ...filters, by, category, latest_only: latestOnly }),
        enabled: methodId !== undefined,
        placeholderData: (prev) => prev,
    });

export const useRiskStudents = (
    methodId: number | undefined,
    filters: StatsFilterParams,
    labels: string[] | undefined,
    category: string | undefined,
    page: number,
    limit: number,
) =>
    useQuery({
        queryKey: ['psychology-stats', 'risk', methodId, filters, labels, category, page, limit],
        queryFn: () => psychologyService.getRiskStudents(methodId!, { ...filters, labels, category, page, limit }),
        enabled: methodId !== undefined,
        placeholderData: (prev) => prev,
    });

export const useUserPsychologyHistory = (userId: number | null, methodId?: number) =>
    useQuery({
        queryKey: ['psychology-stats', 'history', userId, methodId],
        queryFn: () => psychologyService.getUserHistory(userId!, methodId),
        enabled: userId !== null,
    });
