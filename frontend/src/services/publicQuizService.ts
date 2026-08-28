import axios from 'axios';
import { API_BASE_URL } from '@/config/env';

/**
 * Ochiq test — tizimga kirmagan odam uchun.
 *
 * Alohida axios nusxasi: asosiy `api` interseptori sessiya tokenini qo'shadi
 * va 401 da `/login` ga otadi. Mehmonda sessiya yo'q, uni login sahifasiga
 * uloqtirish esa test o'rtasida barcha javoblarini yo'qotish demakdir.
 */
const publicApi = axios.create({ baseURL: API_BASE_URL });

export interface PublicQuestion {
    id: number;
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    /** Variantlar ko'rsatilgan tartibda — barcha turlar uchun umumiy shakl. */
    options?: string[];
    /** Bir nechta javob kutilyaptimi (MULTI_SELECT). */
    multiple?: boolean;
}

export interface PublicStartResponse {
    guest_token: string;
    result_id: number;
    quiz_id: number;
    title: string;
    duration: number;
    remaining_seconds: number;
    questions: PublicQuestion[];
}

export interface PublicFinishResponse {
    total_questions: number;
    correct_answers: number;
    wrong_answers: number;
    grade: number;
    full_name?: string | null;
    title?: string | null;
}

export const publicQuizService = {
    start: async (pin: string, fullName: string) => {
        const response = await publicApi.post<PublicStartResponse>('/public/quiz/start', {
            pin,
            full_name: fullName,
        });
        return response.data;
    },

    answer: async (token: string, questionId: number, positions: number[]) => {
        await publicApi.post(
            '/public/quiz/answer',
            {
                question_id: questionId,
                answer_index: positions[0],
                // Bir nechta to'g'ri javobli savolda butun to'plam yuboriladi.
                answer_indexes: positions.length > 1 ? positions : undefined,
            },
            { headers: { 'X-Guest-Token': token } },
        );
    },

    finish: async (token: string) => {
        const response = await publicApi.post<PublicFinishResponse>(
            '/public/quiz/finish',
            {},
            { headers: { 'X-Guest-Token': token } },
        );
        return response.data;
    },
};
