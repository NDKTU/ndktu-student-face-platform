import api from './api';

export type ProctoringMode = 'face' | 'standard';

export interface Quiz {
    id: number;
    title: string;
    question_number: number;
    duration: number; // in minutes
    pin: string;
    user_id?: number;
    group_id?: number;
    subject_id?: number;
    is_active: boolean;
    proctoring_mode: ProctoringMode;
    attempt?: number | null;
    created_at: string;
    updated_at: string;
}

export interface QuizCreateRequest {
    title: string;
    question_number: number;
    duration: number;
    pin: string;
    user_id?: number | null;
    group_id?: number | null;
    subject_id?: number | null;
    is_active: boolean;
    proctoring_mode: ProctoringMode;
    attempt?: number | null;
}

export interface QuizListResponse {
    total: number;
    page: number;
    limit: number;
    quizzes: Quiz[];
}

export const quizService = {
    getQuizzes: async (page = 1, limit = 10, title?: string, is_active?: boolean, user_id?: number, group_id?: number, subject_id?: number, sort_dir?: string) => {
        const response = await api.get<QuizListResponse>('/quiz/', {
            params: { page, limit, title, is_active, user_id, group_id, subject_id, sort_dir },
        });
        return response.data;
    },

    getActiveQuizzes: async (page = 1, limit = 10, title?: string, user_id?: number, group_id?: number, subject_id?: number, sort_dir?: string) => {
        const response = await api.get<QuizListResponse>('/quiz/active', {
            params: { page, limit, title, user_id, group_id, subject_id, sort_dir },
        });
        return response.data;
    },

    getQuizById: async (id: number): Promise<Quiz> => {
        const response = await api.get<Quiz>(`/quiz/${id}`);
        return response.data;
    },

    createQuiz: async (data: QuizCreateRequest) => {
        const response = await api.post('/quiz/', data);
        return response.data;
    },

    updateQuiz: async (id: number, data: QuizCreateRequest) => {
        const response = await api.put(`/quiz/${id}`, data);
        return response.data;
    },

    deleteQuiz: async (id: number, force?: boolean) => {
        const url = force ? `/quiz/${id}?force=true` : `/quiz/${id}`;
        await api.delete(url);
    },



    repeatQuiz: async (id: number): Promise<Quiz> => {
        const response = await api.post<Quiz>(`/quiz/${id}/repeat`);
        return response.data;
    },
};
