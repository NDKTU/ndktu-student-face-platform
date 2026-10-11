import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zoomAccountService, type ZoomAccountPayload } from '@/services/zoomAccountService';

const KEY = ['zoom-accounts'] as const;

export const useZoomAccounts = () => useQuery({ queryKey: KEY, queryFn: zoomAccountService.list });

const useInvalidate = () => {
    const queryClient = useQueryClient();
    return () => {
        void queryClient.invalidateQueries({ queryKey: KEY });
        // Seans formasidagi akkauntlar ro'yxati ham yangilansin.
        void queryClient.invalidateQueries({ queryKey: ['zoom-session-capabilities'] });
    };
};

export const useSaveZoomAccount = () => {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: ZoomAccountPayload }) =>
            id ? zoomAccountService.update(id, data) : zoomAccountService.create(data),
        onSuccess: invalidate,
    });
};

export const useDeleteZoomAccount = () => {
    const invalidate = useInvalidate();
    return useMutation({ mutationFn: (id: number) => zoomAccountService.remove(id), onSuccess: invalidate });
};

export const useCheckZoomAccount = () => useMutation({ mutationFn: (id: number) => zoomAccountService.check(id) });
