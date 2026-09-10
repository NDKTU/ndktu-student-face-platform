import api from './api';

export interface Group {
    id: number;
    name: string;
    faculty_id: number;
    speciality_id?: number | null;
    course?: number | null;
    education_shape?: string | null;
    student_count?: number | null;
    created_at: string;
    updated_at: string;
    // Признаки зеркала EduPlan: если источник задан, запись не редактируется.
    external_source?: string | null;
    synced_at?: string | null;
    is_active?: boolean;
    /** Admin yashirgan. `is_active` dan alohida: u sinxronizatsiyaniki. */
    is_hidden?: boolean;
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
    // Backend to'liq `StudentResponse` qaytaradi — quyidagilari ro'yxatda ko'rsatiladi.
    specialty?: string | null;
    level?: string | null;
    semester?: string | null;
    avg_gpa?: number | null;
    phone?: string | null;
    student_status?: string | null;
}

export interface GroupStudentListResponse {
    total: number;
    page: number;
    limit: number;
    students: GroupStudent[];
}

/**
 * Takrorlangan guruhlar. EPOS guruhning `external_id` sini almashtirsa,
 * zerkalo uni tanimay yangi qator yaratadi — eskisi talabalari bilan yonida
 * qolaveradi. Shundan keyin HEMIS guruhini nomiga qarab bog'lash ishlamaydi:
 * bitta nomga ikkita nomzod chiqadi.
 */
export interface GroupMergeRow {
    group_id: number;
    name: string;
    external_id?: string | null;
    synced_at?: string | null;
    hemis_group_id?: string | null;
    students: number;
    courses: number;
    workloads: number;
    lessons: number;
    /** true — shu nusxa qoladi, qolganlari unga qo'shiladi. */
    keep: boolean;
}

export interface GroupDuplicateCluster {
    name: string;
    faculty_id?: number | null;
    keep: GroupMergeRow;
    merge: GroupMergeRow[];
}

export interface GroupDuplicatePreview {
    clusters: GroupDuplicateCluster[];
    summary: {
        clusters: number;
        to_archive: number;
        students_to_move: number;
        courses_to_move: number;
    };
}

export interface GroupMergeResult {
    clusters: number;
    archived: number;
    moved: Record<string, number>;
}

export const groupService = {
    /** Takrorlangan guruhlar ro'yxati. Hech nima yozmaydi. */
    previewDuplicates: async (): Promise<GroupDuplicatePreview> => {
        const response = await api.get<GroupDuplicatePreview>('/group/duplicates');
        return response.data;
    },

    /** Birlashtiradi: eski nusxa arxivga, uning hamma bog'lanishlari tirikka. */
    mergeDuplicates: async (groupIds: number[] = []): Promise<GroupMergeResult> => {
        const response = await api.post<GroupMergeResult>('/group/duplicates/merge', {
            group_ids: groupIds,
        });
        return response.data;
    },

    getGroups: async (page = 1, limit = 10, search = '', teacher_id?: number, faculty_id?: number, speciality_id?: number, includeHidden?: boolean) => {
        const params: any = { page, limit };
        if (includeHidden) params.include_hidden = true;
        if (search) params.name = search;
        if (teacher_id) params.teacher_id = teacher_id;
        if (faculty_id) params.faculty_id = faculty_id;
        if (speciality_id) params.speciality_id = speciality_id;

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
