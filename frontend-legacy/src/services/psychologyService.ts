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

export interface TestResultUserInfo {
    id: number;
    username: string;
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

    listMyResults: async (params?: {
        method_id?: number;
        faculty_id?: number;
        group_id?: number;
        page?: number;
        limit?: number;
    }) => {
        const response = await api.get<TestResultListResponse>('/psychology/test/results/', { params });
        return response.data;
    },

    deleteResult: async (resultId: number) => {
        await api.delete(`/psychology/test/results/${resultId}`);
    },
};
