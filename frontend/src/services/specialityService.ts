import api from './api';

export type EducationType = 'Bakalavr' | 'Magistr';

export interface Speciality {
    id: number;
    name: string;
    kafedra_id: number;
    /** EPOS: 'Bakalavr' | 'Magistr'; у ручных записей может отсутствовать */
    education_type?: string | null;
    created_at: string;
    updated_at: string;
    external_id?: string | null;
    // Признаки зеркала EduPlan: если источник задан, запись не редактируется.
    external_source?: string | null;
    synced_at?: string | null;
    is_active?: boolean;
    /** Admin yashirgan. `is_active` dan alohida: u sinxronizatsiyaniki. */
    is_hidden?: boolean;
}

export interface SpecialityPayload {
    name: string;
    kafedra_id: number;
    education_type?: EducationType | null;
}

export interface SpecialityListResponse {
    total: number;
    page: number;
    limit: number;
    specialities: Speciality[];
}

export interface SpecialityStats {
    speciality_id: number;
    group_count: number;
    student_count: number;
}

export const specialityService = {
    getSpecialities: async (page = 1, limit = 100, name?: string, kafedra_id?: number, includeHidden?: boolean) => {
        const response = await api.get<SpecialityListResponse>('/speciality/', {
            params: { page, limit, name, kafedra_id, include_hidden: includeHidden || undefined },
        });
        return response.data;
    },

    getSpecialityById: async (id: number): Promise<Speciality> => {
        const response = await api.get<Speciality>(`/speciality/${id}`);
        return response.data;
    },

    getSpecialityStats: async (kafedraId?: number): Promise<SpecialityStats[]> => {
        const response = await api.get<{ stats: SpecialityStats[] }>('/speciality/stats', {
            params: { kafedra_id: kafedraId },
        });
        return response.data.stats;
    },

    createSpeciality: async (data: SpecialityPayload): Promise<Speciality> => {
        const response = await api.post<Speciality>('/speciality/', data);
        return response.data;
    },

    updateSpeciality: async (id: number, data: SpecialityPayload): Promise<Speciality> => {
        const response = await api.put<Speciality>(`/speciality/${id}`, data);
        return response.data;
    },

    deleteSpeciality: async (id: number, force?: boolean) => {
        await api.delete(`/speciality/${id}`, { params: force ? { force: true } : undefined });
    },
};
