import api from './api';

/**
 * Mashg'ulot turi mavzu darajasida tanlanadi: o'quv rejada soatlar aynan shu
 * kesimda bo'linadi, mavzu ichidagi darslar esa turini shundan meros oladi.
 */
export type CourseTopicType = 'lecture' | 'lab' | 'seminar';

export const TOPIC_TYPE_OPTIONS: { value: CourseTopicType; label: string }[] = [
    { value: 'lecture', label: "Ma'ruza" },
    { value: 'lab', label: 'Laboratoriya' },
    { value: 'seminar', label: 'Seminar' },
];

export const TOPIC_TYPE_LABELS: Record<CourseTopicType, string> = {
    lecture: "Ma'ruza",
    lab: 'Laboratoriya',
    seminar: 'Seminar',
};

/** Turi belgilanmagan eski mavzular ham bor — shuning uchun `undefined` qaytadi. */
export const topicTypeLabel = (value?: string | null) =>
    value ? TOPIC_TYPE_LABELS[value as CourseTopicType] ?? value : undefined;

export interface CourseTopic {
    id: number;
    course_id: number;
    title: string;
    /** Eski mavzularda bo'sh. */
    topic_type?: CourseTopicType | null;
    order_index: number;
    lesson_count: number;
    created_at: string;
    updated_at: string;
}

export interface CourseTopicCreateRequest {
    course_id: number;
    topic_type: CourseTopicType;
    /** Odatda yuborilmaydi: nomni server turdan yig'adi. */
    title?: string;
    order_index?: number;
}

export interface CourseTopicUpdateRequest {
    title?: string;
    topic_type?: CourseTopicType;
    order_index?: number;
}

export const courseTopicService = {
    list: async (courseId: number) => {
        const response = await api.get<{ topics: CourseTopic[] }>('/course-topic/', {
            params: { course_id: courseId },
        });
        return response.data.topics;
    },
    create: async (data: CourseTopicCreateRequest) => {
        const response = await api.post<CourseTopic>('/course-topic/', data);
        return response.data;
    },
    update: async (id: number, data: CourseTopicUpdateRequest) => {
        const response = await api.put<CourseTopic>(`/course-topic/${id}`, data);
        return response.data;
    },
    delete: async (id: number) => {
        await api.delete(`/course-topic/${id}`);
    },
};
