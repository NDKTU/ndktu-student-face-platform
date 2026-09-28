import api from './api';

/**
 * Arizalar ROYD («Yagona darcha») tizimida yuritiladi — bizda nusxa
 * saqlanmaydi. Bu yerdagi so'rovlar bekend orqali o'sha tizimga uzatiladi.
 *
 * Integratsiya sozlanmagan bo'lsa bekend 503 qaytaradi: bu nosozlik emas,
 * sozlama yo'q — interfeys bo'limni yashiradi.
 */

export type RequestStatus =
    | 'new'
    | 'accepted'
    | 'in_progress'
    | 'completed'
    | 'rejected'
    | 'returned';

export interface ServiceCategory {
    id: number;
    name: string;
    parent_id?: number | null;
    sla_hours?: number;
    icon?: string | null;
    children?: ServiceCategory[];
}

export interface RequestSummary {
    id: number;
    tracking_no: string;
    title: string;
    status: RequestStatus;
    priority?: string;
    created_at: string;
    sla_deadline?: string | null;
    category?: { id: number; name: string } | null;
}

export interface RequestMessage {
    id: number;
    content: string;
    created_at: string;
    sender?: { id: number; full_name?: string | null } | null;
}

export interface RequestFile {
    id: number;
    file_name: string;
    file_size: number;
    created_at: string;
}

export interface RequestHistoryEntry {
    id: number;
    old_status?: string | null;
    new_status: string;
    comment?: string | null;
    created_at: string;
}

export interface RequestDetail extends RequestSummary {
    description: string;
    messages?: RequestMessage[];
    files?: RequestFile[];
    history?: RequestHistoryEntry[];
}

export interface RequestListResponse {
    total: number;
    /** ROYD sahifalashni `limit/offset` bilan qiladi, `page` bilan emas. */
    limit: number;
    offset: number;
    items: RequestSummary[];
}

export interface RequestCreatePayload {
    category_id: number;
    service_type_id?: number;
    title: string;
    description: string;
}

export const roydService = {
    catalog: async () => {
        const response = await api.get<ServiceCategory[]>('/integration/royd/catalog');
        return response.data;
    },

    list: async (params?: { limit?: number; offset?: number; status?: string }) => {
        const response = await api.get<RequestListResponse>('/integration/royd/requests', { params });
        return response.data;
    },

    detail: async (id: number) => {
        const response = await api.get<RequestDetail>(`/integration/royd/requests/${id}`);
        return response.data;
    },

    create: async (payload: RequestCreatePayload) => {
        const response = await api.post<RequestDetail>('/integration/royd/requests', payload);
        return response.data;
    },

    addMessage: async (id: number, content: string) => {
        const response = await api.post<RequestMessage>(
            `/integration/royd/requests/${id}/messages`,
            { content },
        );
        return response.data;
    },

    resubmit: async (id: number, comment: string) => {
        const response = await api.post<RequestDetail>(
            `/integration/royd/requests/${id}/resubmit`,
            { comment },
        );
        return response.data;
    },

    uploadFile: async (id: number, file: File) => {
        const form = new FormData();
        // Bekend bu faylni ROYD'ga `upload` nomi bilan uzatadi; bizning
        // API'imizda maydon odatdagidek `file`.
        form.append('file', file);
        const response = await api.post<RequestFile>(
            `/integration/royd/requests/${id}/files`,
            form,
            { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        return response.data;
    },
};
