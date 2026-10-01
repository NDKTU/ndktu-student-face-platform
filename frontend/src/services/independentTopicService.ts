import api from './api';

/**
 * Mustaqil ish mavzusi — fan boʻyicha talaba oʻzi oʻrganadigan mavzu.
 *
 * Uy vazifasidan farqi: muddat, topshirish va baho yoʻq. Bu sillabusdagi
 * roʻyxat — oʻqituvchi eʼlon qiladi, talaba koʻradi.
 */
export interface IndependentTopic {
    id: number;
    course_id: number;
    title: string;
    description?: string | null;
    /** Roʻyxatdagi tartib raqami. */
    position: number;
    created_at: string;
    updated_at: string;
}

export interface IndependentTopicListResponse {
    total: number;
    topics: IndependentTopic[];
}

export interface IndependentTopicRequest {
    title: string;
    description?: string | null;
    position?: number | null;
}

export const independentTopicService = {
    list: async (courseId: number): Promise<IndependentTopicListResponse> => {
        const response = await api.get<IndependentTopicListResponse>(
            `/course/${courseId}/independent-topics`,
        );
        return response.data;
    },

    create: async (courseId: number, data: IndependentTopicRequest): Promise<IndependentTopic> => {
        const response = await api.post<IndependentTopic>(
            `/course/${courseId}/independent-topics`,
            data,
        );
        return response.data;
    },

    update: async (topicId: number, data: IndependentTopicRequest): Promise<IndependentTopic> => {
        const response = await api.put<IndependentTopic>(
            `/course/independent-topics/${topicId}`,
            data,
        );
        return response.data;
    },

    remove: async (topicId: number): Promise<void> => {
        await api.delete(`/course/independent-topics/${topicId}`);
    },
};
