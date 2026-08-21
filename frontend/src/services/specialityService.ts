import api from './api';

export interface Speciality {
    id: number;
    name: string;
    kafedra_id: number;
    /** EPOS: 'Bakalavr' | 'Magistr'; у ручных записей может отсутствовать */
    education_type?: string | null;
    created_at: string;
    updated_at: string;
    external_id?: string | null;
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
    getSpecialities: async (page = 1, limit = 100, name?: string, kafedra_id?: number) => {
        const response = await api.get<SpecialityListResponse>('/speciality/', {
            params: { page, limit, name, kafedra_id },
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
};
