import api from './api';

export interface Question {
    id: number;
    subject_id: number;
    user_id: number;
    subject_name?: string;
    username?: string;
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option?: string; // Optional as not explicitly requested, but likely needed
    question_type?: QuestionType;
    payload?: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
}

export type QuestionType = 'QUIZ' | 'TRUE_FALSE' | 'MULTI_SELECT' | 'TYPE_ANSWER' | 'PUZZLE';

export interface QuestionCreateRequest {
    subject_id: number;
    user_id: number;
    text: string;
    /** Standart tur — to'rt variant, bitta to'g'ri javob. */
    question_type?: QuestionType;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option?: string;
    /**
     * Yangi turlar uchun ma'lumot:
     *   TRUE_FALSE   -> { correct: boolean }
     *   MULTI_SELECT -> { options: string[]; correct: number[] }
     *   TYPE_ANSWER  -> { answers: string[] }
     *   PUZZLE       -> { items: string[] }  // to'g'ri tartib
     */
    payload?: Record<string, unknown>;
}

export interface QuestionListResponse {
    total: number;
    page: number;
    limit: number;
    questions: Question[];
}

export interface QuestionSubjectSummary {
    subject_id: number;
    subject_name: string;
    question_count: number;
}

export interface QuestionTeacherSummary {
    teacher_user_id: number;
    username: string;
    full_name?: string | null;
    kafedra_id?: number | null;
    kafedra_name?: string | null;
    question_count: number;
    subjects: QuestionSubjectSummary[];
}

export const questionService = {
    getCatalog: async (search?: string) => {
        const response = await api.get<{ teachers: QuestionTeacherSummary[] }>('/question/catalog', {
            params: { search },
        });
        return response.data.teachers;
    },
    getQuestions: async (page = 1, limit = 10, text?: string, subject_id?: number, user_id?: number) => {
        const response = await api.get<QuestionListResponse>('/question/', {
            params: { page, limit, text, subject_id, user_id },
        });
        return response.data;
    },

    getQuestionById: async (id: number): Promise<Question> => {
        const response = await api.get<Question>(`/question/${id}`);
        return response.data;
    },

    createQuestion: async (data: QuestionCreateRequest) => {
        const response = await api.post('/question/', data);
        return response.data;
    },

    updateQuestion: async (id: number, data: QuestionCreateRequest) => {
        const response = await api.put(`/question/${id}`, data);
        return response.data;
    },

    deleteQuestion: async (id: number) => {
        await api.delete(`/question/${id}`);
    },

    uploadQuestions: async (file: File, subject_id: number) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/question/upload_excel', formData, {
            params: { subject_id },
        });
        return response.data;
    },

    uploadImage: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post<{ url: string }>('/question/upload_image', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },
    
    bulkDeleteQuestions: async (data: { subject_id: number; user_id: number }) => {
        const response = await api.delete('/question/bulk/subject-user', { data });
        return response.data;
    },

    downloadQuestionsExcel: async (params?: { subject_id?: number; user_id?: number; text?: string }) => {
        const response = await api.get('/question/download_excel', {
            params,
            responseType: 'blob',
        });

        // Trigger browser download
        const blob = new Blob([response.data], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        // Extract filename from Content-Disposition header or use default
        const contentDisposition = response.headers['content-disposition'];
        let filename = 'savollar.xlsx';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?(.+?)"?$/);
            if (match) filename = match[1];
        }

        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    },
};
