import api from './api';

export interface Kafedra {
    id: number;
    name: string;
    faculty_id: number;
    created_at: string;
    updated_at: string;
    // Признаки зеркала EduPlan: если источник задан, запись не редактируется.
    external_source?: string | null;
    synced_at?: string | null;
    is_active?: boolean;
    /** Admin yashirgan. `is_active` dan alohida: u sinxronizatsiyaniki. */
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    // is_hidden?: boolean;
}

export interface KafedraListResponse {
    total: number;
    page: number;
    limit: number;
    kafedras: Kafedra[];
}

export interface KafedraStats {
    kafedra_id: number;
    speciality_count: number;
    teacher_count: number;
}

export interface KafedraListParams {
    sort_by?: 'name' | 'speciality_count' | 'teacher_count';
    order?: 'asc' | 'desc';
}

export const kafedraService = {
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    getKafedras: async (
        page = 1,
        limit = 100,
        name?: string,
        faculty_id?: number,
        sort?: KafedraListParams,
    ) => {
        const response = await api.get<KafedraListResponse>('/kafedra/', {
            params: {
                page,
                limit,
                name,
                faculty_id,
                // Saralash serverda — sanoq ustunlari ham: aks holda «eng
                // ko'p» birinchi sahifadan tashqarida qolardi.
                sort_by: sort?.sort_by,
                order: sort?.sort_by ? (sort.order ?? 'asc') : undefined,
            },
        });
        return response.data;
    },

    getKafedraById: async (id: number): Promise<Kafedra> => {
        const response = await api.get<Kafedra>(`/kafedra/${id}`);
        return response.data;
    },

    getKafedraStats: async (facultyId?: number): Promise<KafedraStats[]> => {
        const response = await api.get<{ stats: KafedraStats[] }>('/kafedra/stats', {
            params: { faculty_id: facultyId },
        });
        return response.data.stats;
    },

    // EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
    // olindi — backendda ham bu endpointlar kommentda.
    // createKafedra: async (data: { name: string; faculty_id: number }) => {
    //     const response = await api.post('/kafedra/', data);
    //     return response.data;
    // },
    //
    // updateKafedra: async (id: number, data: { name: string; faculty_id: number }) => {
    //     const response = await api.put(`/kafedra/${id}`, data);
    //     return response.data;
    // },
    //
    // deleteKafedra: async (id: number, force?: boolean) => {
    //     const url = force ? `/kafedra/${id}?force=true` : `/kafedra/${id}`;
    //     await api.delete(url);
    // },
};
