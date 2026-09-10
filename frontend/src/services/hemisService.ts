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

export interface GroupMatchCandidate {
    group_id: number;
    name: string;
}

export interface GroupMatchProposal {
    hemis_group_id: number;
    hemis_group_name: string;
    student_count: number;
    kind: 'auto' | 'review' | 'unmatched' | 'already';
    reason: 'vote' | 'name' | 'existing' | 'none';
    group_id: number | null;
    group_name: string | null;
    candidates: GroupMatchCandidate[];
}

export interface GroupMatchPreview {
    run_id: string;
    hemis_total_students: number;
    hemis_groups: number;
    local_groups: number;
    auto_count: number;
    review_count: number;
    unmatched_count: number;
    already_count: number;
    students_without_group: number;
    proposals: GroupMatchProposal[];
}

export interface GroupMatchApplyResult {
    linked: number;
    skipped: number;
    conflicts: string[];
}

export interface StudentSyncPreview {
    hemis_total: number;
    create_count: number;
    update_count: number;
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
 * Toifalar kesishadi: guruhsiz talaba ayni paytda yangi yoki yangilanadigan
 * ham bo'ladi. `include_no_group: false` ularni ikkala ro'yxatdan ham
 * chiqaradi — aks holda belgi hech narsani o'zgartirmagan bo'lardi.
 */
export interface StudentSyncSelection {
    include_create: boolean;
    include_update: boolean;
    include_no_group: boolean;
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

    previewGroupMatch: async () => {
        // To'liq o'tish ~1 daqiqa: standart 10 soniyalik timeout yetmaydi.
        const response = await api.post<GroupMatchPreview>('/hemis/groups/match/preview', undefined, {
            timeout: 300_000,
        });
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

    applyGroupMatch: async (data: {
        run_id: string;
        apply_auto: boolean;
        decisions: { hemis_group_id: number; group_id: number | null }[];
    }) => {
        const response = await api.post<GroupMatchApplyResult>('/hemis/groups/match/apply', data);
        return response.data;
    },
};
