import api from './api';

export interface HemisLoginRequest {
    login: string;
    password?: string;
    pin?: string; 
    faculty_id?: number;
    group_id?: number;
}

export interface HemisLoginResponse {
    access_token: string;
    type: string;
    // Add other fields if returned by the backend
}

// ── Ma'lumot API (token bo'yicha) ────────────────────────────────────────────

export interface HemisDataSettings {
    source: 'env' | 'db';
    data_url: string;
    has_token: boolean;
    /** Tokenning oxirgi to'rt belgisi — kalitlarni farqlash uchun. */
    token_tail: string;
    last_ok_at?: string | null;
    updated_at?: string | null;
}

export interface HemisDataProbe {
    ok: boolean;
    total: number;
    detail?: string | null;
}

export interface StudentSyncPreview {
    hemis_total: number;
    create_count: number;
    update_count: number;
    /** Guruhi bizning bazamizda yo'q — import qilinmaydi, faqat sanaladi. */
    no_group_count: number;
    missing_locally: number;
    linked_groups: number;
    missing_examples: string[];
    needs_bulk_confirm: boolean;
}

export interface StudentSyncResult {
    incremental: boolean;
    fetched: number;
    created: number;
    updated: number;
    /** Nomeri yo'q yoki takrorlangan yozuvlar. */
    skipped: number;
    /** Admin belgini olib tashlagani uchun import qilinmaganlar. */
    excluded: number;
    no_group: number;
    missing_locally: number;
}

/**
 * Qaysi toifalar import qilinsin.
 *
 * Guruhi bizda yo'q talabalar bu yerda yo'q: ularni backend har doim chetlab
 * o'tadi va `create_count`/`update_count` ga ham qo'shmaydi.
 */
export interface StudentSyncSelection {
    include_create: boolean;
    include_update: boolean;
}

export const hemisService = {
    login: async (data: HemisLoginRequest) => {
        const response = await api.post<HemisLoginResponse>('/hemis/login', data);
        return response.data;
    },
    previewAdminData: async (data: HemisLoginRequest) => {
        const response = await api.post('/hemis/preview', data);
        return response.data;
    },
    syncAdminData: async (data: HemisLoginRequest) => {
        const response = await api.post('/hemis/sync', data);
        return response.data;
    },

    getDataSettings: async () => {
        const response = await api.get<HemisDataSettings>('/hemis/data-settings');
        return response.data;
    },

    saveDataSettings: async (data: { data_url?: string; token?: string }) => {
        const response = await api.put<HemisDataSettings>('/hemis/data-settings', data);
        return response.data;
    },

    testDataToken: async () => {
        const response = await api.post<HemisDataProbe>('/hemis/data-settings/test');
        return response.data;
    },

    previewStudents: async () => {
        const response = await api.post<StudentSyncPreview>('/hemis/students/preview', undefined, {
            timeout: 300_000,
        });
        return response.data;
    },

    applyStudents: async (
        data: {
            incremental?: boolean;
            allow_bulk_create?: boolean;
        } & Partial<StudentSyncSelection>,
    ) => {
        const response = await api.post<StudentSyncResult>('/hemis/students/apply', data, {
            timeout: 600_000,
        });
        return response.data;
    },
};
