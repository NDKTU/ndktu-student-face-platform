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
    course_id: number;
    /** Umumiy ro'yxatda vazifani ajratish uchun — qaysi kurs, qaysi dars. */
    course_name?: string | null;
    lesson_id?: number | null;
    lesson_topic?: string | null;
    created_by_user_id?: number | null;
    /** Vazifani kim bergani — ism topilmasa, `username`. */
    created_by_name?: string | null;
    title: string;
    description?: string | null;
    deadline: string;
    max_grade: number;
    allow_file: boolean;
    allow_text: boolean;
    allowed_file_types: string[];
    /** O'qituvchi biriktirgan fayllar (shart, namuna, tarqatma material). */
    attachments: SubmissionFile[];
    stats?: AssignmentStats | null;
    created_at: string;
    updated_at: string;
}

export interface AssignmentListResponse {
    total: number;
    page: number;
    limit: number;
    homeworks: Assignment[];
}

export interface AssignmentCreateRequest {
    course_id: number;
    lesson_id?: number | null;
    title: string;
    description?: string | null;
    deadline: string;
    max_grade?: number;
    allow_file?: boolean;
    allow_text?: boolean;
    allowed_file_types?: string[];
    attachments?: SubmissionFile[];
}

export interface AssignmentUpdateRequest {
    lesson_id?: number | null;
    title?: string;
    description?: string | null;
    deadline?: string;
    max_grade?: number;
    allow_file?: boolean;
    allow_text?: boolean;
    allowed_file_types?: string[];
    attachments?: SubmissionFile[];
}

export interface SubmissionUserInfo {
    id: number;
    username: string;
    full_name?: string | null;
    /** Talaba guruhi — bitta kursda bir nechta guruh bo'ladi. */
    group?: string | null;
}

export interface Submission {
    id: number;
    homework_id: number;
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
    list: async (params?: { course_id?: number; lesson_id?: number; page?: number; limit?: number }) => {
        const response = await api.get<AssignmentListResponse>('/homework/', { params });
        return response.data;
    },
    getById: async (id: number) => {
        const response = await api.get<Assignment>(`/homework/${id}`);
        return response.data;
    },
    create: async (data: AssignmentCreateRequest) => {
        const response = await api.post<Assignment>('/homework/', data);
        return response.data;
    },
    update: async (id: number, data: AssignmentUpdateRequest) => {
        const response = await api.put<Assignment>(`/homework/${id}`, data);
        return response.data;
    },
    delete: async (id: number) => {
        await api.delete(`/homework/${id}`);
    },

    /** Talaba javob faylini yuklaydi. `/resource/upload` unga yopiq — u yerda
     *  `create:resource` huquqi talab qilinadi. */
    uploadSubmissionFile: async (assignmentId: number, file: File) => {
        const form = new FormData();
        form.append('file', file);
        const response = await api.post<SubmissionFile>(`/homework/${assignmentId}/upload`, form);
        return response.data;
    },
    submit: async (assignmentId: number, data: SubmissionSubmitRequest) => {
        const response = await api.post<Submission>(`/homework/${assignmentId}/submit`, data);
        return response.data;
    },
    getMySubmission: async (assignmentId: number): Promise<Submission | null> => {
        try {
            const response = await api.get<Submission>(`/homework/${assignmentId}/my-submission`);
            return response.data;
        } catch (e: unknown) {
            const status = (e as { response?: { status?: number } } | null)?.response?.status;
            if (status === 404) return null;
            throw e;
        }
    },
    listSubmissions: async (assignmentId: number) => {
        const response = await api.get<SubmissionListResponse>(`/homework/${assignmentId}/submissions`);
        return response.data;
    },
    grade: async (assignmentId: number, userId: number, data: SubmissionGradeRequest) => {
        const response = await api.put<Submission>(
            `/homework/${assignmentId}/submission/${userId}/grade`,
            data,
        );
        return response.data;
    },
};
