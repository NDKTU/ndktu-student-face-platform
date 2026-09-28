import api from './api';

export interface Notification {
    id: number;
    /** `request_status` — ROYD arizasi holati, `general` — umumiy xabar. */
    type: string;
    title: string;
    body: string;
    /** Manbaga oid identifikatorlar: `tracking_no`, `request_id`, `status`. */
    payload?: Record<string, unknown> | null;
    is_read: boolean;
    read_at?: string | null;
    created_at: string;
}

export interface NotificationListResponse {
    total: number;
    /** Qo'ng'iroqcha ustidagi raqam — ro'yxat bilan birga keladi. */
    unread: number;
    page: number;
    limit: number;
    notifications: Notification[];
}

export const notificationService = {
    list: async (params?: { page?: number; limit?: number; only_unread?: boolean }) => {
        const response = await api.get<NotificationListResponse>('/notification/', { params });
        return response.data;
    },

    unreadCount: async () => {
        const response = await api.get<{ unread: number }>('/notification/unread-count');
        return response.data.unread;
    },

    markRead: async (id: number) => {
        const response = await api.post<{ updated: number }>(`/notification/${id}/read`);
        return response.data;
    },

    markAllRead: async () => {
        const response = await api.post<{ updated: number }>('/notification/read-all');
        return response.data;
    },
};
