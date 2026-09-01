import api from './api';

export interface Faculty {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
    // Признаки зеркала EduPlan: если источник задан, запись не редактируется.
    external_source?: string | null;
    synced_at?: string | null;
    is_active?: boolean;
    /** Admin yashirgan. `is_active` dan alohida: u sinxronizatsiyaniki. */
    is_hidden?: boolean;
}

export interface FacultyListResponse {
    total: number;
    page: number;
    limit: number;
    faculties: Faculty[];
}

export interface FacultyStats {
    faculty_id: number;
    kafedra_count: number;
    speciality_count: number;
    student_count: number;
}

export const facultyService = {
    getFaculties: async (page = 1, limit = 100, name?: string, includeHidden?: boolean) => {
        const response = await api.get<FacultyListResponse>('/faculty/', {
            // include_hidden faqat adminda ishlaydi — serverda tekshiriladi.
            params: { page, limit, name, include_hidden: includeHidden || undefined },
        });
        return response.data;
    },

    getFacultyStats: async (): Promise<FacultyStats[]> => {
        const response = await api.get<{ stats: FacultyStats[] }>('/faculty/stats');
        return response.data.stats;
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
