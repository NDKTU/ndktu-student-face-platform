import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roydService, type RequestCreatePayload } from '@/services/roydService';

/**
 * Integratsiya o'chiq bo'lsa bekend 503 qaytaradi va bu holat o'z-o'zidan
 * o'zgarmaydi — takroriy so'rov faqat bekendni bezovta qiladi. Qolgan
 * xatolarda odatdagi qayta urinish saqlanadi.
 */
const retryUnlessDisabled = (failureCount: number, error: unknown) => {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 503) return false;
    return failureCount < 2;
};

export const useRoydCatalog = (enabled = true) =>
    useQuery({
        queryKey: ['royd', 'catalog'],
        queryFn: () => roydService.catalog(),
        // Katalog kunda bir marta ham o'zgarmaydi — har ochilishda
        // so'ramaymiz.
        staleTime: 30 * 60 * 1000,
        retry: retryUnlessDisabled,
        enabled,
    });

export const useRoydRequests = (
    params?: { limit?: number; offset?: number; status?: string },
    enabled = true,
) =>
    useQuery({
        queryKey: ['royd', 'requests', params],
        queryFn: () => roydService.list(params),
        placeholderData: (previousData) => previousData,
        retry: retryUnlessDisabled,
        enabled,
    });

export const useRoydRequest = (id: number | undefined) =>
    useQuery({
        queryKey: ['royd', 'request', id],
        queryFn: () => roydService.detail(id as number),
        retry: retryUnlessDisabled,
        enabled: Boolean(id),
    });

export const useCreateRoydRequest = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: RequestCreatePayload) => roydService.create(payload),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['royd', 'requests'] }),
    });
};

export const useAddRoydMessage = (requestId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (content: string) => roydService.addMessage(requestId, content),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['royd', 'request', requestId] }),
    });
};

export const useUploadRoydFile = (requestId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (file: File) => roydService.uploadFile(requestId, file),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['royd', 'request', requestId] }),
    });
};

export const useResubmitRoydRequest = (requestId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (comment: string) => roydService.resubmit(requestId, comment),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['royd', 'request', requestId] });
            queryClient.invalidateQueries({ queryKey: ['royd', 'requests'] });
        },
    });
};
