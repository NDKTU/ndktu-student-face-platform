import api from './api';

export type QuestionType = 'text' | 'true_false' | 'scale' | 'image_stimulus' | 'image_choice' | 'multi_choice';

export interface QuestionResponse {
    id: number;
    method_id: number;
    question_type: QuestionType;
    content: Record<string, unknown>;
    options: Array<Record<string, unknown>> | null;
    order: number;
    category: string | null;
    created_at: string;
    updated_at: string;
}

export interface MethodResponse {
    id: number;
    name: string;
    description: string;
    instruction: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    questions: QuestionResponse[];
}

export interface MethodListResponse {
    total: number;
    page: number;
    limit: number;
    methods: MethodResponse[];
}

export interface MethodCreateRequest {
    name: string;
    description: string;
    instruction: Record<string, unknown>;
}

export interface MethodUpdateRequest {
    name?: string;
    description?: string;
    instruction?: Record<string, unknown>;
}

export interface QuestionCreateRequest {
    method_id: number;
    question_type: QuestionType;
    content: Record<string, unknown>;
    options?: Array<Record<string, unknown>> | null;
    order?: number;
    category?: string | null;
}

export interface QuestionUpdateRequest {
    question_type?: QuestionType;
    content?: Record<string, unknown>;
    options?: Array<Record<string, unknown>> | null;
    order?: number;
    category?: string | null;
}

export interface AnswerItem {
    question_id: number;
    value: boolean | number | string;
}

export interface TestSubmitRequest {
    answers: AnswerItem[];
}

/**
 * Testni topshirgan foydalanuvchi. Talaba bo'lmasa (o'qituvchi ham
 * topshirishi mumkin) talaba maydonlari bo'sh keladi.
 */
export interface TestResultUserInfo {
    id: number;
    username: string;
    full_name?: string | null;
    is_student?: boolean;
    student_id_number?: string | null;
    phone?: string | null;
    gender?: string | null;
    group_id?: number | null;
    group_name?: string | null;
    course?: number | null;
    faculty_id?: number | null;
    faculty_name?: string | null;
    speciality?: string | null;
    education_form?: string | null;
}

export interface ResultListParams {
    method_id?: number;
    faculty_id?: number;
    group_id?: number;
    course?: number;
    /** F.I.Sh., login yoki talaba ID raqami. */
    search?: string;
    page?: number;
    limit?: number;
}

/** Natijalar filtri: faqat natijasi bor fakultet va guruhlar. */
export interface ResultFilterOptions {
    faculties: { id: number; name: string }[];
    groups: { id: number; name: string; faculty_id: number; course?: number | null }[];
}

export type DiagnosisSum = {
    type: 'sum';
    total: number;
    label: string;
    description: string;
};

export type DiagnosisCategory = {
    type: 'category';
    scores: Record<string, number>;
    categories: Array<{ name: string; score: number; label: string; description: string }>;
};

export type Diagnosis = DiagnosisSum | DiagnosisCategory;

export interface TestResultResponse {
    id: number;
    method_id: number;
    user_id: number | null;
    answers: AnswerItem[];
    diagnosis: Diagnosis | null;
    created_at: string;
    updated_at: string;
    method?: MethodResponse;
    user?: TestResultUserInfo;
}

export interface TestResultListResponse {
    total: number;
    page: number;
    limit: number;
    results: TestResultResponse[];
}

// ── Statistika ──────────────────────────────────────────────────────────────

export interface StatsFilterParams {
    faculty_id?: number;
    group_id?: number;
    course?: number;
    /** YYYY-MM-DD, Toshkent sanasi; ikkala chegara kiradi. */
    date_from?: string;
    date_to?: string;
}

export interface StatsOverview {
    total_results: number;
    results_7d: number;
    results_30d: number;
    total_students: number;
    tested_students: number;
    coverage_pct: number;
    methods: Array<{ method_id: number; name: string; results: number; students: number }>;
    faculties: Array<{
        faculty_id: number;
        name: string;
        total_students: number;
        tested_students: number;
        coverage_pct: number;
    }>;
}

export interface LevelCount {
    label: string;
    count: number;
    pct: number;
    risk: boolean;
}

export interface MethodStats {
    method_id: number;
    name: string;
    scoring: 'sum' | 'category' | null;
    total: number;
    undetermined: number;
    levels: LevelCount[];
    histogram: Array<{ score: number; count: number }>;
    avg: number | null;
    min: number | null;
    max: number | null;
    categories: Array<{ name: string; avg: number | null; min: number | null; max: number | null; levels: LevelCount[] }>;
}

export type BreakdownBy = 'faculty' | 'course' | 'group';

