import api from './api';

export interface CourseTopic {
    id: number;
    course_id: number;
    title: string;
    order_index: number;
    lesson_count: number;
    created_at: string;
    updated_at: string;
}

export interface CourseTopicCreateRequest {
    course_id: number;
    title: string;
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
    update: async (id: number, data: Partial<Pick<CourseTopic, 'title' | 'order_index'>>) => {
        const response = await api.put<CourseTopic>(`/course-topic/${id}`, data);
        return response.data;
    },
    delete: async (id: number) => {
        await api.delete(`/course-topic/${id}`);
    },
};
