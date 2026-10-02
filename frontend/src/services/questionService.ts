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
    /** Qaysi darsga biriktirilgan. Bo'sh — fan bankidagi umumiy savol. */
    lesson_id?: number | null;
    /**
     * Savol biror testga olinganmi. Olingan bo'lsa o'chirib bo'lmaydi:
     * test tarkibi va talabalarning javoblari unga tayanadi.
     */
    in_quiz?: boolean;
    created_at?: string;
    updated_at?: string;
}

export type QuestionType = 'QUIZ' | 'TRUE_FALSE' | 'MULTI_SELECT' | 'TYPE_ANSWER' | 'PUZZLE';

export interface QuestionCreateRequest {
    subject_id: number;
    user_id: number;
    /**
     * Savol qaysi darsga qoʻshilyapti. Dars sahifasidan kelganda
     * toʻldiriladi — oʻsha darsning testi aynan shu savollardan yigʻiladi.
     */
    lesson_id?: number;
    /** Oraliq nazoratga alohida qoʻshilayotgan savol — faqat shu testniki. */
    quiz_id?: number;
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

/**
 * Blob javobini faylga saqlaydi. Nomi `Content-Disposition` dan olinadi.
 *
 * `headers` turi ataylab kengroq: axios u yerda `null` ham qaytarishi
 * mumkin, shuning uchun qiymat satr ekani alohida tekshiriladi.
 */
function saveXlsx(response: { data: BlobPart; headers: unknown }, fallbackName: string) {
    const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const raw = (response.headers as Record<string, unknown> | undefined)?.['content-disposition'];
    const match = typeof raw === 'string' ? raw.match(/filename="?(.+?)"?$/) : null;
    link.setAttribute('download', match ? match[1] : fallbackName);

    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const questionService = {
    getCatalog: async (search?: string) => {
        const response = await api.get<{ teachers: QuestionTeacherSummary[] }>('/question/catalog', {
            params: { search },
        });
        return response.data.teachers;
    },
    getQuestions: async (
        page = 1, limit = 10, text?: string, subject_id?: number, user_id?: number, lesson_id?: number,
        midterm_quiz_id?: number,
    ) => {
        const response = await api.get<QuestionListResponse>('/question/', {
            params: { page, limit, text, subject_id, user_id, lesson_id, midterm_quiz_id },
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

    uploadQuestions: async (file: File, subject_id: number, lesson_id?: number) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/question/upload_excel', formData, {
            // `lesson_id` dars sahifasidan keladi: yuklangan savollar oʻsha
            // darsniki boʻladi va dars testi aynan shulardan yigʻiladi.
            params: { subject_id, lesson_id },
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
        saveXlsx(response, 'savollar.xlsx');
    },

    /**
     * Import uchun bo'sh shablon. Serverdan olinadi, mijozda yig'ilmaydi:
     * ustun nomlari parser bilan bitta joyda turishi kerak
     * (`backend/.../question/excel_format.py`). Ilgari format ikki joyda
     * mustaqil ta'riflangani uchun eksport va import bir-biriga mos
     * kelmay qolgan edi.
     */
    downloadQuestionsExcelTemplate: async () => {
        const response = await api.get('/question/excel_template', { responseType: 'blob' });
        saveXlsx(response, 'savollar-shablon.xlsx');
    },
};
