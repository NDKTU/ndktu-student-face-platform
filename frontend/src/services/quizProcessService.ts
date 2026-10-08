import api from './api';
import { getToken } from './tokenStorage';
import { API_BASE_URL } from '@/config/env';
import type { ProctoringMode } from './quizService';

export interface QuestionDTO {
    id: number;
    text: string;
    /** Eski shakl — faqat klassik savolda to'ladi. */
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    /** Savol turi: QUIZ | TRUE_FALSE | MULTI_SELECT. */
    question_type?: string;
    /** Variantlar ko'rsatilgan tartibda — barcha turlar uchun umumiy shakl. */
    options?: string[];
    /** Bir nechta javob kutilyaptimi. */
    multiple?: boolean;
    /** Variantlarni to'g'ri tartibda joylashtirish kerakmi (PUZZLE). */
    ordered?: boolean;
    /** Javob matn bilan yoziladimi (TYPE_ANSWER). */
    free_text?: boolean;
}

export interface StartQuizRequest {
    quiz_id: number;
    pin: string;
}

export interface VerifyEntryFaceRequest {
    quiz_id: number;
    pin: string;
    /** Veb-kamera kadri, `data:image/jpeg;base64,...`. */
    image_base64: string;
}

export interface VerifyEntryFaceResponse {
    /** true — `startQuiz` endi ruxsat beradi (tasdiq bir necha daqiqa amal qiladi). */
    verified: boolean;
    status: 'ok' | 'no_face' | 'multiple_faces' | 'different_person' | 'no_reference';
    message: string;
}

export interface SubmittedAnswerDTO {
    question_id: number;
    answer_index: number;
    /** Bir nechta tanlangan o'rin (MULTI_SELECT) yoki tartib (PUZZLE). */
    answer_indexes?: number[];
    /** Yozilgan matn (TYPE_ANSWER). */
    text_answer?: string;
}

export interface StartQuizResponse {
    result_id: number;
    quiz_id: number;
    title: string;
    duration: number;
    proctoring_mode: ProctoringMode;
    questions: QuestionDTO[];
    image_url?: string;
    face_ws_token?: string;
    /** Остаток времени по часам сервера — таймер ведётся от него, а не от duration. */
    remaining_seconds: number;
    /** true, если это возвращение в уже начатую попытку. */
    resumed: boolean;
    /** Ответы, уже данные в этой попытке (при возобновлении). */
    submitted_answers: SubmittedAnswerDTO[];
    /** Qat'iy rejim: sahifadan chiqilsa urinish serverda yopiladi. */
    strict_mode?: boolean;
    /** Savol matni faqat «ko'rish» tugmasi bosilib turganda ko'rinadi. */
    hold_to_reveal?: boolean;
}

export interface SubmitAnswerRequest {
    result_id: number;
    question_id: number;
    /** Позиция выбранного варианта в показанном студенту порядке. */
    answer_index: number;
    /** Bir nechta to'g'ri javobli savolda — barcha tanlangan o'rinlar;
     *  tartib savolida — tanlangan ketma-ketlik. */
    answer_indexes?: number[];
    /** Javob matni (TYPE_ANSWER). */
    text_answer?: string;
}

export interface SubmitAnswerResponse {
    question_id: number;
    accepted: boolean;
}

export interface EndQuizRequest {
    quiz_id: number;
    result_id: number;
    cheating_detected?: boolean;
    reason?: string;
    cheating_image_url?: string;
}

export interface EndQuizResponse {
    total_questions: number;
    correct_answers: number;
    wrong_answers: number;
    grade: number;
    cheating_detected?: boolean;
    reason?: string;
}

/** Brauzer sezgan chiqish turi; sabab matnini server tanlaydi (`strict.py`). */
export type LeaveReason = 'hidden' | 'pagehide' | 'blur' | 'split';

/**
 * Qat'iy test: «sahifadan chiqdi» so'rovi.
 *
 * Axios emas, `fetch` + `keepalive`: sahifa fonga ketayotganda yoki
 * yopilayotganda oddiy so'rov uziladi, `keepalive` esa brauzer uni
 * sahifa yo'qolgandan keyin ham yetkazadi. Xato yutiladi — yetib
 * bormasa, serverdagi heartbeat tekshiruvi baribir urinishni yopadi.
 */
export async function keepaliveLeave<T>(path: string, body: object): Promise<T | null> {
    try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });
        return response.ok ? ((await response.json()) as T) : null;
    } catch {
        return null;
    }
}

export const quizProcessService = {
    startQuiz: async (data: StartQuizRequest) => {
        const response = await api.post<StartQuizResponse>('/quiz_process/start_quiz', data);
        return response.data;
    },

    /** `face_entry` testiga kirishdagi yuz tekshiruvi — qarorni server qiladi. */
    verifyEntryFace: async (data: VerifyEntryFaceRequest) => {
        const response = await api.post<VerifyEntryFaceResponse>('/quiz_process/verify_entry_face', data);
        return response.data;
    },

    submitAnswer: async (data: SubmitAnswerRequest) => {
        const response = await api.post<SubmitAnswerResponse>('/quiz_process/submit_answer', data);
        return response.data;
    },

    endQuiz: async (data: EndQuizRequest) => {
        const response = await api.post<EndQuizResponse>('/quiz_process/end_quiz', data);
        return response.data;
    },

    /** Qat'iy test: sahifa hali ochiq. To'xtasa, server urinishni yopadi. */
    heartbeat: async (result_id: number) => {
        const response = await api.post<{ alive: boolean }>('/quiz_process/heartbeat', { result_id });
        return response.data;
    },

    /** Qat'iy test: talaba sahifadan chiqdi. */
    sendLeave: (result_id: number, reason: LeaveReason) =>
        keepaliveLeave<EndQuizResponse>('/quiz_process/leave', { result_id, reason }),
};
