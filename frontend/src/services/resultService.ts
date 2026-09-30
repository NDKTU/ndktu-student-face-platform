import api from './api';
import type { User } from '@/types/auth';
import type { Quiz } from '@/services/quizService';

export interface Result {
    id: number;
    grade: number;
    correct_answers: number;
    wrong_answers: number;
    quiz_id: number;
    user_id: number;
    subject_id?: number;
    group_id?: number;
    created_at: string;
    user?: User;
    quiz?: Quiz;
    subject?: { id: number; name: string };
    group?: { id: number; name: string };
    student_id?: string;
    student_name?: string;
    cheating_detected?: boolean;
    cheating_image_url?: string | null;
    reason_for_stop?: string | null;
}

export interface ResultListResponse {
    total: number;
    page: number;
    limit: number;
    results: Result[];
}

/** Фильтры списка результатов. Объект, а не позиционные аргументы:
 *  их стало девять, и добавление факультета/кафедры в хвост было бы нечитаемым. */
export interface ResultListParams {
    page?: number;
    limit?: number;
    user_id?: number;
    grade?: number;
    group_id?: number;
    subject_id?: number;
    quiz_id?: number;
    /** Факультет студента (по группе результата). */
    faculty_id?: number;
    /** Кафедра автора теста. */
    kafedra_id?: number;
    username?: string;
    sort_dir?: string;
}

export const resultService = {
    getResults: async (params: ResultListParams = {}) => {
        const response = await api.get<ResultListResponse>('/result/', {
            params: { page: 1, limit: 10, ...params },
        });
        return response.data;
    },

    getUserResults: async (userId: number, params: Omit<ResultListParams, 'user_id'> = {}) =>
        resultService.getResults({ ...params, user_id: userId }),
    getResultById: async (id: number): Promise<Result> => {
        const response = await api.get<Result>(`/result/${id}`);
        return response.data;
    },

    deleteResult: async (id: number): Promise<void> => {
        await api.delete(`/result/${id}`);
    },
};
