import api from './api';

export interface Permission {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface PermissionListResponse {
    total: number;
    page: number;
    limit: number;
    permissions: Permission[];
}

// Ruxsatlar backend'da route'lardan topiladi va qo'lda o'zgartirilmaydi —
// shuning uchun bu servisda faqat o'qish metodlari bor.
export const permissionService = {
    getPermissions: async (page = 1, limit = 100, name?: string) => {
        const response = await api.get<PermissionListResponse>('/permission/', {
            params: { page, limit, name },
        });
        return response.data;
    },

    getPermissionById: async (id: number): Promise<Permission> => {
        const response = await api.get<Permission>(`/permission/${id}`);
        return response.data;
    },
};
