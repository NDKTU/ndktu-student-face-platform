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

export const kafedraService = {
    getKafedras: async (page = 1, limit = 100, name?: string, faculty_id?: number) => {
        const response = await api.get<KafedraListResponse>('/kafedra/', {
            params: { page, limit, name, faculty_id },
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

    createKafedra: async (data: { name: string; faculty_id: number }) => {
        const response = await api.post('/kafedra/', data);
        return response.data;
    },

    updateKafedra: async (id: number, data: { name: string; faculty_id: number }) => {
        const response = await api.put(`/kafedra/${id}`, data);
        return response.data;
    },

    deleteKafedra: async (id: number, force?: boolean) => {
        const url = force ? `/kafedra/${id}?force=true` : `/kafedra/${id}`;
        await api.delete(url);
    },
};
