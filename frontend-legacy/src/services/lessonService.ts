import api from './api';

export interface LessonSubjectInfo {
    id: number;
    name: string;
}

export interface LessonSubjectTeacherInfo {
    id: number;
    subject_id: number;
    teacher_id: number;
    subject?: LessonSubjectInfo | null;
}

export interface LessonGroupInfo {
    id: number;
    name: string;
}

export type LessonType = 'lecture' | 'seminar' | 'independent' | 'lab';

export interface Lesson {
    id: number;
    subject_teacher_id: number;
    group_id: number;
    sinf_id?: number | null;
    topic_id?: number | null;
    lesson_type?: LessonType | null;
    topic: string;
    date: string;
    description?: string | null;
    created_at: string;
    updated_at: string;
    subject_teacher?: LessonSubjectTeacherInfo | null;
    group?: LessonGroupInfo | null;
}

export interface LessonListResponse {
    total: number;
    page: number;
    limit: number;
    lessons: Lesson[];
}

export interface LessonCreateRequest {
    subject_teacher_id?: number;
    group_id: number;
    sinf_id?: number | null;
    topic_id?: number | null;
    lesson_type?: LessonType | null;
    topic: string;
    date: string;
    description?: string | null;
}

export interface LessonUpdateRequest {
    subject_teacher_id?: number;
    group_id?: number;
    sinf_id?: number | null;
    topic_id?: number | null;
    lesson_type?: LessonType | null;
    topic?: string;
    date?: string;
    description?: string | null;
}

export interface LessonListParams {
    subject_teacher_id?: number;
    group_id?: number;
    sinf_id?: number;
    topic_id?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
}

export type LessonAttendance = 'present' | 'absent' | 'late';

export interface LessonResultUserInfo {
    id: number;
    username: string;
}

export interface LessonResult {
    id: number;
    lesson_id: number;
    user_id: number;
    attendance: LessonAttendance;
    grade?: number | null;
    notes?: string | null;
    created_at: string;
    updated_at: string;
    user?: LessonResultUserInfo | null;
}

export interface LessonResultListResponse {
    total: number;
    results: LessonResult[];
}

export interface LessonResultUpsertItem {
    user_id: number;
    attendance: LessonAttendance;
    grade?: number | null;
    notes?: string | null;
}

export const lessonService = {
    list: async (params?: LessonListParams) => {
        const response = await api.get<LessonListResponse>('/lesson/', { params });
        return response.data;
    },
    getById: async (id: number) => {
        const response = await api.get<Lesson>(`/lesson/${id}`);
        return response.data;
    },
    create: async (data: LessonCreateRequest) => {
        const response = await api.post<Lesson>('/lesson/', data);
        return response.data;
    },
    update: async (id: number, data: LessonUpdateRequest) => {
        const response = await api.put<Lesson>(`/lesson/${id}`, data);
        return response.data;
    },
    delete: async (id: number) => {
        await api.delete(`/lesson/${id}`);
    },
    listResults: async (lessonId: number) => {
        const response = await api.get<LessonResultListResponse>(`/lesson/${lessonId}/results`);
        return response.data;
    },
    upsertResults: async (lessonId: number, items: LessonResultUpsertItem[]) => {
        const response = await api.put<LessonResultListResponse>(
            `/lesson/${lessonId}/results`,
            { items },
        );
        return response.data;
    },
};
