import api from './api';

export interface AuditLog {
    id: number;
    created_at: string;
    user_id?: number | null;
    /** Login. Muvaffaqiyatsiz kirishda hisob topilmasa ham yoziladi. */
    username?: string | null;
    /** To'liq ism — bo'lsa. Login ko'pincha HEMIS raqami. */
    full_name?: string | null;
    role?: string | null;
    event: string;
    object_type?: string | null;
    object_id?: string | null;
    summary?: string | null;
    meta?: Record<string, unknown> | null;
    ip?: string | null;
    user_agent?: string | null;
}

export interface AuditListResponse {
    total: number;
    page: number;
    limit: number;
    logs: AuditLog[];
}

export interface AuditEventOption {
    value: string;
    count: number;
}

export interface AuditListParams {
    search?: string;
    user_id?: number;
    event?: string;
    only_auth?: boolean;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
}

export const auditService = {
    list: async (params: AuditListParams = {}) => {
        const response = await api.get<AuditListResponse>('/audit/', { params });
        return response.data;
    },

    events: async () => {
        const response = await api.get<AuditEventOption[]>('/audit/events');
        return response.data;
    },
};
