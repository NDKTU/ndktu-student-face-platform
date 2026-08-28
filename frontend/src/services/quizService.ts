import api from './api';

export type ProctoringMode = 'face' | 'standard';

/** Nazorat turi — bekenddagi `QuizType` bilan bir xil. */
export type QuizType = 'LESSON_QUIZ' | 'SEMESTER_FINAL' | 'YEAR_PROMOTION' | 'PUBLIC_FREE';

export const QUIZ_TYPE_LABELS: Record<QuizType, string> = {
    LESSON_QUIZ: 'Dars testi',
    SEMESTER_FINAL: 'Semestr yakuni',
    YEAR_PROMOTION: 'Kursdan kursga',
    PUBLIC_FREE: 'Ochiq test',
};

export interface Quiz {
    id: number;
    title: string;
    question_number: number;
    duration: number; // in minutes
    pin: string;
    /** Ma'ruzachi: savollar uning bankidan yig'iladi. */
    lecturer_id?: number | null;
    /** Testni yaratgan tashkilotchi. */
    created_by_user_id?: number | null;
    /** @deprecated `lecturer_id` bilan bir xil qiymat, eski klientlar uchun qoldirilgan. */
    user_id?: number;
    group_id?: number;
    subject_id?: number;
    /** Test qaysi darsga biriktirilgani — dars sahifasidan tuzilgan bo'lsa. */
    lesson_id?: number | null;
    is_active: boolean;
    proctoring_mode: ProctoringMode;
    quiz_type?: QuizType;
    attempt?: number | null;
    created_at: string;
    updated_at: string;
}

export interface QuizCreateRequest {
    /** Bo'sh qoldirilsa server fan, guruh, sana va semestrdan yig'adi. */
    title?: string;
    question_number: number;
    duration: number;
    pin: string;
    /** Ma'ruzachi. Tashkilotchi tanlaydi; savollar shu o'qituvchining bankidan olinadi. */
    lecturer_id?: number | null;
    group_id?: number | null;
    subject_id?: number | null;
    /** Berilsa, guruh/fan/ma'ruzachi darsdan to'ldiriladi. */
    lesson_id?: number | null;
    /** Faqat sarlavhaga kiradi — quizzes jadvalida alohida ustun yo'q. */
    semester_number?: number | null;
    is_active: boolean;
    proctoring_mode: ProctoringMode;
    quiz_type?: QuizType;
    attempt?: number | null;
}

export interface AvailableQuestionsResponse {
    lecturer_id: number;
    subject_id: number;
    available: number;
}

export interface QuizListResponse {
    total: number;
    page: number;
    limit: number;
    quizzes: Quiz[];
}

export interface QuizCatalogSubject {
    subject_id: number;
    subject_name: string;
    quiz_count: number;
    active_count: number;
}

export interface QuizCatalogFaculty {
    faculty_id: number;
    faculty_name: string;
    quiz_count: number;
    active_count: number;
    subjects: QuizCatalogSubject[];
}

export interface QuizQuestionAnalytics {
    question_id: number;
    question_text: string;
    answer_count: number;
    correct_count: number;
    wrong_count: number;
    correct_percent: number;
}

export interface QuizAnalytics {
    quiz_id: number;
    total_students: number;
    submitted_count: number;
    average_grade?: number | null;
    minimum_grade?: number | null;
    maximum_grade?: number | null;
    average_duration_seconds?: number | null;
    questions: QuizQuestionAnalytics[];
}

/** Фильтры списка тестов — объектом: позиционных было восемь, а список
 *  стал плоским и получил ещё фильтр по факультету. */
export interface QuizListParams {
    page?: number;
    limit?: number;
    title?: string;
    is_active?: boolean;
    user_id?: number;
    group_id?: number;
    subject_id?: number;
    lesson_id?: number;
    faculty_id?: number;
    quiz_type?: QuizType;
    sort_dir?: string;
}

export const quizService = {
    getCatalog: async () => {
        const response = await api.get<{ faculties: QuizCatalogFaculty[] }>('/quiz/catalog');
        return response.data.faculties;
    },

    getAnalytics: async (id: number): Promise<QuizAnalytics> => {
        const response = await api.get<QuizAnalytics>(`/quiz/${id}/analytics`);
        return response.data;
    },

    getQuizzes: async (params: QuizListParams = {}) => {
        const response = await api.get<QuizListResponse>('/quiz/', {
            params: { page: 1, limit: 10, ...params },
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

    /**
     * Ma'ruzachining shu fan bo'yicha bankida nechta savol borligini qaytaradi.
     * Faqat son qaytadi: tashkilotchi savollarning matnini ko'rmaydi.
     */
    getAvailableQuestions: async (lecturer_id: number, subject_id: number) => {
        const response = await api.get<AvailableQuestionsResponse>('/quiz/available-questions', {
            params: { lecturer_id, subject_id },
        });
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
