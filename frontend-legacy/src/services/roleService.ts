import api from './api';

export interface RolePermission {
    id: number;
    name: string;
}

export interface Role {
    id: number;
    name: string;
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

    createRole: async (data: { name: string }) => {
        const response = await api.post('/role/', data);
        return response.data;
    },

    updateRole: async (id: number, data: { name: string }) => {
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
