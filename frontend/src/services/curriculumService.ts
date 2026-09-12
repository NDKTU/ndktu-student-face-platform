import api from './api';

/**
 * O'quv reja — EPMOS ko'zgusi.
 *
 * Faqat o'qish uchun: rejalar sinxronizatsiya orqali keladi va qo'lda
 * tahrirlanmaydi — keyingi progn o'zgarishni jimgina qaytarib qo'yardi.
 * Shuning uchun bu servisda create/update/delete yo'q.
 */
export interface Curriculum {
    id: number;
    name: string;
    speciality_id?: number | null;
    kafedra_id?: number | null;
    faculty_id?: number | null;
    /** EPMOS: Kunduzgi | Kechki | Sirtqi */
    education_form?: string | null;
    /** EPMOS: Bakalavr | Magistr */
    education_type?: string | null;
    created_at: string;
    updated_at: string;
    external_id?: string | null;
    // Ko'zgu belgilari: manba ko'rsatilgan bo'lsa, yozuv tahrirlanmaydi.
    external_source?: string | null;
    synced_at?: string | null;
    is_active?: boolean;
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    // /** Admin yashirgan. `is_active` dan alohida: u sinxronizatsiyaniki. */
    // is_hidden?: boolean;
}

export interface CurriculumListResponse {
    total: number;
    page: number;
    limit: number;
    curriculums: Curriculum[];
}

export interface CurriculumFilters {
    page?: number;
    limit?: number;
    name?: string;
    speciality_id?: number;
    kafedra_id?: number;
    faculty_id?: number;
    education_form?: string;
    education_type?: string;
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    // includeHidden?: boolean;
}

export const curriculumService = {
    getCurriculums: async (filters: CurriculumFilters = {}) => {
        const { page = 1, limit = 50, ...rest } = filters;
        const response = await api.get<CurriculumListResponse>('/curriculum/', {
            params: { page, limit, ...rest },
        });
        return response.data;
    },

    getCurriculumById: async (id: number): Promise<Curriculum> => {
        const response = await api.get<Curriculum>(`/curriculum/${id}`);
        return response.data;
    },

    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    // setVisibility: async (id: number, isHidden: boolean) => {
    //     const response = await api.patch<{ id: number; is_hidden: boolean }>(
    //         `/curriculum/${id}/visibility`,
    //         { is_hidden: isHidden },
    //     );
    //     return response.data;
    // },
};
