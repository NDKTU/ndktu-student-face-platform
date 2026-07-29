import api from './api';

export interface UserAnswerQuestion {
    id: number;
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
}

export interface UserAnswer {
    id: number;
    user_id?: number;
    quiz_id?: number;
    question_id?: number;
    answer?: string;
    correct_answer?: string | null;
    is_correct: boolean;
    created_at: string;
    updated_at: string;
    question?: UserAnswerQuestion;
}

export interface UserAnswerListResponse {
    total: number;
    page: number;
    limit: number;
    answers: UserAnswer[];
}

export const userAnswerService = {
    getUserAnswers: async (params: {
        page?: number;
        limit?: number;
        user_id?: number;
        quiz_id?: number;
        result_id?: number;
    }) => {
        const response = await api.get<UserAnswerListResponse>('/user_answers/', {
            params,
        });
        return response.data;
    },
};
