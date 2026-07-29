import api from './api';

export interface Faculty {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface FacultyListResponse {
    total: number;
    page: number;
    limit: number;
    faculties: Faculty[];
}

export const facultyService = {
    getFaculties: async (page = 1, limit = 100, name?: string) => {
        const response = await api.get<FacultyListResponse>('/faculty/', {
            params: { page, limit, name },
        });
        return response.data;
    },

    getFacultyById: async (id: number): Promise<Faculty> => {
        const response = await api.get<Faculty>(`/faculty/${id}`);
        return response.data;
    },

    createFaculty: async (data: { name: string }) => {
        const response = await api.post('/faculty/', data);
        return response.data;
    },

    updateFaculty: async (id: number, data: { name: string }) => {
        const response = await api.put(`/faculty/${id}`, data);
        return response.data;
    },

    deleteFaculty: async (id: number, force?: boolean) => {
        const url = force ? `/faculty/${id}?force=true` : `/faculty/${id}`;
        await api.delete(url);
    },
};
