import api from './api';

export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type AudienceKind = 'all' | 'faculty' | 'group' | 'level';

export interface Announcement {
    id: number;
    title: string;
    body: string;
    image_url?: string | null;
    status: AnnouncementStatus;
    pinned: boolean;
    publish_at?: string | null;
    expires_at?: string | null;
    registration_enabled: boolean;
    event_at?: string | null;
    location?: string | null;
    link_url?: string | null;
    capacity?: number | null;
    registration_deadline?: string | null;
    audience_kind: AudienceKind;
    /** Guruhda — id lar, fakultet va kursda — satrlar. */
    audience_values: (string | number)[];
    created_by_user_id?: number | null;
    created_at: string;
    updated_at: string;
    registered_count: number;
    /** null — joylar cheklanmagan. */
    seats_left?: number | null;
    is_registered: boolean;
    registration_open: boolean;
}

export interface AnnouncementListResponse {
    total: number;
    page: number;
    limit: number;
    announcements: Announcement[];
}

export interface AnnouncementPayload {
    title: string;
    body?: string;
    image_url?: string | null;
    status?: AnnouncementStatus;
    pinned?: boolean;
    publish_at?: string | null;
    expires_at?: string | null;
    registration_enabled?: boolean;
    event_at?: string | null;
    location?: string | null;
    link_url?: string | null;
    capacity?: number | null;
    registration_deadline?: string | null;
    audience_kind?: AudienceKind;
    audience_values?: (string | number)[];
}

export interface AnnouncementListParams {
    status?: AnnouncementStatus;
    search?: string;
    page?: number;
    limit?: number;
}

export interface AnnouncementFeedParams {
    only_events?: boolean;
    page?: number;
    limit?: number;
}

export interface AudienceOptions {
    faculties: string[];
    levels: string[];
    groups: { id: number; name: string }[];
}

export interface Registration {
    id: number;
    user_id: number;
    username?: string | null;
    status: 'registered' | 'cancelled';
    created_at: string;
    student?: {
        full_name?: string | null;
        group_name?: string | null;
        faculty?: string | null;
        level?: string | null;
    } | null;
}

export interface RegistrationListResponse {
    total: number;
    active_total: number;
    registrations: Registration[];
}

export const announcementService = {
    list: async (params?: AnnouncementListParams) => {
        const response = await api.get<AnnouncementListResponse>('/announcement/', { params });
        return response.data;
    },

    getById: async (id: number) => {
        const response = await api.get<Announcement>(`/announcement/${id}`);
        return response.data;
    },

    create: async (data: AnnouncementPayload) => {
        const response = await api.post<Announcement>('/announcement/', data);
        return response.data;
    },

    update: async (id: number, data: AnnouncementPayload) => {
        const response = await api.patch<Announcement>(`/announcement/${id}`, data);
        return response.data;
    },

    delete: async (id: number) => {
        await api.delete(`/announcement/${id}`);
    },

    audienceOptions: async () => {
        const response = await api.get<AudienceOptions>('/announcement/audience/options');
        return response.data;
    },

    registrations: async (id: number) => {
        const response = await api.get<RegistrationListResponse>(`/announcement/${id}/registrations`);
        return response.data;
    },

    // ── Talaba lentasi ──
    feed: async (params?: AnnouncementFeedParams) => {
        const response = await api.get<AnnouncementListResponse>('/announcement/feed', { params });
        return response.data;
    },

    feedItem: async (id: number) => {
        const response = await api.get<Announcement>(`/announcement/feed/${id}`);
        return response.data;
    },

    register: async (id: number) => {
        const response = await api.post<Announcement>(`/announcement/${id}/register`);
        return response.data;
    },

    cancelRegistration: async (id: number) => {
        const response = await api.delete<Announcement>(`/announcement/${id}/register`);
        return response.data;
    },
};
