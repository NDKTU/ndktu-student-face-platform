import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    generalTestService,
    type GeneralTestPayload,
    type QuestionPayload,
    type ResultFilter,
} from '@/services/generalTestService';

const KEYS = {
    list: ['general-tests'] as const,
    detail: (id: number) => ['general-test', id] as const,
    results: ['general-test-results'] as const,
    available: ['general-tests-available'] as const,
    mine: ['general-test-my-results'] as const,
};

export const useGeneralTests = (page = 1, limit = 20, search = '') =>
    useQuery({
        queryKey: [...KEYS.list, page, limit, search],
        queryFn: () => generalTestService.list(page, limit, search),
        placeholderData: (prev) => prev,
    });

export const useGeneralTest = (id: number | null) =>
    useQuery({
        queryKey: KEYS.detail(id ?? 0),
        queryFn: () => generalTestService.get(id!),
        enabled: id !== null,
    });

/** Test yoki uning savollari o'zgarganda — ro'yxat va kartochka yangilanadi. */
const useInvalidateTests = () => {
    const qc = useQueryClient();
    return (id?: number) => {
        qc.invalidateQueries({ queryKey: KEYS.list });
        if (id !== undefined) qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    };
};

export const useCreateGeneralTest = () => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: (data: GeneralTestPayload) => generalTestService.create(data),
        onSuccess: () => invalidate(),
    });
};

export const useUpdateGeneralTest = () => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<GeneralTestPayload> }) =>
            generalTestService.update(id, data),
        onSuccess: (_d, vars) => invalidate(vars.id),
    });
};

export const useDeleteGeneralTest = () => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: (id: number) => generalTestService.remove(id),
        onSuccess: () => invalidate(),
    });
};

export const useSaveGeneralTestQuestion = (testId: number) => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: QuestionPayload }) =>
            id ? generalTestService.updateQuestion(id, data) : generalTestService.createQuestion(testId, data),
        onSuccess: () => invalidate(testId),
    });
};

export const useDeleteGeneralTestQuestion = (testId: number) => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: (id: number) => generalTestService.removeQuestion(id),
        onSuccess: () => invalidate(testId),
    });
};

export const useUploadGeneralTestExcel = (testId: number) => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: (file: File) => generalTestService.uploadExcel(testId, file),
        onSuccess: () => invalidate(testId),
    });
};

export const useGeneralTestResults = (filter: ResultFilter) =>
    useQuery({
        queryKey: [...KEYS.results, filter],
        queryFn: () => generalTestService.results(filter),
        placeholderData: (prev) => prev,
    });

export const useDeleteGeneralTestResult = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (attemptId: number) => generalTestService.removeResult(attemptId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.results });
            qc.invalidateQueries({ queryKey: KEYS.list });
        },
    });
};

export const useAvailableGeneralTests = () =>
    useQuery({ queryKey: KEYS.available, queryFn: generalTestService.available });

export const useMyGeneralTestResults = () =>
    useQuery({ queryKey: KEYS.mine, queryFn: generalTestService.myResults });

/** Test tugaganda «ishlash» ro'yxati va shaxsiy natijalar yangilanadi. */
export const useRefreshTaking = () => {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: KEYS.available });
        qc.invalidateQueries({ queryKey: KEYS.mine });
    };
};