export interface MethodBreakdown {
    by: BreakdownBy;
    category: string | null;
    labels: string[];
    risk_labels: string[];
    rows: Array<{
        key: number;
        name: string;
        total: number;
        avg: number | null;
        levels: Record<string, number>;
        risk_count: number;
        risk_pct: number;
    }>;
}

export interface RiskStudent {
    result_id: number;
    user_id: number;
    username: string | null;
    full_name: string | null;
    student_id_number: string | null;
    group_name: string | null;
    faculty_name: string | null;
    course: number | null;
    category: string | null;
    label: string;
    score: number | null;
    created_at: string;
}

export interface RiskList {
    total: number;
    risk_labels: string[];
    items: RiskStudent[];
}

export type TimelinePeriod = 'day' | 'week' | 'month';

export interface Timeline {
    period: TimelinePeriod;
    points: Array<{ bucket: string; count: number }>;
}

export interface UserHistory {
    user_id: number;
    full_name: string | null;
    username: string | null;
    items: Array<{
        result_id: number;
        method_id: number;
        method_name: string;
        created_at: string;
        label: string | null;
        score: number | null;
        categories: Array<{ name: string; score: number; label: string }>;
    }>;
}

export const psychologyService = {
    listMethods: async (page = 1, limit = 20) => {
        const response = await api.get<MethodListResponse>('/psychology/method/', { params: { page, limit } });
        return response.data;
    },

    getMethod: async (id: number) => {
        const response = await api.get<MethodResponse>(`/psychology/method/${id}`);
        return response.data;
    },

    createMethod: async (data: MethodCreateRequest) => {
        const response = await api.post<MethodResponse>('/psychology/method/', data);
        return response.data;
    },

    updateMethod: async (id: number, data: MethodUpdateRequest) => {
        const response = await api.put<MethodResponse>(`/psychology/method/${id}`, data);
        return response.data;
    },

    deleteMethod: async (id: number) => {
        await api.delete(`/psychology/method/${id}`);
    },

    createQuestion: async (data: QuestionCreateRequest) => {
        const response = await api.post<QuestionResponse>('/psychology/question/', data);
        return response.data;
    },

    updateQuestion: async (id: number, data: QuestionUpdateRequest) => {
        const response = await api.put<QuestionResponse>(`/psychology/question/${id}`, data);
        return response.data;
    },

    deleteQuestion: async (id: number) => {
        await api.delete(`/psychology/question/${id}`);
    },

    submitTest: async (methodId: number, data: TestSubmitRequest) => {
        const response = await api.post<TestResultResponse>(`/psychology/test/${methodId}/submit`, data);
        return response.data;
    },

    getResult: async (resultId: number) => {
        const response = await api.get<TestResultResponse>(`/psychology/test/results/${resultId}`);
        return response.data;
    },

    listMyResults: async (params?: ResultListParams) => {
        const response = await api.get<TestResultListResponse>('/psychology/test/results/', { params });
        return response.data;
    },

    getResultFilterOptions: async () => {
        const response = await api.get<ResultFilterOptions>('/psychology/test/results/filter-options');
        return response.data;
    },

    deleteResult: async (resultId: number) => {
        await api.delete(`/psychology/test/results/${resultId}`);
    },

    getStatsOverview: async (params: StatsFilterParams) => {
        const response = await api.get<StatsOverview>('/psychology/stats/overview', { params });
        return response.data;
    },

    getStatsTimeline: async (params: StatsFilterParams & { method_id?: number; period: TimelinePeriod }) => {
        const response = await api.get<Timeline>('/psychology/stats/timeline', { params });
        return response.data;
    },

    getMethodStats: async (methodId: number, params: StatsFilterParams & { latest_only?: boolean }) => {
        const response = await api.get<MethodStats>(`/psychology/stats/methods/${methodId}`, { params });
        return response.data;
    },

    getMethodBreakdown: async (
        methodId: number,
        params: StatsFilterParams & { by: BreakdownBy; category?: string; latest_only?: boolean },
    ) => {
        const response = await api.get<MethodBreakdown>(`/psychology/stats/methods/${methodId}/breakdown`, { params });
        return response.data;
    },

    getRiskStudents: async (
        methodId: number,
        params: StatsFilterParams & { labels?: string[]; category?: string; page?: number; limit?: number },
    ) => {
        const response = await api.get<RiskList>(`/psychology/stats/methods/${methodId}/risk`, {
            params,
            // FastAPI ro'yxatni `labels=a&labels=b` ko'rinishida kutadi.
            paramsSerializer: { indexes: null },
        });
        return response.data;
    },

    getUserHistory: async (userId: number, methodId?: number) => {
        const response = await api.get<UserHistory>(`/psychology/stats/users/${userId}/history`, {
            params: { method_id: methodId },
        });
        return response.data;
    },
};
