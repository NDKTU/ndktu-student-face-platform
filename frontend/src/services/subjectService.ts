import api from './api';

export interface Subject {
    id: number;
    name: string;
    /**
     * O'quv reja — bir xil nomli fanlarni aynan shu ajratadi: EPMOS bitta
     * fanni har bir reja uchun alohida yozuv qilib beradi. Qo'lda kiritilgan
     * fanlarda bo'sh.
     */
    curriculum_id?: number | null;
    curriculum?: { id: number; name: string } | null;
    /** «kuzgi» / «bahorgi» — bitta reja ichidagi takrorlarni ajratadi. */
    semester?: string | null;
    created_at: string;
    updated_at: string;
    // Признаки зеркала EduPlan: если источник задан, запись не редактируется.
    external_id?: string | null;
    external_source?: string | null;
    synced_at?: string | null;
    is_active?: boolean;
    /** Admin yashirgan. `is_active` dan alohida: u sinxronizatsiyaniki. */
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    // is_hidden?: boolean;
}

export interface SubjectListResponse {
    total: number;
    page: number;
    limit: number;
    subjects: Subject[];
}

export interface TeacherSubjectTeacherInfo {
    id: number;
    subject_id: number;
    subject: Subject;
}

export interface TeacherAssignedSubjectsResponse {
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    third_name: string;
    full_name: string;
    subject_teachers: TeacherSubjectTeacherInfo[];
}

export interface SubjectListParams {
    sort_by?: 'id' | 'name' | 'created_at';
    order?: 'asc' | 'desc';
}

export const subjectService = {
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    getSubjects: async (
        page = 1,
        limit = 10,
        search = '',
        teacher_id?: number,
        sort?: SubjectListParams,
    ) => {
        const params: any = { page, limit };
        // if (includeHidden) params.include_hidden = true;
        if (search) params.name = search;
        if (teacher_id) params.teacher_id = teacher_id;
        // Saralash serverda: sahifa ichida tartiblash butun ro'yxatni
        // tartibsiz qoldirardi.
        if (sort?.sort_by) {
            params.sort_by = sort.sort_by;
            params.order = sort.order ?? 'asc';
        }

        const response = await api.get<SubjectListResponse>('/subject/', { params });
        return response.data;
    },

    getAssignedSubjects: async (userId: number): Promise<TeacherAssignedSubjectsResponse> => {
        const response = await api.get<TeacherAssignedSubjectsResponse>(`/teacher/assigned_subjects/by-user/${userId}`);
        return response.data;
    },

    getSubjectById: async (id: number): Promise<Subject> => {
        const response = await api.get<Subject>(`/subject/${id}`);
        return response.data;
    },

    // EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
    // olindi — backendda ham bu endpointlar kommentda.
    // createSubject: async (data: { name: string }) => {
    //     const response = await api.post('/subject/', data);
    //     return response.data;
    // },
    //
    // updateSubject: async (id: number, data: { name: string }) => {
    //     const response = await api.put(`/subject/${id}`, data);
    //     return response.data;
    // },
    //
    // deleteSubject: async (id: number, force?: boolean) => {
    //     const url = force ? `/subject/${id}?force=true` : `/subject/${id}`;
    //     await api.delete(url);
    // },
};
