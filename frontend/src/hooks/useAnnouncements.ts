import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    announcementService,
    type AnnouncementFeedParams,
    type AnnouncementListParams,
    type AnnouncementPayload,
} from '@/services/announcementService';

export const useAnnouncements = (params?: AnnouncementListParams, enabled = true) =>
    useQuery({
        queryKey: ['announcements', params],
        queryFn: () => announcementService.list(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });

export const useAnnouncementFeed = (params?: AnnouncementFeedParams, enabled = true) =>
    useQuery({
        queryKey: ['announcement-feed', params],
        queryFn: () => announcementService.feed(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });

export const useAudienceOptions = (enabled = true) =>
    useQuery({
        queryKey: ['announcement-audience-options'],
        queryFn: () => announcementService.audienceOptions(),
        // Guruhlar va fakultetlar ro'yxati kun davomida o'zgarmaydi.
        staleTime: 10 * 60 * 1000,
        enabled,
    });

export const useAnnouncementRegistrations = (id: number | undefined) =>
    useQuery({
        queryKey: ['announcement-registrations', id],
        queryFn: () => announcementService.registrations(id!),
        enabled: !!id,
    });

export const useCreateAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: AnnouncementPayload) => announcementService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['announcements'] });
            queryClient.invalidateQueries({ queryKey: ['announcement-feed'] });
        },
    });
};

export const useUpdateAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: AnnouncementPayload }) =>
            announcementService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['announcements'] });
            queryClient.invalidateQueries({ queryKey: ['announcement-feed'] });
        },
    });
};

export const useDeleteAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => announcementService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['announcements'] });
            queryClient.invalidateQueries({ queryKey: ['announcement-feed'] });
        },
    });
};

/** Yozilish va bekor qilish — lenta va ro'yxat bir zumda yangilanadi. */
export const useToggleRegistration = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, registered }: { id: number; registered: boolean }) =>
            registered ? announcementService.cancelRegistration(id) : announcementService.register(id),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['announcement-feed'] });
            queryClient.invalidateQueries({ queryKey: ['announcements'] });
            queryClient.invalidateQueries({ queryKey: ['announcement-registrations', variables.id] });
        },
    });
};
