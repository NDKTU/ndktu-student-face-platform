import api from './api';

/**
 * `rejected` — o'qituvchi ishni baholamay rad etdi (sababi `feedback` da);
 * `returned` — baholangan ishni qayta topshirishga qaytardi, eski baho turadi.
 * Ikkalasida ham talaba yangi javob yubora oladi.
 */
export type SubmissionStatus = 'draft' | 'submitted' | 'late' | 'graded' | 'returned' | 'rejected';

/** Ish talabaga qaytgan — u qayta topshira oladi. */
export const isReopened = (status: SubmissionStatus | undefined | null): boolean =>
    status === 'rejected' || status === 'returned';

/** Avvalgi urinish — talaba qayta topshirgach saqlanadi. */
export interface SubmissionAttempt {
    submitted_text?: string | null;
    submitted_files: SubmissionFile[];
    submitted_at?: string | null;
    /** Urinish qanday yopilgan: `rejected` yoki `returned`. */
    status: SubmissionStatus;
    grade?: number | null;
    feedback?: string | null;
    graded_at?: string | null;
}

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

/** Talabaning shu vazifadagi o'z holati (faqat ro'yxatda, ish bo'lsa). */
export interface MySubmissionInfo {
    status: SubmissionStatus;
    grade?: number | null;
    submitted_at?: string | null;
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
    my_submission?: MySubmissionInfo | null;
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
    /** Ixtiyoriy: bo'sh bo'lsa, bekend dars mavzusini nom qilib qo'yadi. */
    title?: string;
    description?: string | null;
    deadline: string;
    max_grade?: number;
    attachments?: SubmissionFile[];
}

export interface AssignmentUpdateRequest {
    lesson_id?: number | null;
    title?: string;
    description?: string | null;
    deadline?: string;
    max_grade?: number;
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
    /** Kechikish shundan hisoblanadi: qayta topshirishni o'qituvchi so'ragan. */
    first_submitted_at?: string | null;
    /** Avvalgi urinishlar, eskisidan yangisiga. */
    attempts?: SubmissionAttempt[];
    user?: SubmissionUserInfo | null;
    created_at: string;
    updated_at: string;
}

export interface NotSubmittedStudent {
    user_id: number;
    full_name?: string | null;
    group?: string | null;
}

export interface SubmissionListResponse {
    submissions: Submission[];
    /** Kurs guruhlaridagi, hali ish topshirmagan talabalar. */
    not_submitted?: NotSubmittedStudent[];
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
    /** Baholamay rad etish — sabab majburiy, talaba qayta yuboradi. */
    reject: async (assignmentId: number, userId: number, reason: string) => {
        const response = await api.put<Submission>(
            `/homework/${assignmentId}/submission/${userId}/reject`,
            { reason },
        );
        return response.data;
    },
    /** Baholangan ishni qayta topshirishga qaytarish; eski baho yangisi qo'yilguncha turadi. */
    returnForResubmit: async (assignmentId: number, userId: number, comment?: string | null) => {
        const response = await api.put<Submission>(
            `/homework/${assignmentId}/submission/${userId}/return`,
            { comment: comment || null },
        );
        return response.data;
    },
};
