import api from './api';

/**
 * Fayl yuklash limitlarini boshqarish (admin).
 *
 * Ikki daraja: umumiy limit hammaga, individual limit bitta o'qituvchiga.
 * Individual limit bo'lsa, u ustun. Barcha qiymatlar baytda.
 */

export interface QuotaDefault {
    limit_bytes: number;
    min_limit_bytes: number;
    max_limit_bytes: number;
}

export interface TeacherQuota {
    user_id: number;
    full_name: string;
    kafedra_name: string | null;
    /** Individual limit; null bo'lsa umumiy limit ishlaydi. */
    custom_limit_bytes: number | null;
    /** Amaldagi limit; null — cheklanmagan (admin). */
    limit_bytes: number | null;
    used_bytes: number;
    remaining_bytes: number | null;
    /** Limit ishlatilgan hajmdan past qilingan bo'lsa — qanchaga oshgan. */
    over_limit_bytes: number;
    file_count: number;
    is_custom: boolean;
    is_unlimited: boolean;
}

export type TeacherQuotaSort = 'used_desc' | 'remaining_asc' | 'name';

export interface TeacherQuotaListParams {
    search?: string;
    kafedra_id?: number;
    sort?: TeacherQuotaSort;
    page?: number;
    size?: number;
}

export interface TeacherQuotaListResponse {
    items: TeacherQuota[];
    total: number;
    page: number;
    size: number;
    default_limit_bytes: number;
}

export const fileQuotaService = {
    getDefault: async () => {
        const response = await api.get<QuotaDefault>('/file/quota/default');
        return response.data;
    },

    updateDefault: async (limitBytes: number) => {
        const response = await api.put<QuotaDefault>('/file/quota/default', { limit_bytes: limitBytes });
        return response.data;
    },

    listTeachers: async (params: TeacherQuotaListParams) => {
        const response = await api.get<TeacherQuotaListResponse>('/file/quota/teachers', { params });
        return response.data;
    },

    /** `null` — individual limitni olib tashlash, umumiy limitga qaytarish. */
    updateTeacher: async (userId: number, limitBytes: number | null) => {
        await api.put(`/file/quota/teachers/${userId}`, { limit_bytes: limitBytes });
    },
};
