import api from './api';

/**
 * Umumiy test — fan, guruh va ma'ruzachiga bog'lanmagan oddiy test.
 * Savollari testning o'ziniki, uni istalgan foydalanuvchi ishlaydi,
 * natijalari esa oddiy test natijalaridan alohida saqlanadi
 * (`backend/app/modules/general_test`).
 */

export type OptionLetter = 'a' | 'b' | 'c' | 'd';

export interface GeneralTestSummary {
    id: number;
    title: string;
    description: string | null;
    duration: number;
    attempt_limit: number;
    is_active: boolean;
    question_count: number;
    attempt_count: number;
    created_at: string;
}

export interface GeneralTestQuestion {
    id: number;
    test_id: number;
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: OptionLetter;
    order: number;
}

export interface GeneralTestDetail extends GeneralTestSummary {
    questions: GeneralTestQuestion[];
}

export interface GeneralTestListResponse {
    total: number;
    page: number;
    limit: number;
    tests: GeneralTestSummary[];
}

export interface GeneralTestPayload {
    title: string;
    description: string | null;
    duration: number;
    attempt_limit: number;
    is_active: boolean;
}

export interface QuestionPayload {
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: OptionLetter;
}

export interface UploadResponse {
    created: number;
    warnings: string[];
}

export interface AvailableTest {
    id: number;
    title: string;
    description: string | null;
    duration: number;
    attempt_limit: number;
    question_count: number;
    attempts_used: number;
    in_progress_attempt_id: number | null;
    best_score: number | null;
}

export interface TakeQuestion {
    id: number;
    text: string;
    options: { key: OptionLetter; text: string }[];
    selected: OptionLetter | null;
}

export interface AttemptState {
    attempt_id: number;
    test_id: number;
    title: string;
    remaining_seconds: number;
    questions: TakeQuestion[];
}

export interface AttemptResult {
    attempt_id: number;
    test_id: number;
    title: string;
    total_questions: number;
    correct_answers: number;
    score: number;
    started_at: string;
    finished_at: string | null;
}

export interface ResultRow {
    attempt_id: number;
    test_id: number;
    test_title: string;
    user_id: number | null;
    full_name: string;
    username: string | null;
    group_name: string | null;
    user_kind: 'student' | 'teacher' | 'boshqa';
    total_questions: number;
    correct_answers: number;
    score: number;
    started_at: string;
    finished_at: string | null;
}

export interface ResultListResponse {
    total: number;
    page: number;
    limit: number;
    results: ResultRow[];
}

export interface ResultFilter {
    test_id?: number;
    search?: string;
    page?: number;
    limit?: number;
}

function saveXlsx(data: BlobPart, name: string) {
    const url = window.URL.createObjectURL(
        new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const generalTestService = {
    // ── Boshqaruv ────────────────────────────────────────────────────────
    list: async (page = 1, limit = 20, search?: string) =>
        (await api.get<GeneralTestListResponse>('/general-test/', { params: { page, limit, search: search || undefined } })).data,
    get: async (id: number) => (await api.get<GeneralTestDetail>(`/general-test/${id}`)).data,
    create: async (data: GeneralTestPayload) => (await api.post<GeneralTestDetail>('/general-test/', data)).data,
    update: async (id: number, data: Partial<GeneralTestPayload>) =>
        (await api.put<GeneralTestDetail>(`/general-test/${id}`, data)).data,
    remove: async (id: number) => {
        await api.delete(`/general-test/${id}`);
    },

    createQuestion: async (testId: number, data: QuestionPayload) =>
        (await api.post<GeneralTestQuestion>(`/general-test/${testId}/question`, data)).data,
    updateQuestion: async (id: number, data: QuestionPayload) =>
        (await api.put<GeneralTestQuestion>(`/general-test/question/${id}`, data)).data,
    removeQuestion: async (id: number) => {
        await api.delete(`/general-test/question/${id}`);
    },
    uploadExcel: async (testId: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return (await api.post<UploadResponse>(`/general-test/${testId}/upload_excel`, formData)).data;
    },
    downloadTemplate: async () => {
        const response = await api.get('/general-test/excel_template', { responseType: 'blob' });
        saveXlsx(response.data, 'savollar-shablon.xlsx');
    },

    // ── Natijalar ────────────────────────────────────────────────────────
    results: async (filter: ResultFilter) =>
        (await api.get<ResultListResponse>('/general-test/results', { params: filter })).data,
    exportResults: async (filter: ResultFilter) => {
        const response = await api.get('/general-test/results/export', {
            params: { test_id: filter.test_id, search: filter.search },
            responseType: 'blob',
        });
        saveXlsx(response.data, 'umumiy-test-natijalari.xlsx');
    },
    removeResult: async (attemptId: number) => {
        await api.delete(`/general-test/results/${attemptId}`);
    },

    // ── Ishlash ──────────────────────────────────────────────────────────
    available: async () => (await api.get<{ tests: AvailableTest[] }>('/general-test/available')).data.tests,
    myResults: async () => (await api.get<{ results: AttemptResult[] }>('/general-test/my-results')).data.results,
    start: async (testId: number) => (await api.post<AttemptState>(`/general-test/${testId}/start`)).data,
    getAttempt: async (attemptId: number) => (await api.get<AttemptState>(`/general-test/attempt/${attemptId}`)).data,
    answer: async (attemptId: number, questionId: number, option: OptionLetter) => {
        await api.post(`/general-test/attempt/${attemptId}/answer`, { question_id: questionId, option });
    },
    finish: async (attemptId: number) =>
        (await api.post<AttemptResult>(`/general-test/attempt/${attemptId}/finish`)).data,
};
