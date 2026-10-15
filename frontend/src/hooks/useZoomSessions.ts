import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GroupOptionFilter } from '@/services/generalTestService';
import {
    zoomSessionService,
    type ZoomSeriesOptions,
    type ZoomSeriesScope,
    type ZoomSessionPayload,
    type ZoomSessionScope,
} from '@/services/zoomSessionService';

const KEYS = {
    list: ['zoom-sessions'] as const,
    detail: (id: number) => ['zoom-session', id] as const,
};

export const useZoomSessions = (scope?: ZoomSessionScope) =>
    useQuery({
        queryKey: [...KEYS.list, scope ?? 'all'],
        queryFn: () => zoomSessionService.list(scope),
        // Holat vaqtga bog'liq (yaqinda / hozir / tugagan) — sahifa ochiq tursa yangilanadi.
        refetchInterval: 60_000,
        placeholderData: (prev) => prev,
    });

export const useZoomSession = (id: number) =>
    useQuery({
        queryKey: KEYS.detail(id),
        queryFn: () => zoomSessionService.get(id),
        enabled: Number.isFinite(id) && id > 0,
        refetchInterval: 60_000,
    });

export const useZoomCapabilities = (enabled: boolean) =>
    useQuery({
        queryKey: ['zoom-session-capabilities'],
        queryFn: zoomSessionService.capabilities,
        enabled,
        staleTime: 5 * 60_000,
    });

export const useZoomTeacherOptions = (search: string) =>
    useQuery({
        queryKey: ['zoom-session-teacher-options', search],
        queryFn: () => zoomSessionService.teacherOptions(search),
        placeholderData: (prev) => prev,
    });

export const useZoomTeacherSubjects = (teacherUserId: number | null) =>
    useQuery({
        queryKey: ['zoom-session-teacher-subjects', teacherUserId],
        queryFn: () => zoomSessionService.teacherSubjects(teacherUserId!),
        enabled: teacherUserId != null,
    });

export const useZoomGroupOptions = (filter: GroupOptionFilter, enabled: boolean) =>
    useQuery({
        queryKey: ['zoom-session-group-options', filter],
        queryFn: () => zoomSessionService.groupOptions(filter),
        enabled,
        placeholderData: (prev) => prev,
    });

const useInvalidate = () => {
    const queryClient = useQueryClient();
    return () => {
        void queryClient.invalidateQueries({ queryKey: KEYS.list });
        void queryClient.invalidateQueries({ queryKey: ['zoom-session'] });
    };
};

export const useSaveZoomSession = () => {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: ZoomSessionPayload }) =>
            id ? zoomSessionService.update(id, data) : zoomSessionService.create(data),
        onSuccess: invalidate,
    });
};

export const useDeleteZoomSession = () => {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: ({ id, scope = 'one' }: { id: number; scope?: ZoomSeriesScope }) =>
            zoomSessionService.remove(id, scope),
        onSuccess: invalidate,
    });
};

export const useCreateZoomSeries = () => {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: (data: ZoomSessionPayload & ZoomSeriesOptions) => zoomSessionService.createSeries(data),
        onSuccess: invalidate,
    });
};

export const useUpdateZoomFollowing = () => {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: ZoomSessionPayload }) =>
            zoomSessionService.updateFollowing(id, data),
        onSuccess: invalidate,
    });
};
