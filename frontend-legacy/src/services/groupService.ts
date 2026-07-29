import api from './api';

export interface Group {
    id: number;
    name: string;
    faculty_id: number;
    created_at: string;
    updated_at: string;
}

export interface GroupListResponse {
    total: number;
    page: number;
    limit: number;
    groups: Group[];
}

export interface GroupStudent {
    id: number;
    full_name: string;
    first_name: string;
    last_name: string;
    student_id_number: string;
    group_id: number | null;
    user_id: number | null;
}

export interface GroupStudentListResponse {
    total: number;
    page: number;
    limit: number;
    students: GroupStudent[];
}

export const groupService = {
    getGroups: async (page = 1, limit = 10, search = '', teacher_id?: number, faculty_id?: number) => {
        const params: any = { page, limit };
        if (search) params.name = search;
        if (teacher_id) params.teacher_id = teacher_id;
        if (faculty_id) params.faculty_id = faculty_id;

        const response = await api.get<GroupListResponse>('/group/', { params });
        return response.data;
    },

    getGroupById: async (id: number): Promise<Group> => {
        const response = await api.get<Group>(`/group/${id}`);
        return response.data;
    },

    createGroup: async (data: { name: string; faculty_id: number }) => {
        const response = await api.post('/group/', data);
        return response.data;
    },

    updateGroup: async (id: number, data: { name: string; faculty_id: number }) => {
        const response = await api.put(`/group/${id}`, data);
        return response.data;
    },

    deleteGroup: async (id: number, force?: boolean) => {
        const url = force ? `/group/${id}?force=true` : `/group/${id}`;
        await api.delete(url);
    },

    getDeleteInfo: async (id: number): Promise<{ students_count: number; results_count: number }> => {
        const response = await api.get<{ students_count: number; results_count: number }>(`/group/${id}/delete-info`);
        return response.data;
    },

    getGroupStudents: async (groupId: number, page = 1, limit = 200, search?: string): Promise<GroupStudentListResponse> => {
        const params: Record<string, unknown> = { page, limit };
        if (search) params.search = search;
        const response = await api.get<GroupStudentListResponse>(`/group/${groupId}/students`, { params });
        return response.data;
    },
};
