import api from './api';
import type { ProctoringMode } from './quizService';

export interface QuestionDTO {
    id: number;
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
}

export interface StartQuizRequest {
    quiz_id: number;
    pin: string;
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
}

export interface SubmitAnswerRequest {
    result_id: number;
    question_id: number;
    answer: string;
}

export interface SubmitAnswerResponse {
    question_id: number;
    is_correct: boolean;
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

export const quizProcessService = {
    startQuiz: async (data: StartQuizRequest) => {
        const response = await api.post<StartQuizResponse>('/quiz_process/start_quiz', data);
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
};
