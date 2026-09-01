import api from './api';

/**
 * EPOS yuklamasi: kim, qaysi guruhga, qaysi fandan dars beradi.
 *
 * Faqat oʻqish. Yozish sinxronizatsiyaning ishi — bu yerdan qoʻlda
 * oʻzgartirish keyingi progn tomonidan jimgina qaytarilardi.
 *
 * `assignmentService` bilan chalkashtirmaslik kerak: u uy vazifalari haqida,
 * bu esa oʻqituvchining oʻquv yuklamasi.
 */

export interface TeacherAssignment {
    id: number;

    teacher_id: number;
    teacher_name: string;

    subject_id: number;
    subject_name: string;

    group_id: number;
    group_name: string;

    kafedra_id: number | null;
    kafedra_name: string | null;

    /** Maʼruza, amaliyot, laboratoriya. EPOS bermasa — boʻsh roʻyxat. */
    load_types: string[];
    semester_type: string | null;
    academic_year_id: number | null;

    is_active: boolean;
}

export interface TeacherAssignmentListParams {
    teacher_id?: number;
    subject_id?: number;
    group_id?: number;
    kafedra_id?: number;
    load_type?: string;
    search?: string;
    /** EPOS'dan yoʻqolganlar oʻchirilmaydi, nofaol qilinadi. */
    include_inactive?: boolean;
    page?: number;
    limit?: number;
}

export interface TeacherAssignmentListResponse {
    items: TeacherAssignment[];
    total: number;
    page: number;
    limit: number;
}

export const teacherAssignmentService = {
    list: async (params: TeacherAssignmentListParams) => {
        const response = await api.get<TeacherAssignmentListResponse>('/teacher-assignment/', {
            params,
        });
        return response.data;
    },
};
