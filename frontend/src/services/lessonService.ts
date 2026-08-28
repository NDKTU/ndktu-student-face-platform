import api from './api';

export interface LessonSubjectInfo {
    id: number;
    name: string;
}

export interface LessonTeacherSubjectInfo {
    id: number;
    subject_id: number;
    teacher_id: number;
    subject?: LessonSubjectInfo | null;
}

export interface LessonGroupInfo {
    id: number;
    name: string;
}

export interface LessonTopicInfo {
    id: number;
    title: string;
    order_index: number;
}

export interface LessonResourceInfo {
    id: number;
    resource_type: string;
    title: string;
    file_url?: string | null;
    link_url?: string | null;
    order_index: number;
}

export type LessonType = 'lecture' | 'seminar' | 'independent' | 'lab';

export interface Lesson {
    id: number;
    teacher_subject_id: number;
    group_id: number;
    course_id: number;
    sinf_id?: number | null;
    topic_id?: number | null;
    lesson_type?: LessonType | null;
    duration_minutes?: number | null;
    topic: string;
    date: string;
    description?: string | null;
    created_at: string;
    updated_at: string;
    teacher_subject?: LessonTeacherSubjectInfo | null;
    group?: LessonGroupInfo | null;
    course_topic?: LessonTopicInfo | null;
    resources: LessonResourceInfo[];
}

export interface LessonListResponse {
    total: number;
    page: number;
    limit: number;
    lessons: Lesson[];
}

export interface LessonCreateRequest {
    teacher_subject_id?: number;
    /** Не нужен для курса с одной группой — бэкенд подставит её сам. */
    group_id?: number;
    course_id?: number;
    sinf_id?: number | null;
    topic_id?: number | null;
    lesson_type?: LessonType | null;
    duration_minutes?: number | null;
    topic: string;
    /** Не передаём из формы курса — бэкенд проставит сегодняшнюю дату. */
    date?: string;
    description?: string | null;
}

export interface LessonUpdateRequest {
    teacher_subject_id?: number;
    group_id?: number;
    course_id?: number;
    sinf_id?: number | null;
    topic_id?: number | null;
    lesson_type?: LessonType | null;
    duration_minutes?: number | null;
    topic?: string;
    date?: string;
    description?: string | null;
}

export interface LessonListParams {
    teacher_subject_id?: number;
    group_id?: number;
    course_id?: number;
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
    /** `force` — bog'langan vazifalar bilan birga o'chirishga rozilik. */
    delete: async (id: number, force?: boolean) => {
        await api.delete(force ? `/lesson/${id}?force=true` : `/lesson/${id}`);
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
