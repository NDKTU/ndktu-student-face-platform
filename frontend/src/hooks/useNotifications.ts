import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/services/notificationService';

export const useNotifications = (
    params?: { page?: number; limit?: number; only_unread?: boolean },
    enabled = true,
) =>
    useQuery({
        queryKey: ['notifications', params],
        queryFn: () => notificationService.list(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });

/**
 * Qo'ng'iroqcha ustidagi raqam.
 *
 * Bildirishnoma boshqa tizimdan (ROYD webhook'i) keladi, ya'ni brauzerda
 * hech qanday harakatsiz paydo bo'ladi — shuning uchun davriy so'rov bor.
 * Oraliq ataylab uzun: raqam bir necha daqiqa keyin yangilansa ham hech
 * narsa yo'qolmaydi, har 30 soniyada so'rash esa 9600 talabada bekendga
 * keraksiz yuk bo'lardi.
 */
export const useUnreadCount = (enabled = true) =>
    useQuery({
        queryKey: ['notifications', 'unread-count'],
        queryFn: () => notificationService.unreadCount(),
        refetchInterval: 2 * 60 * 1000,
        refetchOnWindowFocus: true,
        enabled,
    });

export const useMarkNotificationRead = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => notificationService.markRead(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });
};

export const useMarkAllNotificationsRead = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => notificationService.markAllRead(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });
};
