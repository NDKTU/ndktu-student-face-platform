import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { psychologyService, type MethodCreateRequest, type MethodUpdateRequest, type QuestionCreateRequest, type QuestionUpdateRequest, type TestSubmitRequest } from '@/services/psychologyService';

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
        onSuccess: () => qc.invalidateQueries({ queryKey: ['psychology-my-results'] }),
    });
};

export const useMyResults = (params?: {
    method_id?: number;
    faculty_id?: number;
    group_id?: number;
    page?: number;
}) =>
    useQuery({
        queryKey: ['psychology-my-results', params],
        queryFn: () => psychologyService.listMyResults(params),
    });
