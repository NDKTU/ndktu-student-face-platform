import api from './api';

export interface RolePermission {
    id: number;
    name: string;
}

/**
 * Rol kimning ma'lumotini ko'radi (`backend/app/core/utils/data_scope.py`).
 * Ruxsat sahifani ochadi, doira esa unda qaysi satrlar ko'rinishini belgilaydi.
 */
export type DataScope = 'all' | 'faculty' | 'kafedra' | 'assigned_groups' | 'own';

/** Kengdan torga — tanlash ro'yxatidagi tartib. */
export const DATA_SCOPE_OPTIONS: { value: DataScope; label: string; hint: string }[] = [
    { value: 'all', label: 'Butun universitet', hint: "Barcha talabalar, natijalar va psixologik testlar" },
    { value: 'faculty', label: "O'z fakulteti", hint: 'Foydalanuvchiga biriktirilgan fakultet(lar)' },
    {
        value: 'kafedra',
        label: "O'z kafedrasi",
        hint: "Kafedra guruhlari va kafedra o'qituvchilari tuzgan testlar",
    },
    {
        value: 'assigned_groups',
        label: 'Biriktirilgan guruhlar',
        hint: "O'qituvchi dars o'tadigan va qo'lda biriktirilgan guruhlar",
    },
    { value: 'own', label: "Faqat o'zi", hint: "Faqat o'z ma'lumotlari" },
];

export const dataScopeLabel = (scope?: DataScope) =>
    DATA_SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? '-';

export interface Role {
    id: number;
    name: string;
    data_scope?: DataScope;
    created_at?: string;
    updated_at?: string;
    permissions?: RolePermission[];
}

export interface RoleListResponse {
    total: number;
    page: number;
    limit: number;
    roles: Role[];
}

export const roleService = {
    getRoles: async (page = 1, limit = 100, name?: string) => {
        const response = await api.get<RoleListResponse>('/role/', {
            params: { page, limit, name },
        });
        return response.data;
    },

    getRoleById: async (id: number): Promise<Role> => {
        const response = await api.get<Role>(`/role/${id}`);
        return response.data;
    },

    createRole: async (data: { name: string; data_scope?: DataScope }) => {
        const response = await api.post('/role/', data);
        return response.data;
    },

    updateRole: async (id: number, data: { name: string; data_scope?: DataScope }) => {
        const response = await api.put(`/role/${id}`, data);
        return response.data;
    },

    deleteRole: async (id: number) => {
        await api.delete(`/role/${id}`);
    },

    assignPermissions: async (role_id: number, permission_ids: number[]) => {
        const response = await api.post('/role/assign_permission', { role_id, permission_ids });
        return response.data;
    },
};
