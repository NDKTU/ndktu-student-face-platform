import api from './api';

export interface Teacher {
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    third_name: string;
    full_name: string;
    kafedra_id: number;
    kafedra?: {
        id: number;
        name: string;
        faculty_id?: number;
    };
    user?: {
        id: number;
        username: string;
        group_teachers?: { group_id: number; group: { id: number; name: string } }[];
    };
    subject_teachers?: { subject_id: number; subject: { id: number; name: string } }[];
    created_at: string;
    updated_at: string;
}

export interface TeacherCreateRequest {
    first_name: string;
    last_name: string;
    third_name: string;
    kafedra_id: number;
    user_id: number;
}

export interface TeacherFullCreateRequest {
    first_name: string;
    last_name: string;
    third_name: string;
    kafedra_id: number;
    username: string;
    password: string;
}

export interface TeacherListResponse {
    total: number;
    page: number;
    limit: number;
    teachers: Teacher[];
}

export interface TeacherAssignedGroupsResponse {
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    third_name: string;
    full_name: string;
    group_teachers: { group_id: number; group: { id: number; name: string } }[];
}

export const teacherService = {
    getTeachers: async (page = 1, limit = 10, full_name?: string, kafedra_id?: number) => {
        const response = await api.get<TeacherListResponse>('/teacher/', {
            params: { page, limit, full_name, kafedra_id },
        });
        return response.data;
    },

    getTeacherById: async (id: number): Promise<Teacher> => {
        const response = await api.get<Teacher>(`/teacher/${id}`);
        return response.data;
    },

    createTeacher: async (data: TeacherCreateRequest) => {
        const response = await api.post('/teacher/', data);
        return response.data;
    },

    createTeacherWithUser: async (data: TeacherFullCreateRequest) => {
        // Step 1: Create user with Teacher role
        const userResponse = await api.post('/user/', {
            username: data.username,
            password: data.password,
            roles: [{ name: 'Teacher' }],
        });
        const user_id: number = userResponse.data.id;

        // Step 2: Create teacher linked to that user
        const teacherResponse = await api.post('/teacher/', {
            first_name: data.first_name,
            last_name: data.last_name,
            third_name: data.third_name,
            kafedra_id: data.kafedra_id,
            user_id,
        });
        return teacherResponse.data;
    },

    updateTeacher: async (id: number, data: TeacherCreateRequest) => {
        const response = await api.put(`/teacher/${id}`, data);
        return response.data;
    },

    deleteTeacher: async (id: number, force?: boolean) => {
        const url = force ? `/teacher/${id}?force=true` : `/teacher/${id}`;
        await api.delete(url);
    },

    assignGroups: async (user_id: number, group_ids: number[]) => {
        const response = await api.post('/teacher/assign_groups', { user_id, group_ids });
        return response.data;
    },

    assignSubjects: async (teacher_id: number, subject_ids: number[]) => {
        const response = await api.post('/teacher/assign_subjects', { teacher_id, subject_ids });
        return response.data;
    },

    getAssignedGroups: async (userId: number): Promise<TeacherAssignedGroupsResponse> => {
        const response = await api.get<TeacherAssignedGroupsResponse>(`/teacher/assigned_groups/by-user/${userId}`);
        return response.data;
    },

    // ── Ranking ────────────────────────────────────────────────────────────
    getRankingOverall: async (params?: {
        faculty_id?: number;
        kafedra_id?: number;
        group_id?: number;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<TeacherRankingResponse> => {
        const response = await api.get<TeacherRankingResponse>('/teacher/ranking/overall', { params });
        return response.data;
    },

    getFacultyRanking: async (params?: { page?: number; limit?: number }): Promise<FacultyRankingResponse> => {
        const response = await api.get<FacultyRankingResponse>('/teacher/ranking/faculty', { params });
        return response.data;
    },

    getKafedraRanking: async (params?: { page?: number; limit?: number }): Promise<KafedraRankingResponse> => {
        const response = await api.get<KafedraRankingResponse>('/teacher/ranking/kafedra', { params });
        return response.data;
    },
};

// ── Teacher ranking types ────────────────────────────────────────────────────

export interface TeacherRankItem {
    rank: number;
    teacher_id: number;
    full_name: string;
    kafedra_id: number | null;
    kafedra_name: string | null;
    faculty_id: number | null;
    faculty_name: string | null;
    group_id: number | null;
    group_name: string | null;
    student_count: number;
    avg_grade: number;
    weighted_rating: number;
}

export interface TeacherRankingResponse {
    total: number;
    page: number;
    limit: number;
    teachers: TeacherRankItem[];
    faculty_id: number | null;
    kafedra_id: number | null;
    group_id: number | null;
}

// ── Faculty ranking types ────────────────────────────────────────────────────
export interface FacultyRankItem {
    rank: number;
    faculty_id: number;
    faculty_name: string;
    kafedra_count: number;
    student_count: number;
    avg_grade: number;
    weighted_rating: number;
}

export interface FacultyRankingResponse {
    total: number;
    page: number;
    limit: number;
    faculties: FacultyRankItem[];
}

// ── Kafedra ranking types ────────────────────────────────────────────────────
export interface KafedraRankItem {
    rank: number;
    kafedra_id: number;
    kafedra_name: string;
    faculty_id: number;
    faculty_name: string;
    teacher_count: number;
    student_count: number;
    avg_grade: number;
    weighted_rating: number;
}

export interface KafedraRankingResponse {
    total: number;
    page: number;
    limit: number;
    kafedras: KafedraRankItem[];
}


