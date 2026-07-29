import api from './api';

export type SubmissionStatus = 'draft' | 'submitted' | 'late' | 'graded' | 'returned';

export interface SubmissionFile {
    name: string;
    url: string;
    size?: number | null;
    type?: string | null;
}

export interface AssignmentStats {
    total_students: number;
    submitted: number;
    graded: number;
    late: number;
}

export interface Assignment {
    id: number;
    sinf_id: number;
    topic_id?: number | null;
    lesson_id?: number | null;
    created_by_user_id?: number | null;
    title: string;
    description?: string | null;
    deadline: string;
    max_grade: number;
    allow_file: boolean;
    allow_text: boolean;
    allowed_file_types: string[];
    stats?: AssignmentStats | null;
    created_at: string;
    updated_at: string;
}

export interface AssignmentListResponse {
    total: number;
    page: number;
    limit: number;
    assignments: Assignment[];
}

export interface AssignmentCreateRequest {
    sinf_id: number;
    topic_id?: number | null;
    lesson_id?: number | null;
    title: string;
    description?: string | null;
    deadline: string;
    max_grade?: number;
    allow_file?: boolean;
    allow_text?: boolean;
    allowed_file_types?: string[];
}

export interface AssignmentUpdateRequest {
    topic_id?: number | null;
    lesson_id?: number | null;
    title?: string;
    description?: string | null;
    deadline?: string;
    max_grade?: number;
    allow_file?: boolean;
    allow_text?: boolean;
    allowed_file_types?: string[];
}

export interface SubmissionUserInfo {
    id: number;
    username: string;
    full_name?: string | null;
}

export interface Submission {
    id: number;
    assignment_id: number;
    user_id: number;
    submitted_text?: string | null;
    submitted_files: SubmissionFile[];
    submitted_at?: string | null;
    status: SubmissionStatus;
    grade?: number | null;
    feedback?: string | null;
    graded_at?: string | null;
    user?: SubmissionUserInfo | null;
    created_at: string;
    updated_at: string;
}

export interface SubmissionListResponse {
    submissions: Submission[];
}

export interface SubmissionSubmitRequest {
    submitted_text?: string | null;
    submitted_files: SubmissionFile[];
}

export interface SubmissionGradeRequest {
    grade: number;
    feedback?: string | null;
}

export const assignmentService = {
    list: async (params?: { sinf_id?: number; topic_id?: number; lesson_id?: number; page?: number; limit?: number }) => {
        const response = await api.get<AssignmentListResponse>('/assignment/', { params });
        return response.data;
    },
    getById: async (id: number) => {
        const response = await api.get<Assignment>(`/assignment/${id}`);
        return response.data;
    },
    create: async (data: AssignmentCreateRequest) => {
        const response = await api.post<Assignment>('/assignment/', data);
        return response.data;
    },
    update: async (id: number, data: AssignmentUpdateRequest) => {
        const response = await api.put<Assignment>(`/assignment/${id}`, data);
        return response.data;
    },
    delete: async (id: number) => {
        await api.delete(`/assignment/${id}`);
    },

    submit: async (assignmentId: number, data: SubmissionSubmitRequest) => {
        const response = await api.post<Submission>(`/assignment/${assignmentId}/submit`, data);
        return response.data;
    },
    getMySubmission: async (assignmentId: number): Promise<Submission | null> => {
        try {
            const response = await api.get<Submission>(`/assignment/${assignmentId}/my-submission`);
            return response.data;
        } catch (e: unknown) {
            const status = (e as { response?: { status?: number } } | null)?.response?.status;
            if (status === 404) return null;
            throw e;
        }
    },
    listSubmissions: async (assignmentId: number) => {
        const response = await api.get<SubmissionListResponse>(`/assignment/${assignmentId}/submissions`);
        return response.data;
    },
    grade: async (assignmentId: number, userId: number, data: SubmissionGradeRequest) => {
        const response = await api.put<Submission>(
            `/assignment/${assignmentId}/submission/${userId}/grade`,
            data,
        );
        return response.data;
    },
};
