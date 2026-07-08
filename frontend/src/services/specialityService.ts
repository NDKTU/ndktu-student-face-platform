import api from './api';

export interface Speciality {
    id: number;
    name: string;
    kafedra_id: number;
    created_at: string;
    updated_at: string;
}

export interface SpecialityListResponse {
    total: number;
    page: number;
    limit: number;
    specialities: Speciality[];
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
};
